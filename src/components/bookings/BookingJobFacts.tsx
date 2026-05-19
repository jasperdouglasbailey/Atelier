'use client';

import { useState } from 'react';
import type { BookingDetailRow } from '@/lib/data/bookings';
import type { BookingSchedule } from '@/lib/types/database';
import InlineField from '@/components/bookings/InlineField';
import InlineDateRange from '@/components/bookings/InlineDateRange';
import UsageSummary from '@/components/bookings/UsageSummary';
import { PALETTE, SHOOT_TIERS, SHOOT_TIER_LABELS } from '@/lib/utils/constants';
import { formatDate, formatCurrency } from '@/lib/utils/format';

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
  /**
   * Active clients for the inline Client + Agency pickers. Passed from
   * the booking detail page (server-side fetch). The Agency picker
   * filters down to rows with `is_creative_agency=true`. Includes the
   * booking's existing client (if set + active) so the current
   * selection renders correctly.
   */
  clients: { id: string; name: string; company: string | null; is_creative_agency: boolean }[];
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
export default function BookingJobFacts({ booking, schedules, clients }: Props) {
  const [expanded, setExpanded] = useState(false);

  // Client dropdown options. Sorted alphabetically + a "— Clear —" row
  // at the top so an operator can unset the client on a booking that
  // started attached and shouldn't be (e.g. internal test / portfolio
  // job per Jasper 2026-05-18). Company suffix disambiguates when two
  // clients share a primary name.
  const CLIENT_OPTIONS = [
    { value: '', label: '— No client —' },
    ...clients
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({
        value: c.id,
        label: c.company ? `${c.name} · ${c.company}` : c.name,
      })),
  ];

  // Agency picker — filter the same client roster down to creative /
  // production agency rows. Operator marks a client as "Agency" via the
  // toggle on the client edit form. The label intentionally drops the
  // word "Creative" — production agencies use the same flag.
  const AGENCY_OPTIONS = [
    { value: '', label: '— None —' },
    ...clients
      .filter((c) => c.is_creative_agency)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({
        value: c.id,
        label: c.company ? `${c.name} · ${c.company}` : c.name,
      })),
  ];

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
      {/* Primary rows — Jasper's spec (2026-05-18, revised):
            Title → Dates → Client → Location → Tier → Deliverables →
            Count → Call time → Wrap time → Producer → Producer number.
          Producer email + post/grade/looks/deadline live in the expander.
          Client added 2026-05-18 — operator couldn't find where to set
          the client on an existing booking; it now lives here, inline-
          editable, with "— No client —" available for internal / unpaid
          jobs. */}
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
          field="client_id"
          label="Client"
          // Use the joined client object's display name from the booking
          // row — falls back to the raw id (which is what the picker
          // value sees). Empty string when no client is set.
          value={booking.client_id ?? ''}
          variant="select"
          options={CLIENT_OPTIONS}
          format={(v) => {
            if (!v) return null;
            const c = clients.find((x) => x.id === v);
            return c ? (c.company ? `${c.name} · ${c.company}` : c.name) : 'Unknown client';
          }}
          layout="horizontal"
        />
        {/* Agency — production or creative agency working on the brief.
            Surfaces the previously-buried `creative_agency_id` that you
            could only set on manual create. Empty = direct client (no
            agency in the middle). */}
        <InlineField
          bookingId={booking.id}
          field="creative_agency_id"
          label="Agency"
          value={booking.creative_agency_id ?? ''}
          variant="select"
          options={AGENCY_OPTIONS}
          format={(v) => {
            if (!v) return null;
            const c = clients.find((x) => x.id === v);
            return c ? (c.company ? `${c.name} · ${c.company}` : c.name) : 'Unknown agency';
          }}
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
        {/* PO + Job number — invoice-critical. Surfaced inline so they
            stop being trapped on the /edit form. */}
        <InlineField
          bookingId={booking.id}
          field="po_number"
          label="PO number"
          value={booking.po_number}
          placeholder="Client's PO ref"
          layout="horizontal"
        />
        <InlineField
          bookingId={booking.id}
          field="job_number"
          label="Job number"
          value={booking.job_number}
          placeholder="Client or internal ref"
          layout="horizontal"
        />
        {/* Usage — readable 3-line summary of the structured taxonomy.
            Read-only here; the brief intake LLM writes the underlying
            fields and the operator can edit on the booking detail's
            Usage section. Talent see the same renderer in their portal. */}
        <UsageSummary
          market={booking.usage_market}
          realm={booking.usage_realm}
          mediaCategories={booking.usage_media_categories}
          specificChannels={booking.usage_specific_channels}
          territoryIso={booking.usage_territory_iso}
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
          {expanded ? '− Hide additional details' : '+ More details (producer email, post, grade, budget, notes, deadline…)'}
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
          {/* Grading: directly edits post_production_ownership — that field
              is semantically "who handles the grade-side of post". */}
          <InlineField
            bookingId={booking.id}
            field="post_production_ownership"
            label="Grading"
            value={booking.post_production_ownership}
            variant="select"
            options={POST_PROD_OPTIONS}
            layout="horizontal"
          />
          {/* Retouching: read-only derived display from ownership + scope.
              - scope='grade_only' AND ownership=us_* → "Client" (split case:
                we only grade, client retouches)
              - everything else → same as Grading (both ends together)
              To toggle the split case, edit the "Grade scope" row below. */}
          {(() => {
            const ownership = booking.post_production_ownership;
            const scope = booking.grade_retouch_scope;
            let retouchLabel: string;
            if (!ownership) {
              retouchLabel = '—';
            } else if (scope === 'grade_only' && (ownership === 'us_via_artist' || ownership === 'us_via_post_team')) {
              retouchLabel = 'Client';
            } else {
              const opt = POST_PROD_OPTIONS.find((o) => o.value === ownership);
              retouchLabel = opt?.label ?? ownership;
            }
            return (
              <div className="px-2.5 py-1.5 flex items-start gap-3">
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider flex-none"
                  style={{ color: PALETTE.muted, width: 130 }}
                >
                  Retouching
                </span>
                <span
                  className="flex-1 min-w-0 text-[12px]"
                  style={{ color: retouchLabel === '—' ? PALETTE.muted : PALETTE.text }}
                  title="Derived from Grading + Grade scope. Edit those to change."
                >
                  {retouchLabel}
                </span>
              </div>
            );
          })()}
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
            field="confirmation_deadline"
            label="Confirmation due"
            value={booking.confirmation_deadline}
            variant="date"
            layout="horizontal"
          />
          {/* Budget — populated by the LLM brief parser when the brief
              names a figure. Editable here post-parse. AUD assumed
              (budget_currency stays as the column-level toggle if/when
              non-AUD clients arrive). */}
          <InlineField
            bookingId={booking.id}
            field="budget_indication"
            label="Budget"
            value={booking.budget_indication}
            variant="number"
            placeholder="e.g. 8000"
            format={(v) => {
              const n = typeof v === 'number' ? v : Number(v);
              return Number.isFinite(n) && n > 0 ? formatCurrency(n, booking.budget_currency ?? 'AUD') : null;
            }}
            layout="horizontal"
          />
          {/* Internal notes — Jasper's headspace. Was only on /edit. */}
          <InlineField
            bookingId={booking.id}
            field="agency_notes"
            label="Agency notes"
            value={booking.agency_notes}
            variant="textarea"
            placeholder="Internal notes"
            layout="horizontal"
          />
        </div>
      )}
    </div>
  );
}
