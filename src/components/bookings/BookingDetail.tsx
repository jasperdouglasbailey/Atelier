'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { BookingDetailRow } from '@/lib/data/bookings';
import type { UsageLicence } from '@/lib/types/database';
import { dateRangeToInputs } from '@/lib/utils/daterange';
import UsageLicenceBuilder from '@/components/quotes/UsageLicenceBuilder';
import SendQuotePanel, { type PreflightData } from '@/components/bookings/SendQuotePanel';
import StageStepper from '@/components/bookings/StageStepper';
import StageChecklist from '@/components/bookings/StageChecklist';
import type { StageChecklist as ChecklistData } from '@/lib/utils/booking-stages';
import CloneBookingButton from '@/components/bookings/CloneBookingButton';
import PrintDocsMenu from '@/components/bookings/PrintDocsMenu';
import UndoConversionButton from '@/components/bookings/UndoConversionButton';
import InlineField from '@/components/bookings/InlineField';
import InlineDateRange from '@/components/bookings/InlineDateRange';
import {
  BOOKING_STATE_LABELS, SHOOT_TIER_LABELS, SHOOT_TIERS, STATE_COLORS,
  PALETTE,
} from '@/lib/utils/constants';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { humanise } from '@/lib/utils/humanise';

function daysBetween(from: string, to?: string | null): number {
  const start = new Date(from).getTime();
  const end = to ? new Date(to).getTime() : Date.now();
  return Math.round((end - start) / 86_400_000);
}

type Props = {
  booking: BookingDetailRow;
  licences: UsageLicence[];
  googleConfigured: boolean;
  checklist: ChecklistData;
  showWorkspaceShortcut: boolean;
  preflight?: PreflightData;
  talentNames?: string[];
  /** When true: hides the ID strip, StageStepper, and StageChecklist (they are rendered in the page-level header/layout). */
  suppressHeader?: boolean;
};

const POST_PROD_OPTIONS = [
  { value: '', label: '— Not set —' },
  { value: 'us_via_artist', label: 'Us via artist' },
  { value: 'us_via_post_team', label: 'Us via post team' },
  { value: 'client_in_house', label: 'Client in-house' },
  { value: 'client_outsourced', label: 'Client outsourced' },
];

const GRADE_RETOUCH_OPTIONS = [
  { value: '', label: '— Not set —' },
  { value: 'grade_and_retouch', label: 'Grade & Retouch' },
  { value: 'grade_only', label: 'Grade only' },
];

const TIER_OPTIONS = SHOOT_TIERS.map((t) => ({ value: t, label: SHOOT_TIER_LABELS[t] }));

export default function BookingDetail({
  booking, licences, googleConfigured, checklist, showWorkspaceShortcut, preflight, talentNames,
  suppressHeader = false,
}: Props) {
  const [briefExpanded, setBriefExpanded] = useState(false);

  const clientName = booking.client?.company || booking.client?.name || null;
  const brandName = booking.brand?.name || null;

  return (
    <div className="space-y-3">
      {/* ═══════════════════════════════════════════════════════════════════
          1. ID STRIP — title, state, ref, total + primary CTAs on the right
          Hidden when suppressHeader=true (rendered in BookingPageHeader instead)
          ═══════════════════════════════════════════════════════════════════ */}
      {!suppressHeader && <div
        className="rounded-lg border p-4 flex items-start justify-between gap-4 flex-wrap"
        style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-lg font-semibold" style={{ color: PALETTE.text }}>
              {booking.title}
            </h2>
            <span
              className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: `${STATE_COLORS[booking.state]}22`, color: STATE_COLORS[booking.state] }}
            >
              {BOOKING_STATE_LABELS[booking.state]}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: PALETTE.muted }}>
            <span>{booking.booking_ref}</span>
            <span>·</span>
            <span>{SHOOT_TIER_LABELS[booking.tier]}</span>
            {clientName && (
              <>
                <span>·</span>
                {booking.client?.id ? (
                  <Link
                    href={`/clients/${booking.client.id}`}
                    className="hover:underline"
                    style={{ color: PALETTE.accent }}
                  >
                    {clientName}
                  </Link>
                ) : (
                  <span style={{ color: PALETTE.accent }}>{clientName}</span>
                )}
              </>
            )}
            {brandName && (
              <>
                <span>·</span>
                <span>{brandName}</span>
              </>
            )}
            {booking.grand_total > 0 && (
              <>
                <span>·</span>
                <span style={{ color: PALETTE.text, fontWeight: 600 }}>
                  {formatCurrency(booking.grand_total, 'AUD')}
                </span>
              </>
            )}
          </div>

          {/* Talent + producer contact line — labels use · separator for readability */}
          {(talentNames && talentNames.length > 0 || booking.producer_name) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs" style={{ color: PALETTE.muted }}>
              {talentNames && talentNames.length > 0 && (
                <span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider">
                    {talentNames.length > 1 ? 'Artists' : 'Artist'}
                  </span>
                  <span className="mx-1" style={{ color: PALETTE.border }}>·</span>
                  <span style={{ color: PALETTE.text }}>{talentNames.join(' · ')}</span>
                </span>
              )}
              {booking.producer_name && (
                <>
                  {talentNames && talentNames.length > 0 && <span style={{ color: PALETTE.border }}>·</span>}
                  <span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider">Contact</span>
                    <span className="mx-1" style={{ color: PALETTE.border }}>·</span>
                    <span style={{ color: PALETTE.text }}>{booking.producer_name}</span>
                  </span>
                  {booking.producer_email && (
                    <a href={`mailto:${booking.producer_email}`} style={{ color: PALETTE.accent }}>
                      {booking.producer_email}
                    </a>
                  )}
                  {booking.producer_phone && (
                    <span>{booking.producer_phone}</span>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 flex-shrink-0">
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
          {booking.drive_root_link && (
            <a
              href={booking.drive_root_link}
              target="_blank"
              rel="noreferrer"
              className="rounded-md px-3 py-1.5 text-xs font-medium"
              style={{ background: `${PALETTE.accent}18`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}44` }}
            >
              ↗ Drive
            </a>
          )}
        </div>
      </div>}

      {/* ═══════════════════════════════════════════════════════════════════
          2. STAGE STEPPER — compact 5-group progress indicator
          Hidden when suppressHeader=true (rendered in BookingPageHeader)
          ═══════════════════════════════════════════════════════════════════ */}
      {!suppressHeader && <StageStepper state={booking.state} />}

      {/* ═══════════════════════════════════════════════════════════════════
          3. PRINT & TOOLS STRIP — print links + workspace shortcut
          Advance buttons moved to BookingPageHeader (top-right).
          Call-sheet print removed — replaced by Copy team button in header.
          ═══════════════════════════════════════════════════════════════════ */}
      <div
        className="rounded-lg border px-3 py-2 flex flex-wrap items-center gap-2"
        style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>
          Print &amp; tools
        </span>
        <PrintDocsMenu bookingId={booking.id} />
        {booking.quote_token && (
          <Link
            href={`/q/${booking.quote_token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded px-2 py-0.5 text-[11px]"
            style={{ background: 'transparent', color: PALETTE.muted, border: `1px solid ${PALETTE.border}` }}
          >
            Client view
          </Link>
        )}
        <CloneBookingButton sourceBookingId={booking.id} label="Use as template" />
        {/* Undo conversion — only when auto-imported from Gmail and still in
            brief_received. The component itself does the < 24h check via a
            mount-time lazy state initializer (lint forbids Date.now() in render). */}
        {booking.source_gmail_message_id && booking.state === 'brief_received' && (
          <UndoConversionButton bookingId={booking.id} createdAt={booking.created_at} />
        )}
        {showWorkspaceShortcut && (
          <Link
            href={`/inbox/${booking.id}`}
            className="rounded px-2 py-0.5 text-[11px]"
            style={{ background: `${PALETTE.accent}18`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}44` }}
            title="Brief → Quote → Send focused workspace"
          >
            Open workspace
          </Link>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          4. WHAT'S NEXT — stage checklist + warnings (OT window, cancellation)
          Hidden when suppressHeader=true (checklist rendered in two-column layout
          and advance buttons live in BookingAdvanceButtons in the page header).
          ═══════════════════════════════════════════════════════════════════ */}
      {!suppressHeader && <StageChecklist checklist={checklist} />}

      {booking.ot_expenses_window_end && !booking.ot_expenses_locked && (
        <div
          className="rounded-md border px-3 py-2 text-xs"
          style={{ borderColor: PALETTE.warning, color: PALETTE.warning, background: `${PALETTE.warning}11` }}
        >
          OT/expenses window open until {new Date(booking.ot_expenses_window_end).toLocaleDateString()}
        </div>
      )}
      {booking.ot_expenses_locked && (
        <div
          className="rounded-md border px-3 py-2 text-xs"
          style={{ borderColor: PALETTE.muted, color: PALETTE.muted }}
        >
          OT/expenses window closed — financial state locked
        </div>
      )}

      {(booking.cancellation_reason || booking.release_reason) && (
        <div
          className="rounded-md border px-3 py-2 text-xs"
          style={{
            borderColor: booking.state === 'cancelled' ? PALETTE.danger : PALETTE.muted,
            background: booking.state === 'cancelled' ? `${PALETTE.danger}11` : `${PALETTE.muted}11`,
            color: booking.state === 'cancelled' ? PALETTE.danger : PALETTE.muted,
          }}
        >
          <strong className="uppercase tracking-wide">
            {booking.state === 'cancelled' ? 'Cancelled' : 'Released'}:
          </strong>{' '}
          {booking.cancellation_reason || booking.release_reason}
          {booking.released_to && <> · won by {booking.released_to}</>}
          {booking.cancellation_fee != null && booking.cancellation_fee > 0 && (
            <> · cancellation fee {formatCurrency(booking.cancellation_fee, 'AUD')}</>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          5. BRIEF — compact summary + expandable inline fields
          Hidden when suppressHeader=true (BookingJobFacts on right column
          renders these fields inline-editable instead).
          ═══════════════════════════════════════════════════════════════════ */}
      {!suppressHeader && (<section
        className="rounded-lg border p-3 space-y-2"
        style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
      >
        {/* Header row — compact summary + expand toggle */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-baseline gap-2 flex-wrap flex-1 min-w-0">
            <h3 className="section-title flex-shrink-0">Brief</h3>
            {!briefExpanded && (() => {
              const { start, end } = dateRangeToInputs(booking.shoot_dates);
              const dateStr = start
                ? (end && end !== start ? `${formatDate(start)} – ${formatDate(end)}` : formatDate(start))
                : booking.shoot_date_notes ?? null;
              return (
                <span className="text-xs truncate" style={{ color: PALETTE.text }}>
                  {[
                    dateStr,
                    booking.shoot_location,
                    booking.deliverables_type ? humanise(booking.deliverables_type) : null,
                  ].filter(Boolean).join(' · ')}
                </span>
              );
            })()}
          </div>
          <button
            onClick={() => setBriefExpanded((v) => !v)}
            className="flex-shrink-0 text-[11px] font-medium rounded px-2 py-0.5"
            style={{ color: PALETTE.accent, background: `${PALETTE.accent}11`, border: 'none', cursor: 'pointer' }}
          >
            {briefExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>

        {briefExpanded && (
          <>
          <div className="text-[10px] pb-1" style={{ color: PALETTE.muted, opacity: 0.7 }}>
            Click any field to edit · Esc cancels
          </div>

        <div className="grid gap-1 sm:grid-cols-3">
          {/* Display-only — client/brand changed via /bookings/[id]/edit since
              they affect Drive folder linkage and quote pricing. */}
          {clientName && (
            <div className="px-2.5 py-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>Client</div>
              <div className="mt-0.5 text-sm" style={{ color: PALETTE.text }}>{clientName}</div>
            </div>
          )}
          {brandName && (
            <div className="px-2.5 py-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>Brand</div>
              <div className="mt-0.5 text-sm" style={{ color: PALETTE.text }}>{brandName}</div>
            </div>
          )}

          <InlineField
            bookingId={booking.id}
            field="title"
            label="Title"
            value={booking.title}
            placeholder="Booking title"
          />
          <InlineField
            bookingId={booking.id}
            field="tier"
            label="Tier"
            value={booking.tier}
            variant="select"
            options={TIER_OPTIONS}
            format={(v) => v ? SHOOT_TIER_LABELS[v as keyof typeof SHOOT_TIER_LABELS] ?? String(v) : null}
          />
          <InlineField
            bookingId={booking.id}
            field="shoot_location"
            label="Shoot location"
            value={booking.shoot_location}
            placeholder="Sydney, Pier 2/3"
          />
          <InlineDateRange
            bookingId={booking.id}
            label="Shoot dates"
            shootDates={booking.shoot_dates}
            shootDateNotes={booking.shoot_date_notes}
          />
          <InlineField
            bookingId={booking.id}
            field="call_time"
            label="Call time"
            value={booking.call_time}
            variant="time"
            placeholder="07:00"
          />
          <InlineField
            bookingId={booking.id}
            field="wrap_time"
            label="Wrap time"
            value={booking.wrap_time}
            variant="time"
            placeholder="18:00"
          />
          <InlineField
            bookingId={booking.id}
            field="deliverables_type"
            label="Deliverables"
            value={booking.deliverables_type}
            placeholder="e.g. eCommerce, BTS video"
            format={(v) => v ? (humanise(String(v)) || String(v)) : null}
          />
          <InlineField
            bookingId={booking.id}
            field="deliverables_count"
            label="Deliverables count"
            value={booking.deliverables_count}
            variant="number"
            placeholder="48"
          />
          <InlineField
            bookingId={booking.id}
            field="post_production_ownership"
            label="Post-production"
            value={booking.post_production_ownership}
            variant="select"
            options={POST_PROD_OPTIONS}
            format={(v) => v ? humanise(String(v)) : null}
          />
          <InlineField
            bookingId={booking.id}
            field="grade_retouch_scope"
            label="Grade"
            value={booking.grade_retouch_scope}
            variant="select"
            options={GRADE_RETOUCH_OPTIONS}
            format={(v) => {
              if (!v) return null;
              return v === 'grade_and_retouch' ? 'Grade & Retouch' : 'Grade only';
            }}
          />
          <InlineField
            bookingId={booking.id}
            field="selects_cadence"
            label="Selects Due"
            value={booking.selects_cadence}
            placeholder="EOD same-day"
          />
          <InlineField
            bookingId={booking.id}
            field="confirmation_deadline"
            label="Confirm by"
            value={booking.confirmation_deadline}
            variant="date"
            format={(v) => v ? formatDate(String(v)) : null}
          />
        </div>

        <div className="grid gap-1 sm:grid-cols-3 pt-2 border-t" style={{ borderColor: PALETTE.border }}>
          <InlineField
            bookingId={booking.id}
            field="producer_name"
            label="Producer"
            value={booking.producer_name}
            placeholder="Name"
          />
          <InlineField
            bookingId={booking.id}
            field="producer_email"
            label="Producer email"
            value={booking.producer_email}
            placeholder="name@client.com"
          />
          <InlineField
            bookingId={booking.id}
            field="producer_phone"
            label="Producer phone"
            value={booking.producer_phone}
            placeholder="04…"
          />
        </div>

        <div className="grid gap-1 sm:grid-cols-2 pt-2 border-t" style={{ borderColor: PALETTE.border }}>
          <InlineField
            bookingId={booking.id}
            field="po_number"
            label="PO number"
            value={booking.po_number}
            placeholder="Client purchase order"
          />
          <InlineField
            bookingId={booking.id}
            field="job_number"
            label="Job number"
            value={booking.job_number}
            placeholder="Client or internal job ref"
          />
        </div>

        <div className="pt-2 border-t" style={{ borderColor: PALETTE.border }}>
          <UsageLicenceBuilder bookingId={booking.id} licences={licences} />
        </div>
          </>
        )}
      </section>)}

      {/* ═══════════════════════════════════════════════════════════════════
          6. INVOICE & PAYMENT — only renders once invoice has been issued
          ═══════════════════════════════════════════════════════════════════ */}
      {booking.invoice_issued_at && (() => {
        const doi = booking.paid_at
          ? daysBetween(booking.invoice_issued_at!, booking.paid_at)
          : daysBetween(booking.invoice_issued_at!);
        const overdue = !booking.paid_at && doi > 30;
        return (
          <section
            className="rounded-lg border p-4"
            style={{
              background: PALETTE.surface,
              borderColor: booking.paid_at ? `${PALETTE.success}66` : overdue ? `${PALETTE.danger}66` : PALETTE.border,
            }}
          >
            <h3 className="section-title mb-3">
              Invoice &amp; payment
            </h3>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>Invoice issued</div>
                <div className="mt-0.5 text-sm" style={{ color: PALETTE.text }}>
                  {formatDate(booking.invoice_issued_at!.slice(0, 10))}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>
                  {booking.paid_at ? 'Days to pay (DOI)' : 'Days outstanding'}
                </div>
                <div
                  className="mt-0.5 text-sm font-semibold"
                  style={{ color: overdue ? PALETTE.danger : booking.paid_at ? PALETTE.success : PALETTE.warning }}
                >
                  {doi} {doi === 1 ? 'day' : 'days'}{overdue ? ' — overdue' : ''}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>Paid</div>
                <div className="mt-0.5 text-sm" style={{ color: booking.paid_at ? PALETTE.success : PALETTE.muted }}>
                  {booking.paid_at ? formatDate(booking.paid_at.slice(0, 10)) : '—'}
                </div>
              </div>
            </div>
          </section>
        );
      })()}

      {/* ═══════════════════════════════════════════════════════════════════
          7. RAW BRIEF — collapsed by default, only useful for reference
          ═══════════════════════════════════════════════════════════════════ */}
      {booking.brief_raw_text && (
        <details
          className="rounded-lg border"
          style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
        >
          <summary
            className="cursor-pointer px-4 py-2 text-xs font-semibold uppercase tracking-wide"
            style={{ color: PALETTE.muted }}
          >
            Raw brief text (original email)
          </summary>
          <pre
            className="whitespace-pre-wrap break-all text-xs px-4 pb-4"
            style={{ color: PALETTE.muted, fontFamily: 'ui-monospace, monospace' }}
          >
            {booking.brief_raw_text}
          </pre>
        </details>
      )}
    </div>
  );
}
