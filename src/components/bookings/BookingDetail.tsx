'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { BookingDetailRow } from '@/lib/data/bookings';
import type { BookingState } from '@/lib/types/database';
import type { AgencyMargin } from '@/lib/utils/fee-engine';
import { transitionBookingAction } from '@/app/actions/bookings';
import {
  BOOKING_STATE_LABELS, SHOOT_TIER_LABELS, STATE_COLORS,
  STATE_TRANSITIONS, PALETTE,
} from '@/lib/utils/constants';
import { formatCurrency, formatDate } from '@/lib/utils/format';

/** Parses a Postgres daterange string and returns a human-readable date span. */
function formatShootDates(range: string | null): string | null {
  if (!range) return null;
  const m = range.match(/^[\[(](\d{4}-\d{2}-\d{2})?,(\d{4}-\d{2}-\d{2})?[\])]$/);
  if (!m || !m[1]) return null;
  const start = m[1];
  if (m[2]) {
    // Postgres daterange end is exclusive — subtract 1 day for display
    const end = new Date(m[2] + 'T00:00:00Z');
    end.setUTCDate(end.getUTCDate() - 1);
    const endStr = end.toISOString().slice(0, 10);
    return endStr === start ? formatDate(start) : `${formatDate(start)} – ${formatDate(endStr)}`;
  }
  return formatDate(start);
}

type Props = { booking: BookingDetailRow; margin?: AgencyMargin | null };

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>{label}</div>
      <div className="mt-0.5 text-sm" style={{ color: PALETTE.text }}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export default function BookingDetail({ booking, margin = null }: Props) {
  const router = useRouter();
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const allowedTransitions = STATE_TRANSITIONS[booking.state] ?? [];

  const clientName = booking.client?.company || booking.client?.name || null;
  const brandName = booking.brand?.name || null;

  async function handleTransition(newState: BookingState) {
    setTransitioning(true);
    setTransitionError(null);

    let meta: { reason?: string; releasedTo?: string; cancellationFee?: number } | undefined;

    if (newState === 'released') {
      const reason = prompt('Release reason (optional):');
      const releasedTo = prompt('Who won the job? (optional):');
      meta = { reason: reason ?? undefined, releasedTo: releasedTo ?? undefined };
    }
    if (newState === 'cancelled') {
      const reason = prompt('Cancellation reason:');
      const feeStr = prompt('Cancellation fee ($, 0 if none):');
      meta = { reason: reason ?? undefined, cancellationFee: feeStr ? Number(feeStr) : undefined };
    }

    const result = await transitionBookingAction(booking.id, newState, meta);
    if ('error' in result) {
      setTransitionError(result.error ?? 'Unknown error');
      setTransitioning(false);
    } else {
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold" style={{ color: PALETTE.text }}>{booking.title}</h2>
            <span
              className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase"
              style={{ background: `${STATE_COLORS[booking.state]}22`, color: STATE_COLORS[booking.state] }}
            >
              {BOOKING_STATE_LABELS[booking.state]}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-3 text-xs" style={{ color: PALETTE.muted }}>
            <span>{booking.booking_ref}</span>
            <span>{SHOOT_TIER_LABELS[booking.tier]}</span>
            {clientName && (
              <Link
                href={booking.client?.id ? `/clients/${booking.client.id}` : '#'}
                className="hover:underline"
                style={{ color: PALETTE.accent }}
              >
                {clientName}
              </Link>
            )}
            {brandName && (
              <span>{brandName}</span>
            )}
            {booking.grand_total > 0 && <span>{formatCurrency(booking.grand_total, 'AUD')}</span>}
          </div>
        </div>

        {/* Print / document actions */}
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/bookings/${booking.id}/edit`}
            className="rounded-md px-3 py-1.5 text-xs font-medium"
            style={{ background: PALETTE.surface, color: PALETTE.text, border: `1px solid ${PALETTE.border}` }}
          >
            ✏ Edit
          </Link>
          <Link
            href={`/print/bookings/${booking.id}/quote`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md px-3 py-1.5 text-xs font-medium"
            style={{ background: PALETTE.surface, color: PALETTE.accent, border: `1px solid ${PALETTE.border}` }}
          >
            ↗ Quote
          </Link>
          <Link
            href={`/print/bookings/${booking.id}/invoice`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md px-3 py-1.5 text-xs font-medium"
            style={{ background: PALETTE.surface, color: PALETTE.muted, border: `1px solid ${PALETTE.border}` }}
          >
            ↗ Invoice
          </Link>
        </div>

        {/* State transitions */}
        {allowedTransitions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {allowedTransitions.map((state) => {
              const isExit = state === 'released' || state === 'cancelled';
              return (
                <button
                  key={state}
                  onClick={() => handleTransition(state)}
                  disabled={transitioning}
                  className="rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                  style={{
                    background: isExit ? `${PALETTE.danger}22` : PALETTE.accent,
                    color: isExit ? PALETTE.danger : PALETTE.bg,
                    border: isExit ? `1px solid ${PALETTE.danger}44` : 'none',
                  }}
                >
                  → {BOOKING_STATE_LABELS[state]}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {transitionError && (
        <div className="rounded-md border px-3 py-2 text-xs" style={{ borderColor: PALETTE.danger, color: PALETTE.danger }}>
          {transitionError}
        </div>
      )}

      {/* OT/expenses window indicator */}
      {booking.ot_expenses_window_end && !booking.ot_expenses_locked && (
        <div className="rounded-md border px-3 py-2 text-xs" style={{ borderColor: PALETTE.warning, color: PALETTE.warning, background: `${PALETTE.warning}11` }}>
          OT/expenses window open until {new Date(booking.ot_expenses_window_end).toLocaleDateString()}
        </div>
      )}
      {booking.ot_expenses_locked && (
        <div className="rounded-md border px-3 py-2 text-xs" style={{ borderColor: PALETTE.muted, color: PALETTE.muted }}>
          OT/expenses window closed — financial state locked
        </div>
      )}

      {/* Brief fields */}
      <Section title="Brief">
        {clientName && <Field label="Client" value={clientName} />}
        {brandName && <Field label="Brand" value={brandName} />}
        <Field label="Shoot Location" value={booking.shoot_location} />
        <Field label="Shoot Dates" value={formatShootDates(booking.shoot_dates) ?? booking.shoot_date_notes} />
        <Field label="Talent Spec" value={booking.talent_spec} />
        <Field label="Deliverables Type" value={booking.deliverables_type} />
        <Field label="Deliverables Count" value={booking.deliverables_count} />
        <Field label="Post-Production" value={booking.post_production_ownership} />
        <Field label="Selects Cadence" value={booking.selects_cadence} />
      </Section>

      <Section title="Usage">
        <Field label="Media" value={booking.usage_media?.join(', ')} />
        <Field label="Territory" value={booking.usage_territory?.join(', ')} />
        <Field label="Duration" value={booking.usage_duration_months ? `${booking.usage_duration_months} months` : null} />
        <Field label="Notes" value={booking.usage_notes} />
      </Section>

      <Section title="Financials">
        <Field label="Subtotal" value={booking.subtotal > 0 ? formatCurrency(booking.subtotal, 'AUD') : null} />
        <Field label="ASF" value={booking.total_asf > 0 ? formatCurrency(booking.total_asf, 'AUD') : null} />
        <Field label="GST" value={booking.total_gst > 0 ? formatCurrency(booking.total_gst, 'AUD') : null} />
        <Field label="Grand Total" value={booking.grand_total > 0 ? formatCurrency(booking.grand_total, 'AUD') : null} />
        {margin && margin.total > 0 && (
          <>
            <Field
              label="Agency Margin"
              value={
                <span style={{ color: PALETTE.success, fontWeight: 600 }}>
                  {formatCurrency(margin.total, 'AUD')}
                </span>
              }
            />
            <Field
              label="Margin Breakdown"
              value={
                <span className="text-[11px]" style={{ color: PALETTE.muted }}>
                  Commission {formatCurrency(margin.commission, 'AUD')}
                  {margin.asf > 0 ? ` · ASF ${formatCurrency(margin.asf, 'AUD')}` : ''}
                  {margin.superSpread > 0 ? ` · Super spread ${formatCurrency(margin.superSpread, 'AUD')}` : ''}
                </span>
              }
            />
          </>
        )}
      </Section>

      {(booking.cancellation_reason || booking.release_reason) && (
        <Section title={booking.state === 'cancelled' ? 'Cancellation' : 'Release'}>
          <Field label="Reason" value={booking.cancellation_reason || booking.release_reason} />
          {booking.released_to && <Field label="Won by" value={booking.released_to} />}
          {booking.cancellation_fee != null && booking.cancellation_fee > 0 && (
            <Field label="Cancellation Fee" value={formatCurrency(booking.cancellation_fee, 'AUD')} />
          )}
        </Section>
      )}

      {/* Google links — shown once quote_confirmed fires */}
      {(booking.drive_root_link || booking.calendar_event_id) && (
        <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Google</h3>
          <div className="flex flex-wrap gap-2">
            {booking.calendar_event_id && (
              <a
                href={`https://calendar.google.com/calendar/r/eventedit/${booking.calendar_event_id}`}
                target="_blank"
                rel="noreferrer"
                className="rounded px-2 py-1 text-xs font-medium"
                style={{ background: `${PALETTE.accent}22`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}44` }}
              >
                Calendar Event
              </a>
            )}
            {booking.drive_root_link && (
              <a
                href={booking.drive_root_link}
                target="_blank"
                rel="noreferrer"
                className="rounded px-2 py-1 text-xs font-medium"
                style={{ background: `${PALETTE.accent}22`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}44` }}
              >
                Drive Folder
              </a>
            )}
            {booking.drive_folder_ids && (
              (['briefs', 'selects', 'retouched', 'finals', 'admin'] as const).map((key) => {
                const folderId = booking.drive_folder_ids![key];
                const label = key === 'finals' ? 'Finals' : key.charAt(0).toUpperCase() + key.slice(1);
                return (
                  <a
                    key={key}
                    href={`https://drive.google.com/drive/folders/${folderId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded px-2 py-1 text-xs"
                    style={{ background: PALETTE.surface, color: PALETTE.muted, border: `1px solid ${PALETTE.border}` }}
                  >
                    {label}
                  </a>
                );
              })
            )}
          </div>
        </section>
      )}

      {booking.agency_notes && (
        <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Agency Notes</h3>
          <p className="whitespace-pre-wrap text-sm" style={{ color: PALETTE.text }}>{booking.agency_notes}</p>
        </section>
      )}

      {booking.brief_raw_text && (
        <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Raw Brief</h3>
          <pre className="whitespace-pre-wrap text-xs" style={{ color: PALETTE.muted }}>{booking.brief_raw_text}</pre>
        </section>
      )}
    </div>
  );
}
