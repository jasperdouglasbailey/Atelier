'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { PALETTE } from '@/lib/utils/constants';

type Props = {
  /** All active talent, used to populate the dropdown. */
  talent: { id: string; name: string }[];
  /** Currently-selected talent_id, or null for "All talent". */
  selectedId: string | null;
};

/**
 * Calendar talent-POV filter (Jasper 2026-05-18).
 *
 * Picks a single talent from a dropdown and reloads the bookings
 * calendar showing only their bookings. Resets via the "× clear"
 * button. Preserves any other search params (state/tier/group)
 * already on the URL so the filter composes cleanly with others.
 *
 * Lives at the top of the calendar view only. Other views ignore the
 * `?talent=` param on the URL (it's filtered server-side conditional
 * on `view === 'calendar'`).
 */
export default function CalendarTalentFilter({ talent, selectedId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function applyTalent(nextId: string | null) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (nextId) {
      params.set('talent', nextId);
    } else {
      params.delete('talent');
    }
    // Ensure we stay on the calendar view after the redirect.
    params.set('view', 'calendar');
    router.push(`/bookings?${params.toString()}`);
  }

  return (
    <div
      className="mb-3 flex items-center gap-2 rounded-lg border px-3 py-2"
      style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>
        Talent POV
      </span>
      <select
        value={selectedId ?? ''}
        onChange={(e) => applyTalent(e.target.value || null)}
        className="rounded border bg-transparent px-2 py-1 text-xs"
        style={{ borderColor: PALETTE.border, color: PALETTE.text, background: PALETTE.bg }}
      >
        <option value="">All talent</option>
        {talent.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      {selectedId && (
        <button
          type="button"
          onClick={() => applyTalent(null)}
          className="text-[11px] underline"
          style={{ color: PALETTE.muted, background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          × clear
        </button>
      )}
    </div>
  );
}
