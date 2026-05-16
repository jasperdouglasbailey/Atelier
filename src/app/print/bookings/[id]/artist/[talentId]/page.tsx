/**
 * Artist Remittance Advice — what an artist gets paid for a booking.
 *
 * Australian doctrine:
 *   - 20% commission on artist labour (deducted from gross)
 *   - 10% GST on commission (deducted)
 *   - + 10% artist GST IF artist is GST registered (added back)
 *   - Net = gross − commission − commission GST + artist GST
 *
 * Banking: per CLAUDE.md doctrine, banking lives in Xero ONLY. We surface
 * a "Banking — see Xero" line rather than store/display account details
 * here. When the Xero integration is wired (currently stub), this page
 * can render the Xero contact's bank info.
 */

import { notFound } from 'next/navigation';
import { getBooking } from '@/lib/data/bookings';
import { listFeeLinesForActiveQuote } from '@/lib/data/quotes';
import { getTalent } from '@/lib/data/entities';
import { computeArtistPayment, effectiveCost } from '@/lib/utils/fee-engine';
import { FEE_LINE_TYPE_LABELS } from '@/lib/utils/constants';
import { formatCurrency } from '@/lib/utils/format';
import { getAgencyConfig } from '@/lib/utils/agency-config';
import PrintActions from '../../quote/PrintActions';

type Props = { params: Promise<{ id: string; talentId: string }> };

const ARTIST_LINE_TYPES = new Set([
  'artist_fee', 'usage_licence', 'file_management', 'retouching', 'post_production',
]);

export default async function ArtistRemittancePage({ params }: Props) {
  const { id, talentId } = await params;

  const [booking, talent, allFeeLines] = await Promise.all([
    getBooking(id),
    getTalent(talentId),
    listFeeLinesForActiveQuote(id),
  ]);

  if (!booking || !talent) notFound();

  // Lines for this artist on this booking. Falls back to ALL artist-type
  // lines if none have talent_id set (some quotes pre-date per-line linking).
  const linkedLines = allFeeLines.filter(
    (l) => l.talent_id === talentId && ARTIST_LINE_TYPES.has(l.line_type),
  );
  const allArtistLines = allFeeLines.filter((l) => ARTIST_LINE_TYPES.has(l.line_type));
  const lines = linkedLines.length > 0 ? linkedLines : allArtistLines;

  // Use COST subtotal — what the artist actually invoiced (falls back to
  // billed when cost_subtotal isn't set, preserving legacy behaviour).
  const subtotal = lines.reduce((s, l) => s + effectiveCost(l), 0);
  const payment = computeArtistPayment(subtotal, talent.gst_registered);

  const agency = getAgencyConfig();
  const today = new Date();
  const todayStr = today.toLocaleDateString('en-AU', { dateStyle: 'long' });
  const remittanceNumber = booking.booking_ref
    ? `RA-${booking.booking_ref}-${talent.working_name.replace(/\s+/g, '').slice(0, 6).toUpperCase()}`
    : `RA-${id.slice(0, 8).toUpperCase()}`;
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

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 40 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999' }}>
            {agency.name}
          </div>
          {agency.abn && <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>ABN {agency.abn}</div>}
          {agency.address && <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{agency.address}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1a1a1a' }}>Remittance Advice</div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{remittanceNumber}</div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{todayStr}</div>
        </div>
      </div>

      {/* Recipient */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginBottom: 32 }}>
        <div>
          <div style={thStyle}>Pay To</div>
          <div style={{ ...tdStyle, borderBottom: 'none', paddingTop: 12 }}>
            <div style={{ fontWeight: 600 }}>{talent.legal_name}</div>
            {talent.legal_name !== talent.working_name && (
              <div style={{ fontSize: 12, color: '#666' }}>(working as {talent.working_name})</div>
            )}
            {talent.abn && <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>ABN {talent.abn}</div>}
            <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
              {talent.gst_registered ? 'GST registered' : 'Not GST registered'}
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

      {/* Fee lines */}
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
          {lines.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ ...tdStyle, color: '#999', textAlign: 'center', fontStyle: 'italic' }}>
                No artist fee lines recorded for this booking yet.
              </td>
            </tr>
          ) : (
            lines.map((line) => (
              <tr key={line.id}>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 500 }}>{line.description}</div>
                  <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                    {FEE_LINE_TYPE_LABELS[line.line_type]}
                  </div>
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{line.quantity}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(line.unit_price)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(line.subtotal)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ marginLeft: 'auto', maxWidth: 360, marginBottom: 40 }}>
        <Row label="Gross fees" value={formatCurrency(payment.grossFees)} />
        <Row label="Less: Agency commission (20%)" value={`− ${formatCurrency(payment.commission)}`} muted />
        <Row label="Less: GST on commission" value={`− ${formatCurrency(payment.commissionGst)}`} muted />
        {payment.artistGst > 0 && (
          <Row label="Plus: GST you charge (10%)" value={`+ ${formatCurrency(payment.artistGst)}`} muted />
        )}
        <Row label="Net payable to you" value={formatCurrency(payment.netPayment)} bold />
      </div>

      {/* Banking note */}
      <div style={{
        background: '#f8f8f8', border: '1px solid #e8e8e8', borderRadius: 6,
        padding: '12px 16px', fontSize: 12, color: '#666',
      }}>
        <div style={{ fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>Payment</div>
        Payment processed via Xero per the bank details on file.
        Contact {agency.email} with any questions about this remittance.
        Remitted on a pay-on-paid basis once the client invoice clears.
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
