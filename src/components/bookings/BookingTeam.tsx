'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BookingTalent, BookingCrew, Talent, Crew } from '@/lib/types/database';
import { PALETTE, CREW_TIER_LABELS } from '@/lib/utils/constants';
import { formatCurrency } from '@/lib/utils/format';
import {
  addBookingTalentAction, removeBookingTalentAction,
  addBookingCrewAction, removeBookingCrewAction,
} from '@/app/actions/quotes';
import CrewStatusSelect from './CrewStatusSelect';

type Props = {
  bookingId: string;
  bookingTalent: BookingTalent[];
  bookingCrew: BookingCrew[];
  allTalent: Talent[];
  allCrew: Crew[];
};

export default function BookingTeam({ bookingId, bookingTalent, bookingCrew, allTalent, allCrew }: Props) {
  const router = useRouter();
  const [showAddTalent, setShowAddTalent] = useState(false);
  const [showAddCrew, setShowAddCrew] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleAddTalent(formData: FormData) {
    setBusy(true);
    await addBookingTalentAction(formData);
    setShowAddTalent(false);
    router.refresh();
    setBusy(false);
  }

  async function handleRemoveTalent(id: string) {
    setBusy(true);
    await removeBookingTalentAction(id, bookingId);
    router.refresh();
    setBusy(false);
  }

  async function handleAddCrew(formData: FormData) {
    setBusy(true);
    await addBookingCrewAction(formData);
    setShowAddCrew(false);
    router.refresh();
    setBusy(false);
  }

  async function handleRemoveCrew(id: string) {
    setBusy(true);
    await removeBookingCrewAction(id, bookingId);
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      {/* Talent */}
      <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
            Talent ({bookingTalent.length})
          </h3>
          <button
            onClick={() => setShowAddTalent(!showAddTalent)}
            className="rounded px-2 py-0.5 text-[10px] font-medium"
            style={{ background: `${PALETTE.accent}22`, color: PALETTE.accent }}
          >
            {showAddTalent ? 'Cancel' : '+ Add'}
          </button>
        </div>

        {showAddTalent && (
          <form action={handleAddTalent} className="mb-3 space-y-2 rounded border p-2" style={{ borderColor: PALETTE.border }}>
            <input type="hidden" name="booking_id" value={bookingId} />
            <select name="talent_id" required className="w-full rounded border px-2 py-1 text-xs" style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}>
              <option value="">Select talent...</option>
              {allTalent.filter(t => t.is_active).map(t => (
                <option key={t.id} value={t.id}>{t.working_name}</option>
              ))}
            </select>
            <div className="grid grid-cols-3 gap-2">
              <input name="role_on_booking" required placeholder="Role" className="rounded border px-2 py-1 text-xs" style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }} />
              <input name="day_rate" type="number" step="0.01" placeholder="Day rate" className="rounded border px-2 py-1 text-xs" style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }} />
              <input name="usage_fee" type="number" step="0.01" placeholder="Usage fee" className="rounded border px-2 py-1 text-xs" style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }} />
            </div>
            <button type="submit" disabled={busy} className="rounded px-2.5 py-1 text-[11px] font-medium disabled:opacity-50" style={{ background: PALETTE.accent, color: PALETTE.bg }}>
              Add Talent
            </button>
          </form>
        )}

        {bookingTalent.length === 0 ? (
          <p className="text-[11px]" style={{ color: PALETTE.muted }}>No talent assigned yet.</p>
        ) : (
          <div className="space-y-2">
            {bookingTalent.map((bt) => {
              const t = bt.talent;
              return (
                <div key={bt.id} className="flex items-center justify-between rounded border px-3 py-2" style={{ borderColor: PALETTE.border }}>
                  <div>
                    <div className="text-xs font-medium" style={{ color: PALETTE.text }}>
                      {t?.working_name ?? 'Unknown'}
                      <span className="ml-2 text-[10px]" style={{ color: PALETTE.muted }}>{bt.role_on_booking}</span>
                    </div>
                    <div className="text-[10px] flex gap-3" style={{ color: PALETTE.muted }}>
                      {bt.day_rate != null && <span>Day: {formatCurrency(bt.day_rate)}</span>}
                      {bt.usage_fee != null && <span>Usage: {formatCurrency(bt.usage_fee)}</span>}
                      <span>{bt.confirmed ? 'Confirmed' : 'Pencilled'}</span>
                    </div>
                  </div>
                  <button onClick={() => handleRemoveTalent(bt.id)} className="text-[10px]" style={{ color: PALETTE.danger }}>Remove</button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Crew */}
      <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
            Crew ({bookingCrew.length})
          </h3>
          <button
            onClick={() => setShowAddCrew(!showAddCrew)}
            className="rounded px-2 py-0.5 text-[10px] font-medium"
            style={{ background: `${PALETTE.accent}22`, color: PALETTE.accent }}
          >
            {showAddCrew ? 'Cancel' : '+ Add'}
          </button>
        </div>

        {showAddCrew && (
          <form action={handleAddCrew} className="mb-3 space-y-2 rounded border p-2" style={{ borderColor: PALETTE.border }}>
            <input type="hidden" name="booking_id" value={bookingId} />
            <select name="crew_id" required className="w-full rounded border px-2 py-1 text-xs" style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}>
              <option value="">Select crew member...</option>
              {allCrew.filter(c => c.is_active && c.tier !== 'never_again').map(c => (
                <option key={c.id} value={c.id}>{c.name} — {c.primary_role ?? 'General'}</option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input name="role_on_booking" placeholder="Role on booking" className="rounded border px-2 py-1 text-xs" style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }} />
              <input name="day_rate" type="number" step="0.01" placeholder="Day rate" className="rounded border px-2 py-1 text-xs" style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }} />
            </div>
            <button type="submit" disabled={busy} className="rounded px-2.5 py-1 text-[11px] font-medium disabled:opacity-50" style={{ background: PALETTE.accent, color: PALETTE.bg }}>
              Add Crew
            </button>
          </form>
        )}

        {bookingCrew.length === 0 ? (
          <p className="text-[11px]" style={{ color: PALETTE.muted }}>No crew assigned yet.</p>
        ) : (
          <div className="space-y-2">
            {bookingCrew.map((bc) => {
              const c = bc.crew;
              return (
                <div key={bc.id} className="flex items-center justify-between rounded border px-3 py-2" style={{ borderColor: PALETTE.border }}>
                  <div>
                    <div className="text-xs font-medium" style={{ color: PALETTE.text }}>
                      {c?.name ?? 'Unknown'}
                      {bc.role_on_booking && <span className="ml-2 text-[10px]" style={{ color: PALETTE.muted }}>{bc.role_on_booking}</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]" style={{ color: PALETTE.muted }}>
                      {bc.day_rate != null && <span>Day: {formatCurrency(bc.day_rate)}</span>}
                      <CrewStatusSelect bookingCrewId={bc.id} bookingId={bookingId} status={bc.status} />
                      {c?.tier && <span>{CREW_TIER_LABELS[c.tier]}</span>}
                    </div>
                  </div>
                  <button onClick={() => handleRemoveCrew(bc.id)} className="text-[10px]" style={{ color: PALETTE.danger }}>Remove</button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
