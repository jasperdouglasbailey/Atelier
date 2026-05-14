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

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t px-4 py-3" style={{ borderColor: PALETTE.border }}>
      {children}
    </div>
  );
}

export default function BookingJobFacts({ booking, schedules }: Props) {
  const [expanded, setExpanded] = useState(false);

  const callTimeSchedules = schedules.filter((s) => s.call_time || s.wrap_time);

  return (
    <div
      className="rounded-lg border"
      style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: PALETTE.border }}>
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

      {/* Brief excerpt — read-only display of source brief */}
      {booking.brief_raw_text && (
        <Row>
          <div className="micro-label mb-1.5">Brief</div>
          <p className="text-sm leading-relaxed italic" style={{ color: PALETTE.muted }}>
            &ldquo;{booking.brief_raw_text.slice(0, 280)}{booking.brief_raw_text.length > 280 ? '…' : ''}&rdquo;
          </p>
        </Row>
      )}

      {/* Dates */}
      <Row>
        <InlineDateRange
          bookingId={booking.id}
          label="Dates"
          shootDates={booking.shoot_dates}
          shootDateNotes={booking.shoot_date_notes}
        />
      </Row>

      {/* Location */}
      <Row>
        <InlineField
          bookingId={booking.id}
          field="shoot_location"
          label="Location"
          value={booking.shoot_location}
          placeholder="e.g. Sun Studios, Alexandria"
        />
      </Row>

      {/* Call times — show per-day schedules if present, else flat call_time */}
      {callTimeSchedules.length > 0 ? (
        <Row>
          <div className="micro-label mb-1.5">Call times</div>
          <div className="space-y-1">
            {callTimeSchedules.map((s) => (
              <div key={s.id} className="text-[11px]" style={{ color: PALETTE.muted }}>
                <span className="font-medium" style={{ color: PALETTE.text }}>
                  {formatDate(s.schedule_date)}
                </span>
                {s.call_time && <> · Call {s.call_time}</>}
                {s.wrap_time && <> · Wrap {s.wrap_time}</>}
                {s.location && <> · {s.location}</>}
              </div>
            ))}
          </div>
        </Row>
      ) : (
        <Row>
          <div className="grid gap-3 sm:grid-cols-2">
            <InlineField
              bookingId={booking.id}
              field="call_time"
              label="Call time"
              value={booking.call_time}
              variant="time"
            />
            <InlineField
              bookingId={booking.id}
              field="wrap_time"
              label="Wrap time"
              value={booking.wrap_time}
              variant="time"
            />
          </div>
        </Row>
      )}

      {/* Deliverables */}
      <Row>
        <div className="grid gap-3 sm:grid-cols-2">
          <InlineField
            bookingId={booking.id}
            field="deliverables_type"
            label="Deliverables"
            value={booking.deliverables_type}
            placeholder="e.g. Stills + motion"
          />
          <InlineField
            bookingId={booking.id}
            field="deliverables_count"
            label="Deliverables count"
            value={booking.deliverables_count}
            variant="number"
            placeholder="e.g. 12"
          />
        </div>
      </Row>

      {/* Expand for the long tail of fields */}
      <div className="border-t" style={{ borderColor: PALETTE.border }}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full px-4 py-2.5 text-left text-[11px] font-medium"
          style={{ color: PALETTE.muted, background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          {expanded ? '− Hide additional details' : '+ More details (post, grade, producer, deadline…)'}
        </button>
      </div>

      {expanded && (
        <>
          <Row>
            <InlineField
              bookingId={booking.id}
              field="title"
              label="Title"
              value={booking.title}
            />
          </Row>

          <Row>
            <InlineField
              bookingId={booking.id}
              field="tier"
              label="Tier"
              value={booking.tier}
              variant="select"
              options={TIER_OPTIONS}
            />
          </Row>

          <Row>
            <div className="grid gap-3 sm:grid-cols-2">
              <InlineField
                bookingId={booking.id}
                field="post_production_ownership"
                label="Post-production"
                value={booking.post_production_ownership}
                variant="select"
                options={POST_PROD_OPTIONS}
              />
              <InlineField
                bookingId={booking.id}
                field="grade_retouch_scope"
                label="Grade scope"
                value={booking.grade_retouch_scope}
                variant="select"
                options={GRADE_RETOUCH_OPTIONS}
              />
            </div>
          </Row>

          <Row>
            <div className="grid gap-3 sm:grid-cols-2">
              <InlineField
                bookingId={booking.id}
                field="looks_per_talent"
                label="Looks per talent"
                value={booking.looks_per_talent}
                placeholder="e.g. 12"
              />
              <InlineField
                bookingId={booking.id}
                field="confirmation_deadline"
                label="Confirmation deadline"
                value={booking.confirmation_deadline}
                variant="date"
              />
            </div>
          </Row>

          <Row>
            <div className="grid gap-3 sm:grid-cols-2">
              <InlineField
                bookingId={booking.id}
                field="producer_name"
                label="Producer"
                value={booking.producer_name}
              />
              <InlineField
                bookingId={booking.id}
                field="producer_email"
                label="Producer email"
                value={booking.producer_email}
              />
            </div>
          </Row>

          <Row>
            <InlineField
              bookingId={booking.id}
              field="producer_phone"
              label="Producer phone"
              value={booking.producer_phone}
            />
          </Row>
        </>
      )}
    </div>
  );
}
