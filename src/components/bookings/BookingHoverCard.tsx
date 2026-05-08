'use client';

/**
 * Hover-pin card for bookings — appears when you hover a booking row
 * (in the list, board, or calendar) and shows everything you'd need to
 * paste into a client email or call sheet:
 *
 *   - Booking ref + title + state + dates
 *   - Talent: name · phone · dietary · drink
 *   - Crew:   role · name · phone · dietary · drink (· city)
 *   - One-click copy buttons:
 *       "Copy artists" — name + phone for each artist
 *       "Copy crew"    — full call-sheet block per crew member
 *       "Copy all"     — combined call-sheet block, ready to paste
 *
 * Critical behaviour: the popover stays open while the cursor is over
 * EITHER the trigger or the popover, so you can move the mouse from the
 * trigger row into the popover to click a copy button without it closing.
 * Implemented with a shared mouseenter/leave wrapper (the trigger and
 * popover share one onMouseLeave timer).
 */

import { useState, useRef, useCallback } from 'react';
import type { BookingState } from '@/lib/types/database';
import type { BookingRoster, RosterPerson } from '@/lib/data/booking-roster';
import { BOOKING_STATE_LABELS, STATE_COLORS, PALETTE } from '@/lib/utils/constants';
import { humanise } from '@/lib/utils/humanise';

type Props = {
  /** The trigger element — a booking row, calendar bar, or board card. */
  children: React.ReactNode;
  bookingRef: string | null;
  title: string;
  state: BookingState;
  /** Optional shoot date display — already formatted ("8 May" / "8–10 May"). */
  shootDates?: string | null;
  shootLocation?: string | null;
  clientName?: string | null;
  brandName?: string | null;
  roster: BookingRoster | null;
  /**
   * Optional style overrides for the wrapper span. Used by the calendar
   * to take over absolute positioning so the trigger fills the bar.
   */
  wrapperStyle?: React.CSSProperties;
};

export default function BookingHoverCard({
  children, bookingRef, title, state, shootDates, shootLocation,
  clientName, brandName, roster, wrapperStyle,
}: Props) {
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hover-stay logic: any mouseenter on trigger or popover cancels the
  // pending close. Any mouseleave starts a 120ms close timer — long enough
  // for the cursor to cross the small gap between trigger and popover.
  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setOpen(false), 120);
  }, [cancelClose]);

  // Default wrapper style is inline-block (used by table rows in the list view).
  // Calendar bars override with `wrapperStyle` to take the absolute positioning
  // so the bar can size against the week row, not against this wrapper.
  const finalWrapperStyle: React.CSSProperties = wrapperStyle
    ? { position: 'relative', ...wrapperStyle }
    : { position: 'relative', display: 'inline-block' };

  return (
    <span
      style={finalWrapperStyle}
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          // Block clicks on the popover from bubbling to the trigger Link
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            zIndex: 50,
            top: '100%',
            left: 0,
            marginTop: 6,
            minWidth: 360,
            maxWidth: 480,
            background: PALETTE.surface,
            border: `1px solid ${PALETTE.border}`,
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            padding: 14,
            display: 'block',
            color: PALETTE.text,
          }}
        >
          {/* Header — booking identity + state pill */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {bookingRef ? `${bookingRef} · ` : ''}{title}
              </div>
              <div style={{ marginTop: 2, fontSize: 11, color: PALETTE.muted, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {clientName && <span>{clientName}</span>}
                {brandName && <span>· {brandName}</span>}
                {shootDates && <span>· {shootDates}</span>}
                {shootLocation && <span>· {shootLocation}</span>}
              </div>
            </div>
            <span
              style={{
                flex: 'none', borderRadius: 999, padding: '2px 8px',
                fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6,
                background: `${STATE_COLORS[state]}26`, color: STATE_COLORS[state],
              }}
            >
              {BOOKING_STATE_LABELS[state]}
            </span>
          </div>

          {/* Roster — talent + crew */}
          {roster && (roster.talent.length > 0 || roster.crew.length > 0) ? (
            <>
              {roster.talent.length > 0 && (
                <RosterSection title="Artists" people={roster.talent} />
              )}
              {roster.crew.length > 0 && (
                <RosterSection title="Crew" people={roster.crew} />
              )}
              {/* Copy buttons */}
              <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: `1px solid ${PALETTE.border}`, paddingTop: 10 }}>
                {roster.talent.length > 0 && (
                  <CopyButton
                    label="Copy artists"
                    text={formatRosterForCopy(roster.talent, 'compact')}
                  />
                )}
                {roster.crew.length > 0 && (
                  <CopyButton
                    label="Copy crew"
                    text={formatRosterForCopy(roster.crew, 'callsheet')}
                  />
                )}
                {(roster.talent.length > 0 || roster.crew.length > 0) && (
                  <CopyButton
                    label="Copy all (call sheet)"
                    text={[
                      roster.talent.length > 0 ? `ARTISTS\n${formatRosterForCopy(roster.talent, 'callsheet')}` : null,
                      roster.crew.length > 0 ? `CREW\n${formatRosterForCopy(roster.crew, 'callsheet')}` : null,
                    ].filter(Boolean).join('\n\n')}
                    primary
                  />
                )}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: PALETTE.muted }}>
              No artists or crew attached yet.
            </div>
          )}
        </span>
      )}
    </span>
  );
}

function RosterSection({ title, people }: { title: string; people: RosterPerson[] }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: PALETTE.muted, marginBottom: 4 }}>
        {title}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {people.map((p) => (
          <li key={p.id} style={{ fontSize: 11.5, lineHeight: 1.45 }}>
            <div>
              {p.role && <span style={{ color: PALETTE.muted }}>{humanise(p.role)} · </span>}
              <span style={{ fontWeight: 600 }}>{p.name}</span>
              {p.city && (
                <span style={{ marginLeft: 6, fontSize: 9, color: PALETTE.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{p.city}</span>
              )}
            </div>
            <div style={{ color: PALETTE.muted, fontSize: 11 }}>
              {p.mobile && <span style={{ fontFamily: 'ui-monospace, monospace' }}>{p.mobile}</span>}
              {p.dietary && !/^nil( diet)?$/i.test(p.dietary) && <span> · {p.dietary}</span>}
              {p.drink_order && <span> · {p.drink_order}</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Build the copyable call-sheet block.
 *
 * Format `compact`   → "Name — Phone" per line (good for SMS).
 * Format `callsheet` → Role / Name / Phone / Dietary / Drink stacked block
 *                       per person, blank line between, ready to paste.
 */
function formatRosterForCopy(people: RosterPerson[], format: 'compact' | 'callsheet'): string {
  if (format === 'compact') {
    return people
      .map((p) => [p.name, p.mobile].filter(Boolean).join(' — '))
      .join('\n');
  }
  return people
    .map((p) => {
      const lines: string[] = [];
      if (p.role) lines.push(humanise(p.role));
      lines.push(p.name);
      if (p.mobile) lines.push(p.mobile);
      if (p.dietary && !/^nil( diet)?$/i.test(p.dietary)) lines.push(`Dietary: ${p.dietary}`);
      if (p.drink_order) lines.push(`Drink: ${p.drink_order}`);
      return lines.join('\n');
    })
    .join('\n\n');
}

function CopyButton({ label, text, primary = false }: { label: string; text: string; primary?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          // Older browsers / non-secure contexts — fall back to a textarea
          // selection trick.
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); } catch { /* ignore */ }
          document.body.removeChild(ta);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        }
      }}
      style={{
        cursor: 'pointer',
        fontSize: 10.5, fontWeight: 600,
        padding: '5px 10px',
        borderRadius: 5,
        border: primary ? 'none' : `1px solid ${PALETTE.border}`,
        background: primary ? PALETTE.accent : 'transparent',
        color: primary ? PALETTE.bg : PALETTE.text,
        transition: 'all 0.15s ease',
      }}
    >
      {copied ? '✓ Copied' : label}
    </button>
  );
}
