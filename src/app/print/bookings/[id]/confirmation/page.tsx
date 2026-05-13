/**
 * Booking Confirmation print template.
 * Owner/partner only — not token-gated like the quote viewer.
 * Summarises confirmed booking details: client, talent team, dates,
 * usage licences, fee totals.
 */
import { notFound } from 'next/navigation';
import { getBooking } from '@/lib/data/bookings';
import { getLatestQuoteVersion, listFeeLinesForBooking, listBookingTalent } from '@/lib/data/quotes';
import { listUsageLicences } from '@/lib/data/usage-licences';
import { computeQuoteTotals } from '@/lib/utils/fee-engine';
import { SHOOT_TIER_LABELS } from '@/lib/utils/constants';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { getAgencyConfig } from '@/lib/utils/agency-config';
import type { FeeLine } from '@/lib/types/database';

type Props = { params: Promise<{ id: string }> };

function formatShootDates(range: string | null): string | null {
  if (!range) return null;
  const m = range.match(/^[\[(](\d{4}-\d{2}-\d{2})?,(\d{4}-\d{2}-\d{2})?[\])]$/);
  if (!m || !m[1]) return null;
  const start = m[1];
  if (m[2]) {
    const end = new Date(m[2] + 'T00:00:00Z');
    end.setUTCDate(end.getUTCDate() - 1);
    const endStr = end.toISOString().slice(0, 10);
    return endStr === start ? formatDate(start) : `${formatDate(start)} – ${formatDate(endStr)}`;
  }
  return formatDate(start);
}

export default async function BookingConfirmationPage({ params }: Props) {
  const { id } = await params;

  const [booking, quoteVersion, feeLines, bookingTalent, usageLicences] = await Promise.all([
    getBooking(id),
    getLatestQuoteVersion(id),
    listFeeLinesForBooking(id),
    listBookingTalent(id),
    listUsageLicences(id),
  ]);

  if (!booking) notFound();

  const agency = getAgencyConfig();
  const clientName = booking.client?.company || booking.client?.name || null;
  const today = new Date().toLocaleDateString('en-AU', { dateStyle: 'long' });
  const totals = feeLines.length > 0 ? computeQuoteTotals(feeLines as FeeLine[]) : null;
  const shootDateStr = formatShootDates(booking.shoot_dates) ?? booking.shoot_date_notes ?? '—';

  const tdStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderBottom: '1px solid #ebebeb',
    fontSize: 12,
    color: '#1a1a1a',
    verticalAlign: 'top',
  };
  const thStyle: React.CSSProperties = {
    padding: '6px 12px',
    textAlign: 'left',
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#888',
    borderBottom: '2px solid #d0d0d0',
  };

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', background: '#fff', padding: '40px', maxWidth: 780, margin: '0 auto' }}>

      {/* Print actions — hidden in print */}
      <div style={{ marginBottom: 24, display: 'flex', gap: 12 }} className="print:hidden">
        <button
          onClick={() => window.print()}
          style={{ padding: '8px 20px', borderRadius: 6, fontSize: 13, background: '#1a1a1a', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          Print / Save PDF
        </button>
        <button
          onClick={() => window.history.back()}
          style={{ padding: '8px 20px', borderRadius: 6, fontSize: 13, background: '#f0f0f0', color: '#333', border: 'none', cursor: 'pointer' }}
        >
          Back
        </button>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #1a1a1a', paddingBottom: 16, marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', color: '#1a1a1a' }}>
            {agency.name.toUpperCase()}
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
            Photography Production Agency
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 200, letterSpacing: '-0.02em', color: '#1a1a1a' }}>BOOKING CONFIRMATION</div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{today}</div>
        </div>
      </div>

      {/* Parties */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid #ebebeb' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#aaa', marginBottom: 6 }}>Client</div>
          {clientName && <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a' }}>{clientName}</div>}
          {booking.brand?.name && <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>Brand: {booking.brand.name}</div>}
          {booking.client?.name && booking.client.company && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>Attn: {booking.client.name}</div>}
          {booking.client?.email && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{booking.client.email}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#aaa', marginBottom: 6 }}>Reference</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>{booking.booking_ref}</div>
          {quoteVersion && <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>Quote v{quoteVersion.version}</div>}
        </div>
      </div>

      {/* Project details */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#aaa', marginBottom: 10 }}>Project</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', marginBottom: 12 }}>{booking.title}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px', fontSize: 12 }}>
          <Row label="Shoot Type" value={SHOOT_TIER_LABELS[booking.tier]} />
          <Row label="Shoot Dates" value={shootDateStr} />
          {booking.shoot_location && <Row label="Location" value={booking.shoot_location} />}
          {(booking.call_time || booking.wrap_time) && (
            <Row label="Call / Wrap" value={`${booking.call_time ?? '—'} → ${booking.wrap_time ?? '—'}`} />
          )}
          {booking.deliverables_type && <Row label="Deliverables" value={booking.deliverables_type} />}
          {booking.deliverables_count && <Row label="Deliverable Count" value={String(booking.deliverables_count)} />}
          {agency.defaultPaymentTermsDays && (
            <Row label="Payment Terms" value={`${agency.defaultPaymentTermsDays} days from invoice`} />
          )}
        </div>
      </div>

      {/* Talent team */}
      {bookingTalent.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#aaa', marginBottom: 10 }}>Creative Team</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Role</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Day Rate</th>
              </tr>
            </thead>
            <tbody>
              {bookingTalent.map((bt) => {
                const t = bt.talent as { working_name?: string } | null;
                return (
                  <tr key={bt.id}>
                    <td style={tdStyle}>{t?.working_name ?? '—'}</td>
                    <td style={tdStyle}>{bt.role_on_booking ?? '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {bt.day_rate ? formatCurrency(bt.day_rate as number) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Usage licences */}
      {usageLicences.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#aaa', marginBottom: 10 }}>Usage Licences</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Media</th>
                <th style={thStyle}>Territory</th>
                <th style={thStyle}>Duration</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Fee</th>
              </tr>
            </thead>
            <tbody>
              {usageLicences.map((lic) => (
                <tr key={lic.id}>
                  <td style={tdStyle}>{lic.media_type ?? '—'}</td>
                  <td style={tdStyle}>{lic.territory ?? '—'}</td>
                  <td style={tdStyle}>{lic.duration ?? '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{lic.fee ? formatCurrency(lic.fee) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Fee totals */}
      {totals && (
        <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: 260 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f0f0f0', fontSize: 12 }}>
              <span style={{ color: '#666' }}>Subtotal</span>
              <span>{formatCurrency(totals.subtotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f0f0f0', fontSize: 12 }}>
              <span style={{ color: '#666' }}>GST (10%)</span>
              <span>{formatCurrency(totals.totalGst)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', borderTop: '2px solid #1a1a1a', marginTop: 4 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>TOTAL (AUD)</span>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{formatCurrency(totals.grandTotal)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Signatures */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, marginTop: 48, paddingTop: 24, borderTop: '1px solid #ebebeb' }}>
        <SignBlock label={`For ${agency.name}`} />
        <SignBlock label={clientName ? `For ${clientName}` : 'Client'} />
      </div>

      {/* Footer */}
      <div style={{ marginTop: 40, paddingTop: 16, borderTop: '1px solid #ebebeb', fontSize: 10, color: '#aaa', lineHeight: 1.7 }}>
        {agency.abn && <p style={{ margin: '0 0 2px' }}>ABN: {agency.abn}</p>}
        {agency.address && <p style={{ margin: '0 0 2px' }}>{agency.address}</p>}
        {agency.email && <p style={{ margin: '0 0 2px' }}>{agency.email}</p>}
        <p style={{ margin: '0 0 2px' }}>
          This document confirms the above booking. Payment is due within {agency.defaultPaymentTermsDays} days of invoice.
          All talent represents themselves as contractors. {agency.name} acts as agent on behalf of represented talent.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <span style={{ color: '#aaa', fontSize: 10, fontWeight: 500 }}>{label}: </span>
      <span style={{ color: '#1a1a1a' }}>{value}</span>
    </div>
  );
}

function SignBlock({ label }: { label: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#aaa', marginBottom: 32 }}>{label}</div>
      <div style={{ borderBottom: '1px solid #888', marginBottom: 8 }} />
      <div style={{ fontSize: 10, color: '#aaa' }}>Signature</div>
      <div style={{ borderBottom: '1px solid #d0d0d0', marginTop: 24, marginBottom: 8 }} />
      <div style={{ fontSize: 10, color: '#aaa' }}>Name &amp; Date</div>
    </div>
  );
}
