'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { BookingDetailRow } from '@/lib/data/bookings';
import type { BookingState, UsageLicence } from '@/lib/types/database';
import UsageLicenceBuilder from '@/components/quotes/UsageLicenceBuilder';
import SendQuotePanel, { type PreflightData } from '@/components/bookings/SendQuotePanel';
import StageStepper from '@/components/bookings/StageStepper';
import StageChecklist from '@/components/bookings/StageChecklist';
import { transitionBookingAction } from '@/app/actions/bookings';
import type { StageChecklist as ChecklistData } from '@/lib/utils/booking-stages';
import CloneBookingButton from '@/components/bookings/CloneBookingButton';
import {
  BOOKING_STATE_LABELS, SHOOT_TIER_LABELS, STATE_COLORS,
  STATE_TRANSITIONS, PALETTE,
} from '@/lib/utils/constants';
import { humanise } from '@/lib/utils/humanise';
import { formatCurrency, formatDate } from '@/lib/utils/format';

/** Days between two ISO date strings (or from one ISO date string to now). */
function daysBetween(from: string, to?: string | null): number {
  const start = new Date(from).getTime();
  const end = to ? new Date(to).getTime() : Date.now();
  return Math.round((end - start) / 86_400_000);
}

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

type Props = {
  booking: BookingDetailRow;
  licences: UsageLicence[];
  googleConfigured: boolean;
  /** Pre-computed stage checklist from the server. */
  checklist: ChecklistData;
  /** Show the focused workspace shortcut in the header (only for early states). */
  showWorkspaceShortcut: boolean;
  /** Pre-flight data for the Send Quote gate. */
  preflight?: PreflightData;
};

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

export default function BookingDetail({ booking, licences, googleConfigured, checklist, showWorkspaceShortcut, preflight }: Props) {
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
      {/* ============================================================ */}
      {/* HEADER — title + identity, then stage stepper + checklist,    */}
      {/* then a single row of grouped actions. Three layers, one job   */}
      {/* each: who is this, where is it, what do I do next.            */}
      {/* ============================================================ */}
      <div className="rounded-lg border p-4 space-y-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        {/* Identity row */}
        <div className="flex flex-wrap items-start justify-between gap-3">
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
          {/* Send-quote primary CTA stays prominent in the identity row */}
          <SendQuotePanel
            bookingId={booking.id}
            clientEmail={booking.client?.email ?? null}
            clientName={booking.client?.company || booking.client?.name || ''}
            bookingRef={booking.booking_ref}
            title={booking.title}
            grandTotal={booking.grand_total ?? 0}
            currentState={booking.state}
            googleConfigured={googleConfigured}
            preflight={preflight}
          />
        </div>

        {/* Tools — moved up. Edit / workspace / print / call-sheet links sit
            close to the title so they're always one glance away. */}
        <div className="flex flex-wrap gap-2 text-xs" style={{ color: PALETTE.muted }}>
          <span className="text-[10px] font-semibold uppercase tracking-wider self-center mr-1">Tools</span>
          <Link
            href={`/bookings/${booking.id}/edit`}
            className="rounded-md px-2.5 py-1 text-[11px]"
            style={{ background: 'transparent', color: PALETTE.text, border: `1px solid ${PALETTE.border}` }}
          >
            Edit booking
          </Link>
          {showWorkspaceShortcut && (
            <Link
              href={`/inbox/${booking.id}`}
              className="rounded-md px-2.5 py-1 text-[11px]"
              style={{ background: `${PALETTE.accent}18`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}44` }}
              title="Brief → Quote → Send focused workspace"
            >
              Open workspace
            </Link>
          )}
          <Link
            href={`/print/bookings/${booking.id}/quote`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md px-2.5 py-1 text-[11px]"
            style={{ background: 'transparent', color: PALETTE.muted, border: `1px solid ${PALETTE.border}` }}
          >
            Print quote
          </Link>
          <a
            href={`/api/print/quote/${booking.id}`}
            className="rounded-md px-2.5 py-1 text-[11px]"
            title="Download a server-rendered PDF of the quote — for attaching to client emails"
            style={{ background: 'transparent', color: PALETTE.muted, border: `1px solid ${PALETTE.border}` }}
          >
            ⤓ Quote PDF
          </a>
          {booking.quote_token && (
            <Link
              href={`/q/${booking.quote_token}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md px-2.5 py-1 text-[11px]"
              title="Public client-facing quote link"
              style={{ background: 'transparent', color: PALETTE.muted, border: `1px solid ${PALETTE.border}` }}
            >
              Client view
            </Link>
          )}
          <Link
            href={`/print/bookings/${booking.id}/invoice`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md px-2.5 py-1 text-[11px]"
            style={{ background: 'transparent', color: PALETTE.muted, border: `1px solid ${PALETTE.border}` }}
          >
            Print invoice
          </Link>
          <Link
            href={`/print/bookings/${booking.id}/call-sheet`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md px-2.5 py-1 text-[11px]"
            title="Auto-generated call sheet"
            style={{ background: 'transparent', color: PALETTE.muted, border: `1px solid ${PALETTE.border}` }}
          >
            Call sheet
          </Link>
          <CloneBookingButton
            sourceBookingId={booking.id}
            label="Use as template"
          />
          {booking.drive_root_link && (
            <a
              href={booking.drive_root_link}
              target="_blank"
              rel="noreferrer"
              className="rounded-md px-2.5 py-1 text-[11px]"
              title="Open booking Drive folder"
              style={{ background: `${PALETTE.accent}18`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}44` }}
            >
              Drive ↗
            </a>
          )}
        </div>

        {/* Stage stepper — 5 groups */}
        <StageStepper state={booking.state} />

        {/* Stage checklist — what's left to do at this stage */}
        <StageChecklist checklist={checklist} />

        {/* Action rows: state transitions on top, navigation links below */}
        {allowedTransitions.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: PALETTE.border }}>
            <span className="text-[10px] font-semibold uppercase tracking-wider self-center mr-1" style={{ color: PALETTE.muted }}>
              Advance to
            </span>
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

      {/* Brief — combined panel containing the brief fields, usage details
          (media / territory / duration / notes), and the usage licence builder.
          Usage is part of the brief: it's a property of the job, not a
          separate concept. Merging the panels makes that clear. */}
      <section className="rounded-lg border p-4 space-y-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Brief</h3>

        {/* Core brief fields */}
        <div className="grid gap-3 sm:grid-cols-2">
          {clientName && <Field label="Client" value={clientName} />}
          {brandName && <Field label="Brand" value={brandName} />}
          <Field label="Shoot location" value={booking.shoot_location} />
          <Field label="Shoot dates" value={formatShootDates(booking.shoot_dates) ?? booking.shoot_date_notes} />
          <Field label="Talent spec" value={humanise(booking.talent_spec) || booking.talent_spec} />
          <Field label="Deliverables type" value={humanise(booking.deliverables_type) || booking.deliverables_type} />
          <Field label="Deliverables count" value={booking.deliverables_count} />
          <Field label="Post-production" value={humanise(booking.post_production_ownership)} />
          <Field label="Selects cadence" value={booking.selects_cadence} />
        </div>

        {/* Usage details — only render the divider + section if there's something to show */}
        {(booking.usage_media?.length || booking.usage_territory?.length || booking.usage_duration_months || booking.usage_notes) ? (
          <div className="border-t pt-3" style={{ borderColor: PALETTE.border }}>
            <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: PALETTE.muted }}>Usage</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {booking.usage_duration_months ? (
                <Field
                  label="Duration"
                  value={`${booking.usage_duration_months} ${booking.usage_duration_months === 1 ? 'month' : 'months'}`}
                />
              ) : null}
              {booking.usage_notes ? <Field label="Notes" value={booking.usage_notes} /> : null}
              {booking.usage_media?.length ? (
                <div className="sm:col-span-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: PALETTE.muted }}>Media</div>
                  <div className="flex flex-wrap gap-1">
                    {booking.usage_media.map((m) => (
                      <span key={m} className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: `${PALETTE.accent}15`, color: PALETTE.accent }}>{humanise(m)}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {booking.usage_territory?.length ? (
                <div className="sm:col-span-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: PALETTE.muted }}>Territory</div>
                  <div className="flex flex-wrap gap-1">
                    {booking.usage_territory.map((t) => (
                      <span key={t} className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: `${PALETTE.warning}15`, color: PALETTE.warning }}>{humanise(t)}</span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Usage licences — fee lines linked to media/territory/duration */}
        <div className="border-t pt-4" style={{ borderColor: PALETTE.border }}>
          <UsageLicenceBuilder bookingId={booking.id} licences={licences} />
        </div>
      </section>

      {/* Invoice & payment status — only meaningful once invoiced.
          The full financial breakdown (subtotal / ASF / GST / agency margin
          / GST passthrough) lives on the Quote panel further down so we
          have a single source of truth. */}
      {booking.invoice_issued_at && (() => {
        const doi = booking.paid_at
          ? daysBetween(booking.invoice_issued_at!, booking.paid_at)
          : daysBetween(booking.invoice_issued_at!);
        const overdue = !booking.paid_at && doi > 30;
        return (
          <Section title="Invoice & payment">
            <Field
              label="Invoice issued"
              value={formatDate(booking.invoice_issued_at!.slice(0, 10))}
            />
            <Field
              label={booking.paid_at ? 'Days to pay (DOI)' : 'Days outstanding'}
              value={
                <span style={{ color: overdue ? PALETTE.danger : booking.paid_at ? PALETTE.success : PALETTE.warning, fontWeight: 600 }}>
                  {doi} {doi === 1 ? 'day' : 'days'}
                  {overdue ? ' — overdue' : ''}
                </span>
              }
            />
            {booking.paid_at && (
              <Field
                label="Paid"
                value={
                  <span style={{ color: PALETTE.success }}>
                    {formatDate(booking.paid_at.slice(0, 10))}
                  </span>
                }
              />
            )}
          </Section>
        );
      })()}

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
