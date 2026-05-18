'use client';

import { useState } from 'react';
import type { BookingDetailRow } from '@/lib/data/bookings';
import type { BookingSchedule } from '@/lib/types/database';
import InlineField from '@/components/bookings/InlineField';
import InlineDateRange from '@/components/bookings/InlineDateRange';
import { PALETTE, SHOOT_TIERS, SHOOT_TIER_LABELS } from '@/lib/utils/constants';
import { formatDate } from '@/lib/utils/format';

const TIER_OPTIONS = SHOOT_TIERS.map((t) => ({ value: t, label: SHOOT_TIER_LABELS[t] }));

const POST_PROD_OPTIONS = [
  { value: '',                   label: '— Not set —' },
  { value: 'us_via_artist',      label: 'Us via artist' },
  { value: 'us_via_post_team',   label: 'Us via post team' },
  { value: 'client_in_house',    label: 'Client in-house' },
  { value: 'client_outsourced',  label: 'Client outsourced' },
];

const GRADE_RETOUCH_OPTIONS = [
  { value: '',                  label: '— Not set —' },
  { value: 'grade_and_retouch', label: 'Grade & Retouch' },
  { value: 'grade_only',        label: 'Grade only' },
];

type Props = {
  booking: BookingDetailRow;
  schedules: BookingSchedule[];
};

/**
 * Compact job-facts panel — dense horizontal rows instead of the previous
 * 60-80px-tall stacked fields. Reorganised so the operationally-critical
 * facts (dates, location, tier, deliverables, producer contact) are
 * always visible, with the longer tail (post-prod ownership, grade scope,
 * looks per talent, deadline, producer phone, title) tucked behind an
 * "Additional details" expander.
 *
 * Title is dropped from primary — it's already in the page header and
 * rarely edited. Tier is promoted to primary because it determines the
 * fee defaults applied to every line item; producers should see it.
 *
 * Layout: each row is ~30px tall with the label fixed-width on the left
 * and the value (click-to-edit) flex-1 on the right. Two-column grid for
 * paired fields like Call/Wrap and Producer/Email.
 */
export default function BookingJobFacts({ booking, schedules }: Props) {
  const [expanded, setExpanded] = useState(false);

  const callTimeSchedules = schedules.filter((s) => s.call_time || s.wrap_time);

  return (
    <div
      className="rounded-lg border"
      style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: PALETTE.border }}>
        <div className="section-title">Job facts</div>
        <span
          style={{
            fontFamily: 'var(--font-dm-mono), monospace',
            fontSize: 9,
            letterSpacing: '0.08em',
            color: PALETTE.muted,
            opacity: 0.7,
          }}
        >
          Click any field to edit
        </span>
      </div>

      {/* Brief excerpt — italic blockquote, separate from the field rows */}
      {booking.brief_raw_text && (
        <div className="border-b px-4 py-2.5" style={{ borderColor: PALETTE.border }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: PALETTE.muted }}>Brief</div>
          <p className="text-xs leading-relaxed italic" style={{ color: PALETTE.muted }}>
            &ldquo;{booking.brief_raw_text.slice(0, 220)}{booking.brief_raw_text.length > 220 ? '…' : ''}&rdquo;
          </p>
        </div>
      )}

      {/* Primary rows — always visible, the integral operational facts. */}
      {/* Primary rows — Jasper's spec (2026-05-18):
            Title → Dates → Location → Tier → Deliverables → Count →
            Call time → Wrap time → Producer → Producer number.
          Producer email + post/grade/looks/deadline live in the expander. */}
      <div className="px-2 py-1">
        <InlineField
          bookingId={booking.id}
          field="title"
          label="Title"
          value={booking.title}
          placeholder="Job title"
          layout="horizontal"
        />
        <InlineDateRange
          bookingId={booking.id}
          label="Dates"
          shootDates={booking.shoot_dates}
          shootDateNotes={booking.shoot_date_notes}
          layout="horizontal"
        />
        <InlineField
          bookingId={booking.id}
          field="shoot_location"
          label="Location"
          value={booking.shoot_location}
          placeholder="e.g. Sun Studios, Alexandria"
          layout="horizontal"
        />
        <InlineField
          bookingId={booking.id}
          field="tier"
          label="Tier"
          value={booking.tier}
          variant="select"
          options={TIER_OPTIONS}
          layout="horizontal"
        />
        <InlineField
          bookingId={booking.id}
          field="deliverables_type"
          label="Deliverables"
          value={booking.deliverables_type}
          placeholder="e.g. Stills + motion"
          layout="horizontal"
        />
        <InlineField
          bookingId={booking.id}
          field="deliverables_count"
          label="Count"
          value={booking.deliverables_count}
          variant="number"
          placeholder="e.g. 12"
          layout="horizontal"
        />

        {/* Call/Wrap — per-day if schedules exist, else flat call_time/wrap_time */}
        {callTimeSchedules.length > 0 ? (
          <div className="px-2.5 py-1.5 flex items-start gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider flex-none" style={{ color: PALETTE.muted, width: 130 }}>
              Call times
            </span>
            <div className="flex-1 min-w-0 space-y-0.5">
              {callTimeSchedules.map((s) => (
                <div key={s.id} className="text-[12px]" style={{ color: PALETTE.text }}>
                  <span className="font-medium">{formatDate(s.schedule_date)}</span>
                  <span style={{ color: PALETTE.muted }}>
                    {s.call_time && <> · Call {s.call_time.slice(0, 5)}</>}
                    {s.wrap_time && <> · Wrap {s.wrap_time.slice(0, 5)}</>}
                    {s.location && <> · {s.location}</>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <InlineField
              bookingId={booking.id}
              field="call_time"
              label="Call time"
              value={booking.call_time}
              variant="time"
              layout="horizontal"
            />
            <InlineField
              bookingId={booking.id}
              field="wrap_time"
              label="Wrap time"
              value={booking.wrap_time}
              variant="time"
              layout="horizontal"
            />
          </>
        )}

        <InlineField
          bookingId={booking.id}
          field="producer_name"
          label="Producer"
          value={booking.producer_name}
          placeholder="Lead contact"
          layout="horizontal"
        />
        <InlineField
          bookingId={booking.id}
          field="producer_phone"
          label="Producer number"
          value={booking.producer_phone}
          placeholder="04…"
          layout="horizontal"
        />
      </div>

      {/* Expand for the long tail of fields */}
      <div className="border-t" style={{ borderColor: PALETTE.border }}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full px-4 py-2 text-left text-[11px] font-medium"
          style={{ color: PALETTE.muted, background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          {expanded ? '− Hide additional details' : '+ More details (producer email, post, grade, looks, deadline…)'}
        </button>
      </div>

      {expanded && (
        <div className="border-t px-2 py-1" style={{ borderColor: PALETTE.border }}>
          <InlineField
            bookingId={booking.id}
            field="producer_email"
            label="Producer email"
            value={booking.producer_email}
            placeholder="natarsha@..."
            layout="horizontal"
          />
          <InlineField
            bookingId={booking.id}
            field="post_production_ownership"
            label="Post-production"
            value={booking.post_production_ownership}
            variant="select"
            options={POST_PROD_OPTIONS}
            layout="horizontal"
          />
          <InlineField
            bookingId={booking.id}
            field="grade_retouch_scope"
            label="Grade scope"
            value={booking.grade_retouch_scope}
            variant="select"
            options={GRADE_RETOUCH_OPTIONS}
            layout="horizontal"
          />
          <InlineField
            bookingId={booking.id}
            field="looks_per_talent"
            label="Looks per talent"
            value={booking.looks_per_talent}
            placeholder="e.g. 12"
            layout="horizontal"
          />
          <InlineField
            bookingId={booking.id}
            field="confirmation_deadline"
            label="Confirmation due"
            value={booking.confirmation_deadline}
            variant="date"
            layout="horizontal"
          />
        </div>
      )}
    </div>
  );
}
