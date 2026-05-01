'use client';

import { useState } from 'react';
import { parseBriefAction, applyBriefSuggestionsAction } from '@/app/actions/bookings';
import { PALETTE } from '@/lib/utils/constants';
import type { BriefIntakeResult } from '@/lib/automation/brief-intake';

type Props = {
  bookingId: string;
  hasBriefText: boolean;
  currentState: string;
};

// Subset of brief-intake fields we expose for review. Intentionally excludes
// talent_count and budget_indication — both removed from the app per Jasper's
// direction. Heuristic parser still extracts them, we just don't surface them.
const FIELD_LABELS = {
  shoot_location: 'Shoot Location',
  shoot_date_start: 'Shoot Start Date',
  shoot_date_end: 'Shoot End Date',
  shoot_date_notes: 'Date Notes',
  talent_spec: 'Talent Spec',
  deliverables_type: 'Deliverables Type',
  deliverables_count: 'Deliverables Count',
  usage_duration_months: 'Usage Duration (months)',
} as const;
type FieldKey = keyof typeof FIELD_LABELS;

export default function BriefParser({ bookingId, hasBriefText, currentState }: Props) {
  const [parsing, setParsing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [suggestions, setSuggestions] = useState<BriefIntakeResult | null>(null);
  const [selected, setSelected] = useState<Set<FieldKey>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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

    // Auto-select all non-null data fields (excluding meta fields)
    const META = new Set(['source', 'confidence', 'llmAvailable']);
    const nonNull = (Object.keys(s) as FieldKey[]).filter((k) => !META.has(k) && (s as Record<string, unknown>)[k] != null);
    setSelected(new Set(nonNull));
  }

  async function handleApply() {
    if (!suggestions) return;
    setApplying(true);
    setError(null);

    const fd = new FormData();
    for (const key of selected) {
      const val = suggestions[key];
      if (val != null) fd.set(key, String(val));
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

  if (!hasBriefText) return null;

  const META_KEYS = new Set(['source', 'confidence', 'llmAvailable']);
  const dataKeys = suggestions
    ? (Object.keys(suggestions) as FieldKey[]).filter((k) => !META_KEYS.has(k))
    : [];
  const hasSuggestions = suggestions && dataKeys.some((k) => (suggestions as Record<string, unknown>)[k] != null);

  return (
    <div className="rounded-lg border p-4 space-y-3" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Brief Auto-Parser</h3>
          <p className="text-[11px] mt-0.5" style={{ color: PALETTE.muted }}>
            Extract structured fields from the raw brief text.
            {suggestions?.llmAvailable === false && (
              <span style={{ color: PALETTE.warning }}> · Heuristic only (set ANTHROPIC_API_KEY for AI extraction)</span>
            )}
            {suggestions?.llmAvailable && (
              <span style={{ color: PALETTE.success }}> · AI-enhanced ({suggestions.confidence}% confidence)</span>
            )}
          </p>
        </div>
        {!suggestions && !success && (
          <button
            onClick={handleParse}
            disabled={parsing}
            className="rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            style={{ background: PALETTE.accent, color: PALETTE.bg, border: 'none', cursor: 'pointer' }}
          >
            {parsing ? 'Parsing…' : '⚡ Parse Brief'}
          </button>
        )}
      </div>

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

      {suggestions && !success && (
        <>
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
                        {String((suggestions as Record<string, unknown>)[key])}
                      </span>
                    </label>
                  ))}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleApply}
                  disabled={applying || selected.size === 0}
                  className="rounded px-4 py-1.5 text-xs font-medium disabled:opacity-40"
                  style={{ background: PALETTE.accent, color: PALETTE.bg, border: 'none', cursor: 'pointer' }}
                >
                  {applying ? 'Applying…' : `Apply ${selected.size} field${selected.size !== 1 ? 's' : ''}`}
                </button>
                <button
                  onClick={() => { setSuggestions(null); setError(null); }}
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
