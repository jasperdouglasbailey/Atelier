'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PALETTE } from '@/lib/utils/constants';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { humanise } from '@/lib/utils/humanise';
import { markTalentPaidAction, markCrewPaidAction } from '@/app/actions/bookings';
import type { BookingTalent, BookingCrew } from '@/lib/types/database';

type Props = {
  bookingId: string;
  bookingTalent: BookingTalent[];
  bookingCrew: BookingCrew[];
};

/**
 * Pay-on-paid tracker. Shown when the booking is in invoice_issued or paid
 * state so Jasper can record when each artist and crew member has been paid.
 */
export default function PayrollPanel({ bookingId, bookingTalent, bookingCrew }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const unpaidTalent = bookingTalent.filter((bt) => !bt.artist_paid_at);
  const paidTalent = bookingTalent.filter((bt) => bt.artist_paid_at);
  const unpaidCrew = bookingCrew.filter((bc) => !bc.artist_paid_at);
  const paidCrew = bookingCrew.filter((bc) => bc.artist_paid_at);

  const allPaid = unpaidTalent.length === 0 && unpaidCrew.length === 0;

  async function handleMarkTalentPaid(btId: string) {
    setPending((p) => new Set(p).add(btId));
    setError(null);
    const result = await markTalentPaidAction(btId, bookingId);
    if ('error' in result) {
      setError(result.error);
    } else {
      router.refresh();
    }
    setPending((p) => { const s = new Set(p); s.delete(btId); return s; });
  }

  async function handleMarkCrewPaid(bcId: string) {
    setPending((p) => new Set(p).add(bcId));
    setError(null);
    const result = await markCrewPaidAction(bcId, bookingId);
    if ('error' in result) {
      setError(result.error);
    } else {
      router.refresh();
    }
    setPending((p) => { const s = new Set(p); s.delete(bcId); return s; });
  }

  const totalOwed = [
    ...unpaidTalent.map((bt) => (bt.day_rate ?? 0) + (bt.usage_fee ?? 0)),
    ...unpaidCrew.map((bc) => bc.day_rate ?? 0),
  ].reduce((s, v) => s + v, 0);

  if (bookingTalent.length === 0 && bookingCrew.length === 0) return null;

  return (
    <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
          Payroll
        </h3>
        {allPaid ? (
          <span className="text-[11px] font-semibold" style={{ color: PALETTE.success }}>All paid</span>
        ) : (
          <span className="text-[11px] font-semibold" style={{ color: PALETTE.warning }}>
            {unpaidTalent.length + unpaidCrew.length} unpaid
            {totalOwed > 0 ? ` · ${formatCurrency(totalOwed)} outstanding` : ''}
          </span>
        )}
      </div>

      {error && (
        <div className="mb-2 rounded px-3 py-2 text-xs" style={{ color: PALETTE.danger, border: `1px solid ${PALETTE.danger}44` }}>
          {error}
        </div>
      )}

      <div className="space-y-2">
        {/* Talent rows */}
        {bookingTalent.map((bt) => {
          const name = bt.talent?.working_name ?? bt.talent?.legal_name ?? bt.talent_id.slice(0, 8);
          const discipline = bt.talent?.discipline ?? null;
          const totalFee = (bt.day_rate ?? 0) + (bt.usage_fee ?? 0);
          const isPaid = !!bt.artist_paid_at;
          const isProcessing = pending.has(bt.id);

          return (
            <div
              key={bt.id}
              className="flex items-center justify-between rounded-md px-3 py-2"
              style={{ background: PALETTE.bg, opacity: isPaid ? 0.7 : 1 }}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium" style={{ color: PALETTE.text }}>{name}</span>
                  {discipline && (
                    <span className="text-[10px]" style={{ color: PALETTE.muted }}>{humanise(discipline)}</span>
                  )}
                </div>
                <div className="text-[10px]" style={{ color: PALETTE.muted }}>
                  {bt.role_on_booking}
                  {bt.day_rate ? ` · Day rate ${formatCurrency(bt.day_rate)}` : ''}
                  {bt.usage_fee ? ` · Usage ${formatCurrency(bt.usage_fee)}` : ''}
                </div>
              </div>
              <div className="ml-4 flex items-center gap-3 flex-shrink-0">
                <span className="text-sm font-semibold tabular-nums" style={{ color: PALETTE.text }}>
                  {totalFee > 0 ? formatCurrency(totalFee) : '—'}
                </span>
                {isPaid ? (
                  <span className="text-[10px] font-semibold" style={{ color: PALETTE.success }}>
                    Paid {bt.artist_paid_at ? formatDate(bt.artist_paid_at.slice(0, 10)) : ''}
                  </span>
                ) : (
                  <button
                    onClick={() => handleMarkTalentPaid(bt.id)}
                    disabled={isProcessing}
                    className="rounded px-2 py-1 text-[10px] font-semibold"
                    style={{ background: `${PALETTE.success}22`, color: PALETTE.success, border: `1px solid ${PALETTE.success}44` }}
                  >
                    {isProcessing ? '…' : 'Mark Paid'}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Crew rows */}
        {bookingCrew.map((bc) => {
          const name = bc.crew?.name ?? bc.crew_id.slice(0, 8);
          const role = bc.role_on_booking ?? bc.crew?.primary_role ?? null;
          const isPaid = !!bc.artist_paid_at;
          const isProcessing = pending.has(bc.id);

          return (
            <div
              key={bc.id}
              className="flex items-center justify-between rounded-md px-3 py-2"
              style={{ background: PALETTE.bg, opacity: isPaid ? 0.7 : 1 }}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium" style={{ color: PALETTE.text }}>{name}</span>
                  <span className="text-[10px] rounded px-1" style={{ background: `${PALETTE.muted}22`, color: PALETTE.muted }}>crew</span>
                </div>
                {role && (
                  <div className="text-[10px]" style={{ color: PALETTE.muted }}>
                    {role}
                    {bc.day_rate ? ` · ${formatCurrency(bc.day_rate)}` : ''}
                  </div>
                )}
              </div>
              <div className="ml-4 flex items-center gap-3 flex-shrink-0">
                <span className="text-sm font-semibold tabular-nums" style={{ color: PALETTE.text }}>
                  {bc.day_rate ? formatCurrency(bc.day_rate) : '—'}
                </span>
                {isPaid ? (
                  <span className="text-[10px] font-semibold" style={{ color: PALETTE.success }}>
                    Paid {bc.artist_paid_at ? formatDate(bc.artist_paid_at.slice(0, 10)) : ''}
                  </span>
                ) : (
                  <button
                    onClick={() => handleMarkCrewPaid(bc.id)}
                    disabled={isProcessing}
                    className="rounded px-2 py-1 text-[10px] font-semibold"
                    style={{ background: `${PALETTE.success}22`, color: PALETTE.success, border: `1px solid ${PALETTE.success}44` }}
                  >
                    {isProcessing ? '…' : 'Mark Paid'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Paid summary — collapsed when all paid */}
      {(paidTalent.length > 0 || paidCrew.length > 0) && !allPaid && (
        <div className="mt-2 text-[10px]" style={{ color: PALETTE.muted }}>
          {paidTalent.length + paidCrew.length} of {bookingTalent.length + bookingCrew.length} already paid
        </div>
      )}
    </section>
  );
}
