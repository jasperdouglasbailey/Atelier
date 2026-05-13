'use client';

/**
 * Morning-After Check workflow component.
 *
 * Shown when booking.state === 'morning_after_check'. Guides Jasper through
 * a post-shoot checklist before advancing to post_production. The OT/expense
 * window (7 days) is also active at this stage — OTExpenseEntry handles that.
 */

import { useState } from 'react';
import { transitionBookingAction } from '@/app/actions/bookings';
import { PALETTE } from '@/lib/utils/constants';
import { useRouter } from 'next/navigation';

type Props = {
  bookingId: string;
  bookingRef: string | null;
};

type CheckItem = {
  id: string;
  label: string;
  description: string;
  required: boolean;
};

const CHECK_ITEMS: CheckItem[] = [
  {
    id: 'talent_confirmed',
    label: 'All talent attended and were paid correctly',
    description: 'Confirm all scheduled talent showed up and their rates match the fee lines.',
    required: true,
  },
  {
    id: 'crew_confirmed',
    label: 'Crew hours verified',
    description: 'Check crew hours, confirm OT entries if applicable.',
    required: true,
  },
  {
    id: 'deliverables_captured',
    label: 'Deliverables captured as briefed',
    description: 'The shoot met the brief deliverables (stills count, video, BTS, etc.).',
    required: true,
  },
  {
    id: 'selects_timeline',
    label: 'Selects timeline confirmed with client',
    description: 'Client knows when to expect first round of selects.',
    required: false,
  },
  {
    id: 'expenses_logged',
    label: 'All expenses logged in quote',
    description: 'Any OT, catering, travel or unexpected expenses are added to the fee lines above.',
    required: false,
  },
  {
    id: 'hard_drives',
    label: 'Hard drives / media backed up',
    description: 'Shooting media is safely backed up with artist / post team.',
    required: false,
  },
  {
    id: 'talent_paperwork',
    label: 'Talent paperwork / contracts signed',
    description: 'Model release forms, contracts, and any usage documents collected.',
    required: false,
  },
  {
    id: 'location_cleared',
    label: 'Location / studio cleared and bond recoverable',
    description: 'Studio or location left as found, bond/security deposit confirmed.',
    required: false,
  },
];

export default function MorningAfterChecklist({ bookingId, bookingRef }: Props) {
  const router = useRouter();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiredItems = CHECK_ITEMS.filter((c) => c.required);
  const allRequiredDone = requiredItems.every((c) => checked.has(c.id));
  const totalChecked = checked.size;

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAdvance() {
    if (!allRequiredDone) return;
    setAdvancing(true);
    setError(null);

    const result = await transitionBookingAction(bookingId, 'post_production');
    if ('error' in result) {
      setError(result.error ?? 'Transition failed');
    } else {
      router.refresh();
    }
    setAdvancing(false);
  }

  return (
    <section className="rounded-lg border p-4 space-y-4" style={{ background: PALETTE.surface, borderColor: PALETTE.accent + '44' }}>
      <div>
        <h3 className="section-title" style={{ color: PALETTE.accent }}>
          Morning-After Check
        </h3>
        <p className="text-[11px] mt-0.5" style={{ color: PALETTE.muted }}>
          {bookingRef} · Verify the shoot before moving to post-production.
          {' '}{totalChecked}/{CHECK_ITEMS.length} items complete.
        </p>
      </div>

      <div className="space-y-2">
        {CHECK_ITEMS.map((item) => {
          const isChecked = checked.has(item.id);
          return (
            <label
              key={item.id}
              className="flex items-start gap-3 cursor-pointer rounded-md px-3 py-2.5"
              style={{
                background: isChecked ? `${PALETTE.success}0f` : 'transparent',
                border: `1px solid ${isChecked ? PALETTE.success + '33' : PALETTE.border}`,
              }}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggle(item.id)}
                className="mt-0.5 flex-shrink-0"
                style={{ accentColor: PALETTE.success }}
              />
              <div>
                <div className="text-xs font-medium flex items-center gap-2" style={{ color: isChecked ? PALETTE.success : PALETTE.text }}>
                  {item.label}
                  {item.required && (
                    <span className="text-[9px] font-semibold px-1 rounded" style={{ background: `${PALETTE.warning}22`, color: PALETTE.warning }}>
                      Required
                    </span>
                  )}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: PALETTE.muted }}>{item.description}</div>
              </div>
            </label>
          );
        })}
      </div>

      {error && (
        <div className="rounded px-3 py-2 text-xs" style={{ color: PALETTE.danger, background: `${PALETTE.danger}11` }}>
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleAdvance}
          disabled={!allRequiredDone || advancing}
          className="rounded px-4 py-2 text-xs font-medium"
          style={{
            background: PALETTE.success,
            color: PALETTE.bg,
            border: 'none',
            cursor: allRequiredDone ? 'pointer' : 'not-allowed',
            opacity: !allRequiredDone ? 0.4 : 1,
          }}
        >
          {advancing ? 'Advancing…' : '→ Move to Post-Production'}
        </button>
        {!allRequiredDone && (
          <span className="text-[11px]" style={{ color: PALETTE.warning }}>
            Complete all required items first
          </span>
        )}
      </div>
    </section>
  );
}
