/**
 * Crew Bill / Recipient-Created Tax Invoice (RCTI).
 *
 * Australian doctrine — what the crew member is paid:
 *   - Labour subtotal (crew_labour + overtime + travel)
 *   - + Super 12% paid to fund (NEVER on equipment, NEVER on expenses)
 *   - + 10% GST on labour + expenses (only if GST registered, NOT on super)
 *   - Equipment / expenses billed at cost (no commission, no super)
 *
 * The 3% super-margin (15% charged client minus 12% paid to fund) is NOT
 * shown here — that's agency revenue, transparent on the financials view
 * but not on the crew-facing document.
 */

import { notFound } from 'next/navigation';
import { getBooking } from '@/lib/data/bookings';
import { listFeeLinesForActiveQuote, listBookingCrew } from '@/lib/data/quotes';
import { getCrewMember } from '@/lib/data/entities';
import { computeCrewPayment, effectiveCost } from '@/lib/utils/fee-engine';
import { buildCrewBillBreakdown } from '@/lib/utils/person-billing';
import { FEE_LINE_TYPE_LABELS } from '@/lib/utils/constants';
import { formatCurrency } from '@/lib/utils/format';
import { humanise } from '@/lib/utils/humanise';
import { getAgencyConfig } from '@/lib/utils/agency-config';
import type { BookingCrew } from '@/lib/types/database';
import PrintActions from '../../quote/PrintActions';

type Props = { params: Promise<{ id: string; crewId: string }> };

export default async function CrewBillPage({ params }: Props) {
  const { id, crewId } = await params;

  const [booking, crew, allFeeLines, bookingCrewList] = await Promise.all([
    getBooking(id),
    getCrewMember(crewId),
    listFeeLinesForActiveQuote(id),
    listBookingCrew(id),
  ]);

  if (!booking || !crew) notFound();

  // Roster row — the day_rate + assigned_dates source. Null if the crew
  // member isn't actually attached to this booking (the bill still
  // renders, but with no synthesised labour rows).
  const bookingCrew = (bookingCrewList as Array<BookingCrew & { crew?: unknown }>)
    .find((bc) => bc.crew_id === crewId) ?? null;

  // Unified breakdown: synthesised day-rate rows from the roster + any
  // fee_lines tagged with this crew_id (OT, equipment, custom expenses).
  // See src/lib/utils/person-billing.ts for the why.
  const breakdown = buildCrewBillBreakdown({
    bookingCrew,
    shootDates: booking.shoot_dates,
    feeLines: allFeeLines,
  });

  const payment = computeCrewPayment(
    breakdown.labourSubtotal,
    breakdown.expensesSubtotal,
    crew.gst_registered,
    breakdown.overtimeSubtotal,
  );

  const agency = getAgencyConfig();
  const today = new Date();
  const todayStr = today.toLocaleDateString('en-AU', { dateStyle: 'long' });
  const billNumber = booking.booking_ref
    ? `BILL-${booking.booking_ref}-${crew.name.replace(/\s+/g, '').slice(0, 6).toUpperCase()}`
    : `BILL-${id.slice(0, 8).toUpperCase()}`;
  const isDraft = booking.state !== 'paid';

  const tdStyle: React.CSSProperties = {
    padding: '10px 12px', borderBottom: '1px solid #f0f0f0',
    fontSize: 13, color: '#1a1a1a', verticalAlign: 'top',
  };
  const thStyle: React.CSSProperties = {
    padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.05em', color: '#666',
    borderBottom: '2px solid #1a1a1a',
  };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 48px' }}>
      <PrintActions />

      {isDraft && (
        <div style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%) rotate(-45deg)',
          fontSize: 120, fontWeight: 900, color: '#0000000a',
          pointerEvents: 'none', zIndex: 0, userSelect: 'none', whiteSpace: 'nowrap',
        }}>DRAFT</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 40 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999' }}>
            {agency.name}
          </div>
          {agency.abn && <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>ABN {agency.abn}</div>}
          {agency.address && <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{agency.address}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1a1a1a' }}>
            {crew.gst_registered ? 'Recipient Created Tax Invoice' : 'Crew Bill'}
          </div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{billNumber}</div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{todayStr}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginBottom: 32 }}>
        <div>
          <div style={thStyle}>Pay To</div>
          <div style={{ ...tdStyle, borderBottom: 'none', paddingTop: 12 }}>
            <div style={{ fontWeight: 600 }}>{crew.name}</div>
            {crew.primary_role && (
              <div style={{ fontSize: 12, color: '#666', textTransform: 'capitalize' }}>
                {humanise(crew.primary_role)}
              </div>
            )}
            {crew.abn && <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>ABN {crew.abn}</div>}
            <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
              {crew.gst_registered ? 'GST registered' : 'Not GST registered'}
            </div>
          </div>
        </div>
        <div>
          <div style={thStyle}>For Booking</div>
          <div style={{ ...tdStyle, borderBottom: 'none', paddingTop: 12 }}>
            <div style={{ fontWeight: 600 }}>{booking.booking_ref ?? booking.title}</div>
            {booking.client?.name && <div style={{ fontSize: 12, color: '#666' }}>{booking.client.name}</div>}
            {booking.shoot_date_notes && <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{booking.shoot_date_notes}</div>}
          </div>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
        <thead>
          <tr>
            <th style={thStyle}>Description</th>
            <th style={{ ...thStyle, textAlign: 'right', width: 80 }}>Qty</th>
            <th style={{ ...thStyle, textAlign: 'right', width: 120 }}>Unit Price</th>
            <th style={{ ...thStyle, textAlign: 'right', width: 120 }}>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {breakdown.totalRowCount === 0 ? (
            <tr>
              <td colSpan={4} style={{ ...tdStyle, color: '#999', textAlign: 'center', fontStyle: 'italic' }}>
                No labour, overtime, or expenses recorded for this crew member yet.
              </td>
            </tr>
          ) : (
            <>
              {/* Synthesised day-rate rows from the booking_crew roster.
                  These are virtual — not persisted as fee_lines. */}
              {breakdown.labourRows.map((row) => (
                <tr key={row.key}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500 }}>{row.description}</div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{row.category}</div>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{row.quantity}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(row.unitPrice)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(row.subtotal)}</td>
                </tr>
              ))}
              {/* Persisted fee_lines tagged with this crew_id — custom
                  labour, overtime, expenses. */}
              {[...breakdown.customLabourLines, ...breakdown.overtimeLines, ...breakdown.expensesLines].map((line) => (
                <tr key={line.id}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500 }}>{line.description}</div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                      {FEE_LINE_TYPE_LABELS[line.line_type]}
                    </div>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{line.quantity}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(line.unit_price)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(effectiveCost(line))}</td>
                </tr>
              ))}
            </>
          )}
        </tbody>
      </table>

      <div style={{ marginLeft: 'auto', maxWidth: 380, marginBottom: 40 }}>
        {payment.labourSubtotal > 0 && (
          <Row label="Labour subtotal" value={formatCurrency(payment.labourSubtotal)} />
        )}
        {payment.expensesSubtotal > 0 && (
          <Row label="Equipment / expenses" value={formatCurrency(payment.expensesSubtotal)} />
        )}
        <Row label="Superannuation (12%, paid to fund)" value={`+ ${formatCurrency(payment.superPaid)}`} muted />
        {payment.gst > 0 && (
          <Row label="GST (10%, on labour + expenses)" value={`+ ${formatCurrency(payment.gst)}`} muted />
        )}
        <Row label="Total payable" value={formatCurrency(payment.netPayment)} bold />
      </div>

      {/* Banking note + super destination */}
      <div style={{
        background: '#f8f8f8', border: '1px solid #e8e8e8', borderRadius: 6,
        padding: '12px 16px', fontSize: 12, color: '#666',
      }}>
        <div style={{ fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>Payment</div>
        Payment processed via Xero per the bank details on file.
        {crew.super_fund_name && (
          <div style={{ marginTop: 4 }}>
            Super contribution remitted to <b>{crew.super_fund_name}</b>
            {crew.super_member_number ? ` (member ${crew.super_member_number})` : ''}.
          </div>
        )}
        <div style={{ marginTop: 4 }}>
          Remitted on a pay-on-paid basis once the client invoice clears.
        </div>
      </div>

      <div style={{ marginTop: 40, paddingTop: 16, borderTop: '1px solid #e8e8e8', fontSize: 11, color: '#999', textAlign: 'center' }}>
        {agency.name} {agency.abn ? `· ABN ${agency.abn}` : ''}
        {agency.email ? ` · ${agency.email}` : ''}
      </div>
    </div>
  );
}

function Row({ label, value, muted = false, bold = false }: {
  label: string; value: string; muted?: boolean; bold?: boolean;
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      padding: '8px 0',
      borderTop: bold ? '2px solid #1a1a1a' : 'none',
      borderBottom: bold ? 'none' : '1px solid #f0f0f0',
      fontSize: bold ? 14 : 13,
      fontWeight: bold ? 700 : 400,
      color: muted ? '#666' : '#1a1a1a',
      marginTop: bold ? 8 : 0,
    }}>
      <span>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}
