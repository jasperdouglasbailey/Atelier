'use client';

import { useState } from 'react';
import type { BookingRoster, RosterPerson } from '@/lib/data/booking-roster';
import { humanise } from '@/lib/utils/humanise';
import { PALETTE } from '@/lib/utils/constants';

type Format = 'compact' | 'callsheet' | 'artists' | 'crew' | 'all';

type Props = {
  roster: BookingRoster | null;
  bookingRef: string | null;
  bookingTitle: string;
};

function formatPerson(p: RosterPerson, format: 'compact' | 'callsheet'): string {
  if (format === 'compact') {
    return [p.name, p.mobile].filter(Boolean).join(' — ');
  }
  const lines: string[] = [];
  if (p.role) lines.push(humanise(p.role));
  lines.push(p.name);
  if (p.mobile) lines.push(p.mobile);
  if (p.email) lines.push(p.email);
  if (p.dietary && !/^nil( diet)?$/i.test(p.dietary)) lines.push(`Dietary: ${p.dietary}`);
  if (p.drink_order) lines.push(`Drink: ${p.drink_order}`);
  return lines.join('\n');
}

function buildBlock(roster: BookingRoster | null, format: Format, bookingRef: string | null, bookingTitle: string): string {
  if (!roster) return '';
  const { talent, crew } = roster;

  if (format === 'artists') {
    return talent.map((p) => formatPerson(p, 'callsheet')).join('\n\n');
  }
  if (format === 'crew') {
    return crew.map((p) => formatPerson(p, 'callsheet')).join('\n\n');
  }
  if (format === 'compact') {
    return [...talent, ...crew].map((p) => formatPerson(p, 'compact')).join('\n');
  }
  // 'all' / 'callsheet' — full block with headings
  const header = [bookingRef, bookingTitle].filter(Boolean).join(' — ');
  const parts: string[] = [];
  if (header) parts.push(header);
  if (talent.length > 0) {
    parts.push('\nARTISTS\n' + talent.map((p) => formatPerson(p, 'callsheet')).join('\n\n'));
  }
  if (crew.length > 0) {
    parts.push('\nCREW\n' + crew.map((p) => formatPerson(p, 'callsheet')).join('\n\n'));
  }
  return parts.join('\n');
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch { /* ignore */ }
    document.body.removeChild(ta);
  }
}

export default function CopyTeamButton({ roster, bookingRef, bookingTitle }: Props) {
  const [open, setOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<Format | null>(null);

  const hasTalent = (roster?.talent.length ?? 0) > 0;
  const hasCrew = (roster?.crew.length ?? 0) > 0;
  const disabled = !hasTalent && !hasCrew;

  function flash(key: Format, text: string) {
    copyText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1400);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="rounded-md border px-3 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50"
        style={{
          borderColor: PALETTE.border,
          color: disabled ? PALETTE.muted : PALETTE.text,
          background: 'transparent',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        title={disabled ? 'No team attached yet' : 'Copy team contact details to clipboard'}
      >
        Copy team ▾
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            className="absolute right-0 z-20 mt-1 w-56 rounded-md border shadow-lg overflow-hidden"
            style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
          >
            {hasTalent && (
              <button
                type="button"
                onClick={() => flash('artists', buildBlock(roster, 'artists', bookingRef, bookingTitle))}
                className="w-full px-3 py-2 text-left text-[11px] font-medium hover:bg-black/5"
                style={{ color: PALETTE.text, background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                {copiedKey === 'artists' ? '✓ Copied' : 'Artists — call sheet block'}
              </button>
            )}
            {hasCrew && (
              <button
                type="button"
                onClick={() => flash('crew', buildBlock(roster, 'crew', bookingRef, bookingTitle))}
                className="w-full border-t px-3 py-2 text-left text-[11px] font-medium hover:bg-black/5"
                style={{ color: PALETTE.text, background: 'transparent', border: 'none', borderTopColor: PALETTE.border, cursor: 'pointer' }}
              >
                {copiedKey === 'crew' ? '✓ Copied' : 'Crew — call sheet block'}
              </button>
            )}
            {(hasTalent || hasCrew) && (
              <button
                type="button"
                onClick={() => flash('all', buildBlock(roster, 'all', bookingRef, bookingTitle))}
                className="w-full border-t px-3 py-2 text-left text-[11px] font-medium hover:bg-black/5"
                style={{ color: PALETTE.text, background: 'transparent', border: 'none', borderTopColor: PALETTE.border, cursor: 'pointer' }}
              >
                {copiedKey === 'all' ? '✓ Copied' : 'All — full call sheet'}
              </button>
            )}
            <button
              type="button"
              onClick={() => flash('compact', buildBlock(roster, 'compact', bookingRef, bookingTitle))}
              className="w-full border-t px-3 py-2 text-left text-[11px] font-medium hover:bg-black/5"
              style={{ color: PALETTE.muted, background: 'transparent', border: 'none', borderTopColor: PALETTE.border, cursor: 'pointer' }}
            >
              {copiedKey === 'compact' ? '✓ Copied' : 'Compact — name & phone'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
