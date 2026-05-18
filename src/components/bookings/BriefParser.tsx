'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { parseBriefAction, applyBriefSuggestionsAction, draftClarifyingEmailAction } from '@/app/actions/bookings';
import { PALETTE } from '@/lib/utils/constants';
import type { BriefIntakeResult } from '@/lib/automation/brief-intake';

type Props = {
  bookingId: string;
  hasBriefText: boolean;
  currentState: string;
  /**
   * Trigger a parse immediately on mount. Used when navigating from the
   * StageChecklist "Parse brief" CTA via `?action=parse#brief-parser` —
   * lets the user one-click from the top of the page to a running parse.
   */
  autoParseOnMount?: boolean;
};

// Subset of brief-intake fields we expose for review. Intentionally excludes
// talent_count and budget_indication — both removed from the app per Jasper's
// direction. Heuristic parser still extracts them, we just don't surface them.
//
// title_suggestion + post_production_ownership added 2026-05-18 — LLM-only
// fields (heuristic won't fill them) that map to existing booking columns.
const FIELD_LABELS = {
  title_suggestion: 'Title (Campaign)',
  shoot_location: 'Shoot Location',
  shoot_date_start: 'Shoot Start Date',
  shoot_date_end: 'Shoot End Date',
  shoot_date_notes: 'Date Notes',
  deliverables_type: 'Deliverables Type',
  deliverables_count: 'Deliverables Count',
  post_production_ownership: 'Post-Production',
} as const;
type FieldKey = keyof typeof FIELD_LABELS;

const POST_PROD_LABELS: Record<string, string> = {
  us_via_artist: 'Us — via artist',
  us_via_post_team: 'Us — via post team',
  client_in_house: 'Client (in-house)',
  client_outsourced: 'Client (outsourced)',
};

/**
 * Strip syntactic noise from an LLM critique line. The model sometimes
 * leaks JSON-array fragments (leading/trailing quotes, commas, code
 * fences) even though the prompt says "plain English". Belt-and-braces
 * cleanup so the operator never sees ```json or trailing quote-comma.
 *
 * Returns null when the line is pure syntax (just a fence or bracket),
 * which the caller drops from the render.
 */
function cleanCritique(raw: string): string | null {
  let s = raw.trim();
  // Drop pure fence/bracket lines
  if (/^[`{}\[\],]+$/.test(s) || /^```/.test(s)) return null;
  // Strip leading "field_name:" coding references — convert to plain
  // English by capitalising the prefix.
  s = s.replace(/^["'`]+/, '').replace(/["'`,]+$/, '').trim();
  if (s.length < 4) return null;
  return s;
}

/**
 * Render a suggestion value as a short human string. Anchored to the
 * allowlist above — if the field shape changes (e.g. a date becomes
 * an ISO timestamp), update this formatter rather than letting the
 * raw value leak into the UI.
 */
function formatSuggestionValue(key: FieldKey, value: unknown): string {
  if (value == null) return '';
  if ((key === 'shoot_date_start' || key === 'shoot_date_end') && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    try {
      return new Date(`${value}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return value;
    }
  }
  if (key === 'deliverables_count' && typeof value === 'number') {
    return `${value} ${value === 1 ? 'deliverable' : 'deliverables'}`;
  }
  if (key === 'post_production_ownership' && typeof value === 'string') {
    return POST_PROD_LABELS[value] ?? value;
  }
  if (typeof value === 'object') {
    // Defensive: should never happen given the allowlist, but if it does
    // we want a readable surface — not "[object Object]".
    try { return JSON.stringify(value); } catch { return '—'; }
  }
  return String(value);
}

// Key fields that warrant clarification if missing
const KEY_FIELDS: Record<string, string> = {
  shoot_location: 'shoot_location',
  shoot_date_start: 'shoot_dates',
  shoot_date_notes: 'shoot_dates',
  deliverables_type: 'deliverables_type',
};

export default function BriefParser({ bookingId, hasBriefText, currentState, autoParseOnMount = false }: Props) {
  const [parsing, setParsing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [suggestions, setSuggestions] = useState<BriefIntakeResult | null>(null);
  const [selected, setSelected] = useState<Set<FieldKey>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [clarifyResult, setClarifyResult] = useState<{ mode: string; body?: string } | null>(null);
  const autoParsedRef = useRef(false);

  async function handleParse() {
    setParsing(true);
    setError(null);
    setSuggestions(null);
    setSuccess(false);

    const result = await parseBriefAction(bookingId);
    setParsing(false);

    if ('error' in result && result.error) {
      setError(result.error);
      return;
    }

    const s = (result as { ok: true; suggestions: BriefIntakeResult }).suggestions;
    setSuggestions(s);

    // Auto-select non-null fields from the displayed allowlist only.
    // Denylist filtering bit us before: new BriefIntakeResult fields (e.g.
    // `contract`) leaked through and rendered as "[object Object]". Anchor
    // to FIELD_LABELS instead so the UI only ever shows what we explicitly
    // surface.
    const nonNull = (Object.keys(FIELD_LABELS) as FieldKey[])
      .filter((k) => (s as Record<string, unknown>)[k] != null);
    setSelected(new Set(nonNull));
  }

  async function handleApply() {
    if (!suggestions) return;
    setApplying(true);
    setError(null);

    const fd = new FormData();
    for (const key of selected) {
      const val = suggestions[key];
      if (val != null) {
        // The LLM exposes title under `title_suggestion` (so it doesn't
        // overwrite the existing title until the user opts in); the
        // booking column is just `title`. Map on the way out.
        const fieldName = key === 'title_suggestion' ? 'title' : key;
        fd.set(fieldName, String(val));
      }
    }

    // Structured usage taxonomy (LLM-only fields). Sent automatically
    // when present — they don't appear as user-selectable checkboxes
    // because they're an indivisible block ("you can't take the market
    // without the realm" doesn't make sense). All-or-nothing apply.
    if (suggestions.usage_market) fd.set('usage_market', suggestions.usage_market);
    if (suggestions.usage_realm) fd.set('usage_realm', suggestions.usage_realm);
    if (suggestions.usage_media_categories?.length) {
      fd.set('usage_media_categories', suggestions.usage_media_categories.join(','));
    }
    if (suggestions.usage_specific_channels?.length) {
      fd.set('usage_specific_channels', suggestions.usage_specific_channels.join(','));
    }
    if (suggestions.usage_territory_iso?.length) {
      fd.set('usage_territory_iso', suggestions.usage_territory_iso.join(','));
    }

    const result = await applyBriefSuggestionsAction(bookingId, fd);
    setApplying(false);

    if ('error' in result && result.error) {
      setError(result.error);
      return;
    }

    setSuccess(true);
    setSuggestions(null);
  }

  async function handleDraftClarify(missingFields: string[]) {
    setDrafting(true);
    setClarifyResult(null);
    setError(null);
    const result = await draftClarifyingEmailAction(bookingId, missingFields);
    setDrafting(false);
    if ('error' in result) {
      setError(result.error ?? 'Unknown error');
      return;
    }
    setClarifyResult(result);
  }

  // Auto-parse when arriving from the StageChecklist "Parse brief" CTA
  // (which navigates to ?action=parse#brief-parser). One-click flow:
  // operator sees "Parse brief" at the top, clicks, lands here with the
  // parse already running.
  useEffect(() => {
    if (autoParseOnMount && hasBriefText && !autoParsedRef.current && !parsing && !suggestions) {
      autoParsedRef.current = true;
      void handleParse();
    }
    // handleParse closes over component state; safe to omit as a dep
    // because we guard with autoParsedRef so it only fires once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoParseOnMount, hasBriefText]);

  if (!hasBriefText) return null;

  // Allowlist-driven: only iterate the fields we explicitly surface.
  // Keeps us safe from BriefIntakeResult growing new shapes (e.g. the
  // `contract` object that previously rendered as "[object Object]").
  const dataKeys = (Object.keys(FIELD_LABELS) as FieldKey[]);
  const hasSuggestions = !!suggestions && dataKeys.some((k) => (suggestions as Record<string, unknown>)[k] != null);

  // Detect which key fields the parser could NOT extract — these are candidates for a clarifying email
  const missingKeyFields = suggestions
    ? (() => {
        const seen = new Set<string>();
        const missing: string[] = [];
        for (const [field, clarifyKey] of Object.entries(KEY_FIELDS)) {
          if (seen.has(clarifyKey)) continue;
          if ((suggestions as Record<string, unknown>)[field] == null) {
            missing.push(clarifyKey);
            seen.add(clarifyKey);
          }
        }
        return missing;
      })()
    : [];

  return (
    <div id="brief-parser" className="rounded-lg border p-4 space-y-3" style={{ background: PALETTE.surface, borderColor: PALETTE.border, scrollMarginTop: 80 }}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="section-title">Brief Auto-Parser</h3>
          <p className="text-[11px] mt-0.5" style={{ color: PALETTE.muted }}>
            Extract structured fields from the raw brief text.
            {suggestions?.llmAvailable && (
              <span style={{ color: PALETTE.success }}> · AI-enhanced ({suggestions.confidence}% confidence)</span>
            )}
          </p>
        </div>
        {!parsing && (
          <button
            onClick={handleParse}
            disabled={parsing}
            className="rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            style={{ background: PALETTE.accent, color: PALETTE.bg, border: 'none', cursor: 'pointer' }}
          >
            {suggestions || success ? '↻ Re-parse' : '⚡ Parse Brief'}
          </button>
        )}
        {parsing && (
          <button
            disabled
            className="rounded px-3 py-1.5 text-xs font-medium opacity-50"
            style={{ background: PALETTE.accent, color: PALETTE.bg, border: 'none' }}
          >
            Parsing…
          </button>
        )}
      </div>

      {/* Mode banner — promoted from a small grey footer line. Heuristic-only
          mode misses anything that needs reasoning (e.g. "22 May" → date),
          so we surface it prominently with the fix. */}
      {suggestions?.llmAvailable === false && (
        <div
          className="rounded px-3 py-2 text-xs"
          style={{ background: `${PALETTE.warning}15`, borderLeft: `3px solid ${PALETTE.warning}`, color: PALETTE.text }}
        >
          <span style={{ fontWeight: 600, color: PALETTE.warning }}>Heuristic mode</span>
          <span style={{ color: PALETTE.muted }}>
            {' '}— AI extraction is off. The regex parser misses dates without a year, structured deliverables, and natural-language usage terms. Set <code style={{ fontFamily: 'monospace' }}>ANTHROPIC_API_KEY</code> in the deployment environment to enable AI extraction.{' '}
            <Link href="/settings#integrations" style={{ color: PALETTE.warning, textDecoration: 'underline' }}>
              Check status →
            </Link>
          </span>
        </div>
      )}

      {error && (
        <div className="rounded px-3 py-2 text-xs" style={{ color: PALETTE.danger, background: `${PALETTE.danger}11` }}>
          {error}
        </div>
      )}

      {success && (
        <div className="rounded px-3 py-2 text-xs" style={{ color: PALETTE.success, background: `${PALETTE.success}11` }}>
          ✓ Suggestions applied to booking.{currentState === 'brief_received' && ' State advanced to Brief Parsed.'}
        </div>
      )}

      {clarifyResult && (
        <div className="rounded px-3 py-2 text-xs space-y-2" style={{ color: PALETTE.success, background: `${PALETTE.success}11` }}>
          {clarifyResult.mode === 'drafted' && (
            <p>✓ Clarifying email saved as Gmail draft. Open Gmail to review and send.</p>
          )}
          {clarifyResult.mode === 'no_google' && (
            <>
              <p>Google not connected — copy the draft below:</p>
              <pre className="text-[10px] whitespace-pre-wrap rounded p-2" style={{ background: PALETTE.bgSoft, color: PALETTE.text, fontFamily: 'monospace' }}>
                {clarifyResult.body}
              </pre>
            </>
          )}
        </div>
      )}

      {suggestions && !success && (
        <>
          {/* Critique / uncertainty warnings. Each line is stripped of
              syntactic noise (quotes, trailing commas, code fences) and
              rendered as a plain bullet. The LLM is instructed to return
              plain-English critique sentences but occasionally leaks
              JSON-shaped output — `cleanCritique()` belts-and-braces it. */}
          {(suggestions.critique?.length > 0 || suggestions.uncertainty_sources?.length > 0) && (
            <div className="rounded px-3 py-2 text-xs space-y-1" style={{ background: `${PALETTE.warning}11`, borderLeft: `2px solid ${PALETTE.warning}` }}>
              <div className="font-semibold text-[10px] uppercase tracking-wide" style={{ color: PALETTE.warning }}>
                Extraction concerns
              </div>
              {suggestions.uncertainty_sources?.map((s, i) => (
                <div key={`u-${i}`} style={{ color: PALETTE.warning }}>· {s}</div>
              ))}
              {suggestions.critique?.map((c, i) => {
                const cleaned = cleanCritique(c);
                if (!cleaned) return null;
                return (
                  <div key={`c-${i}`} style={{ color: PALETTE.text }}>· {cleaned}</div>
                );
              })}
            </div>
          )}

          {!hasSuggestions ? (
            <p className="text-xs" style={{ color: PALETTE.muted }}>
              No structured fields could be extracted from this brief. Try editing the text or entering fields manually.
            </p>
          ) : (
            <>
              <p className="text-xs" style={{ color: PALETTE.muted }}>
                Select the fields you want to apply. Existing values will be overwritten.
              </p>
              <div className="space-y-1.5">
                {dataKeys
                  .filter((k) => (suggestions as Record<string, unknown>)[k] != null)
                  .map((key) => (
                    <label
                      key={key}
                      className="flex items-center gap-2.5 cursor-pointer rounded px-2.5 py-1.5"
                      style={{ background: selected.has(key) ? `${PALETTE.accent}15` : 'transparent' }}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(key);
                          else next.delete(key);
                          setSelected(next);
                        }}
                        style={{ accentColor: PALETTE.accent }}
                      />
                      <span style={{ color: PALETTE.muted, fontSize: 11, minWidth: 160 }}>
                        {FIELD_LABELS[key]}
                      </span>
                      <span style={{ color: PALETTE.text, fontSize: 13, fontWeight: 500 }}>
                        {formatSuggestionValue(key, (suggestions as Record<string, unknown>)[key])}
                      </span>
                    </label>
                  ))}
              </div>

              {/* Structured usage taxonomy preview — LLM-only fields. Shown
                  as read-only chips. Applied automatically with the rest. */}
              {(suggestions.usage_market || suggestions.usage_realm ||
                suggestions.usage_media_categories?.length ||
                suggestions.usage_specific_channels?.length ||
                suggestions.usage_territory_iso?.length) && (
                <div className="rounded border px-3 py-2 space-y-1.5" style={{ borderColor: PALETTE.border, background: `${PALETTE.accent}08` }}>
                  <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
                    Detected usage taxonomy
                  </div>
                  <div className="flex flex-wrap gap-1.5 items-center">
                    {suggestions.usage_market && (
                      <span className="rounded px-2 py-0.5 text-[11px]" style={{ background: `${PALETTE.accent}22`, color: PALETTE.accent }}>
                        {suggestions.usage_market}
                      </span>
                    )}
                    {suggestions.usage_realm && (
                      <span className="rounded px-2 py-0.5 text-[11px]" style={{ background: `${PALETTE.accent}22`, color: PALETTE.accent }}>
                        {suggestions.usage_realm}
                      </span>
                    )}
                    {suggestions.usage_media_categories?.map((c) => (
                      <span key={c} className="rounded px-2 py-0.5 text-[11px]" style={{ background: `${PALETTE.warning}22`, color: PALETTE.warning }}>
                        {c}
                      </span>
                    ))}
                    {suggestions.usage_territory_iso?.map((t) => (
                      <span key={t} className="rounded px-2 py-0.5 text-[11px] font-mono" style={{ background: `${PALETTE.success}22`, color: PALETTE.success }}>
                        {t}
                      </span>
                    ))}
                  </div>
                  {suggestions.usage_specific_channels && suggestions.usage_specific_channels.length > 0 && (
                    <div className="flex flex-wrap gap-1 items-center pt-0.5">
                      <span className="text-[10px]" style={{ color: PALETTE.muted }}>Channels:</span>
                      {suggestions.usage_specific_channels.map((c) => (
                        <span key={c} className="text-[10px] font-mono" style={{ color: PALETTE.muted }}>
                          {c}
                        </span>
                      )).reduce<React.ReactNode[]>((acc, el, i) => i === 0 ? [el] : [...acc, <span key={`sep-${i}`} style={{ color: PALETTE.muted }}>·</span>, el], [])}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={handleApply}
                  disabled={applying || selected.size === 0}
                  className="rounded px-4 py-1.5 text-xs font-medium disabled:opacity-40"
                  style={{ background: PALETTE.accent, color: PALETTE.bg, border: 'none', cursor: 'pointer' }}
                >
                  {applying ? 'Applying…' : (() => {
                    // Count the structured-usage taxonomy as one indivisible
                    // "block" because it applies as a unit (you can't take
                    // market without realm). Surfaces "Apply 5 fields + usage"
                    // when both apply, so the button label matches reality.
                    const hasStructuredUsage = !!(suggestions.usage_market || suggestions.usage_realm ||
                      suggestions.usage_media_categories?.length ||
                      suggestions.usage_specific_channels?.length ||
                      suggestions.usage_territory_iso?.length);
                    const fieldsLabel = `Apply ${selected.size} field${selected.size !== 1 ? 's' : ''}`;
                    return hasStructuredUsage ? `${fieldsLabel} + usage` : fieldsLabel;
                  })()}
                </button>
                {missingKeyFields.length > 0 && !clarifyResult && (
                  <button
                    onClick={() => handleDraftClarify(missingKeyFields)}
                    disabled={drafting}
                    className="rounded px-4 py-1.5 text-xs font-medium disabled:opacity-40"
                    style={{ background: `${PALETTE.warning}22`, color: PALETTE.warning, border: `1px solid ${PALETTE.warning}44`, cursor: 'pointer' }}
                  >
                    {drafting ? 'Drafting…' : `✉ Draft Clarifying Email (${missingKeyFields.length} gap${missingKeyFields.length !== 1 ? 's' : ''})`}
                  </button>
                )}
                <button
                  onClick={() => { setSuggestions(null); setError(null); setClarifyResult(null); }}
                  className="rounded px-4 py-1.5 text-xs font-medium"
                  style={{ background: 'transparent', color: PALETTE.muted, border: `1px solid ${PALETTE.border}`, cursor: 'pointer' }}
                >
                  Dismiss
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
