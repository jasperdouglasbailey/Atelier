'use client';

import { useState, useTransition } from 'react';
import { parseLocationFromUrlAction } from '@/app/actions/locations';
import type { ParsedLocation } from '@/lib/automation/location-parser';
import { PALETTE } from '@/lib/utils/constants';

type Props = {
  onApply: (parsed: ParsedLocation) => void;
};

/**
 * URL-to-fields parser panel that sits above the LocationForm.
 *
 * User pastes a studio's public website URL → server-side fetcher fetches
 * the homepage + up to 4 same-domain sub-pages (room/rate listings) → Claude
 * extracts structured fields → preview is shown with confidence + uncertainty
 * → user clicks "Apply to form" to populate the LocationForm fields.
 *
 * Doctrine: never auto-applies. The user reviews before populating the form,
 * and reviews again before saving.
 */
export default function ParseFromUrlPanel({ onApply }: Props) {
  const [url, setUrl] = useState('');
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ParsedLocation | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleParse() {
    if (!url.trim()) return;
    setError(null);
    setResult(null);
    startTransition(async () => {
      const r = await parseLocationFromUrlAction(url);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setResult(r.parsed);
    });
  }

  function handleApply() {
    if (result) {
      onApply(result);
      // Keep the preview around so the user can re-apply or compare —
      // but clear the URL so they don't accidentally re-parse.
      setUrl('');
    }
  }

  const confidenceColor = result == null
    ? PALETTE.muted
    : result.confidence >= 80 ? PALETTE.success
    : result.confidence >= 55 ? PALETTE.warning
    : PALETTE.danger;

  return (
    <section
      className="rounded-lg border p-4 space-y-3"
      style={{
        borderColor: PALETTE.accent + '44',
        background: PALETTE.accent + '08',
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.accent }}>
            AI · Parse from website
          </h2>
          <p className="mt-0.5 text-[11px]" style={{ color: PALETTE.muted }}>
            Paste a studio&rsquo;s URL — we&rsquo;ll fetch their homepage + room/rate pages and fill the fields below.
          </p>
        </div>
        {result && (
          <span className="text-[10px] uppercase tracking-wider" style={{ color: confidenceColor }}>
            Confidence {result.confidence}%
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !pending) { e.preventDefault(); handleParse(); }
          }}
          placeholder="https://bakerstreetstudios.com.au"
          disabled={pending}
          className="flex-1 rounded-md border bg-transparent px-3 py-2 text-sm"
          style={{ borderColor: PALETTE.border, color: PALETTE.text, background: PALETTE.bg }}
        />
        <button
          type="button"
          onClick={handleParse}
          disabled={pending || !url.trim()}
          className="rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-50"
          style={{ background: PALETTE.accent, color: PALETTE.bg }}
        >
          {pending ? 'Parsing…' : 'Parse'}
        </button>
      </div>

      {error && (
        <div className="rounded border-l-2 px-3 py-2 text-[12px]"
          style={{ borderColor: PALETTE.danger, background: `${PALETTE.danger}10`, color: PALETTE.text }}>
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-md border p-3 space-y-2" style={{ borderColor: PALETTE.border, background: PALETTE.surface }}>
          {/* Summary line — what the AI found */}
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px]">
            {result.name && (
              <span style={{ color: PALETTE.text }}><strong>{result.name}</strong></span>
            )}
            {result.address && (
              <span style={{ color: PALETTE.muted }}>· {[result.address, result.suburb, result.state].filter(Boolean).join(', ')}</span>
            )}
          </div>

          {/* Field summary — which fields will populate, which were blank */}
          <ul className="text-[11px] space-y-0.5" style={{ color: PALETTE.muted }}>
            <Summary label="Name" value={result.name} />
            <Summary label="Type" value={result.studio_type ? result.studio_type.replace('_', ' ') : null} />
            <Summary label="Address" value={[result.address, result.suburb, result.state, result.postcode].filter(Boolean).join(', ')} />
            <Summary label="Half-day / full-day" value={
              result.half_day_rate || result.full_day_rate
                ? `${result.half_day_rate ? '$' + result.half_day_rate.toLocaleString() : '—'} / ${result.full_day_rate ? '$' + result.full_day_rate.toLocaleString() : '—'}`
                : null
            } />
            <Summary label="Capacity / size" value={
              result.max_capacity || result.square_metres
                ? `${result.max_capacity ?? '—'} ppl · ${result.square_metres ? result.square_metres + 'm²' : '—'}`
                : null
            } />
            <Summary label="Facilities" value={result.facilities.length > 0 ? result.facilities.join(', ') : null} />
            <Summary label="Rooms" value={result.studio_rooms.length > 0 ? `${result.studio_rooms.length} (${result.studio_rooms.map((r) => r.name).join(', ')})` : 'single space'} />
            <Summary label="Contact" value={[result.contact_name, result.contact_email, result.contact_phone].filter(Boolean).join(' · ') || null} />
          </ul>

          {/* Uncertainty */}
          {result.uncertainty.length > 0 && (
            <div className="rounded px-2 py-1.5 text-[10px]"
              style={{ background: `${PALETTE.warning}12`, color: PALETTE.text, borderLeft: `2px solid ${PALETTE.warning}` }}>
              <strong style={{ color: PALETTE.warning }}>Couldn&rsquo;t determine:</strong> {result.uncertainty.join(' · ')}
            </div>
          )}

          {/* Sources */}
          <div className="text-[10px]" style={{ color: PALETTE.muted, opacity: 0.7 }}>
            Sourced from {result.sourceUrls.length} page{result.sourceUrls.length === 1 ? '' : 's'} · review every field before saving
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleApply}
              className="rounded-md px-4 py-1.5 text-xs font-medium"
              style={{ background: PALETTE.accent, color: PALETTE.bg }}
            >
              Apply to form ↓
            </button>
            <button
              type="button"
              onClick={() => setResult(null)}
              className="rounded-md px-3 py-1.5 text-xs"
              style={{ background: 'transparent', color: PALETTE.muted, border: `1px solid ${PALETTE.border}` }}
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Summary({ label, value }: { label: string; value: string | number | null }) {
  return (
    <li className="flex items-baseline gap-2">
      <span style={{ width: 110, flex: 'none', color: PALETTE.muted }}>{label}</span>
      <span style={{ color: value == null || value === '' ? PALETTE.muted : PALETTE.text, opacity: value == null || value === '' ? 0.55 : 1 }}>
        {value == null || value === '' ? <em>—</em> : value}
      </span>
    </li>
  );
}
