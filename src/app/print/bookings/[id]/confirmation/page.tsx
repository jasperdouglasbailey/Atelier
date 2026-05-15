/**
 * Booking Confirmation print template.
 * Owner/partner only — not token-gated like the quote viewer.
 * Summarises confirmed booking details: client, talent team, dates,
 * usage licences, fee totals.
 */
import { notFound } from 'next/navigation';
import { getBooking } from '@/lib/data/bookings';
import { getActiveQuoteVersion, listFeeLinesForActiveQuote, listBookingTalent } from '@/lib/data/quotes';
import { listUsageLicences } from '@/lib/data/usage-licences';
import { computeQuoteTotals } from '@/lib/utils/fee-engine';
import { SHOOT_TIER_LABELS } from '@/lib/utils/constants';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { getAgencyConfig } from '@/lib/utils/agency-config';
import type { FeeLine } from '@/lib/types/database';
import PrintActions from '../quote/PrintActions';

type FeeGroup = { label: string; subtotal: number; lines: FeeLine[] };

function groupFeeLines(feeLines: FeeLine[]): FeeGroup[] {
  const ARTIST_TYPES = new Set(['artist_fee', 'usage_licence', 'file_management', 'retouching', 'post_production', 'artist_overtime', 'artist_travel']);
  const CREW_TYPES = new Set(['crew_labour', 'crew_equipment', 'overtime']);
  const EXPENSE_TYPES = new Set(['equipment_rental', 'studio_hire', 'travel', 'catering', 'wardrobe', 'props', 'casting', 'location_fee', 'permits', 'insurance', 'other_expense']);
  const artists = feeLines.filter((l) => ARTIST_TYPES.has(l.line_type));
  const crew = feeLines.filter((l) => CREW_TYPES.has(l.line_type));
  const expenses = feeLines.filter((l) => EXPENSE_TYPES.has(l.line_type));
  const groups: FeeGroup[] = [];
  if (artists.length > 0) groups.push({ label: 'Photography & Artist Fees', subtotal: artists.reduce((s, l) => s + l.subtotal, 0), lines: artists });
  if (crew.length > 0) groups.push({ label: 'Crew & Labour', subtotal: crew.reduce((s, l) => s + l.subtotal, 0), lines: crew });
  if (expenses.length > 0) groups.push({ label: 'Production Expenses', subtotal: expenses.reduce((s, l) => s + l.subtotal, 0), lines: expenses });
  return groups;
}

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
    getActiveQuoteVersion(id),
    listFeeLinesForActiveQuote(id),
    listBookingTalent(id),
    listUsageLicences(id),
  ]);

  if (!booking) notFound();

  const agency = getAgencyConfig();
  const clientName = booking.client?.company || booking.client?.name || null;
  const today = new Date().toLocaleDateString('en-AU', { dateStyle: 'long' });
  const totals = feeLines.length > 0 ? computeQuoteTotals(feeLines as FeeLine[]) : null;
  const groups = groupFeeLines(feeLines as FeeLine[]);
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

  const CONFIRMED_STATES = new Set(['quote_confirmed', 'pre_production', 'shoot_live', 'morning_after_check', 'final_delivery', 'invoice_issued', 'paid']);
  const isDraft = !CONFIRMED_STATES.has(booking.state);

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', background: '#fff', padding: '40px', maxWidth: 780, margin: '0 auto' }}>

      <PrintActions />

      {/* DRAFT watermark — shown for any state before quote_confirmed */}
      {isDraft && (
        <div style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%) rotate(-45deg)',
          fontSize: 120, fontWeight: 900, color: '#0000000a',
          pointerEvents: 'none', zIndex: 0, userSelect: 'none', whiteSpace: 'nowrap',
        }}>
          DRAFT
        </div>
      )}

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
          <div style={{ fontSize: 28, fontWeight: 200, letterSpacing: '-0.02em', color: '#1a1a1a' }}>
            {isDraft ? 'DRAFT CONFIRMATION' : 'BOOKING CONFIRMATION'}
          </div>
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

      {/* Talent team — Name + Role only (no individual rates on client-facing document) */}
      {bookingTalent.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#aaa', marginBottom: 10 }}>Creative Team</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Role</th>
              </tr>
            </thead>
            <tbody>
              {bookingTalent.map((bt) => {
                const t = bt.talent as { working_name?: string } | null;
                return (
                  <tr key={bt.id}>
                    <td style={tdStyle}>{t?.working_name ?? '—'}</td>
                    <td style={tdStyle}>{bt.role_on_booking ?? '—'}</td>
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
                  <td style={tdStyle}>{lic.media.length > 0 ? lic.media.join(', ') : '—'}</td>
                  <td style={tdStyle}>{lic.territory.length > 0 ? lic.territory.join(', ') : '—'}</td>
                  <td style={tdStyle}>{lic.duration_months ? `${lic.duration_months} months` : '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{lic.fee ? formatCurrency(lic.fee) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Fee schedule */}
      {feeLines.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#aaa', marginBottom: 10 }}>Fee Schedule</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: '55%' }}>Description</th>
                <th style={{ ...thStyle, textAlign: 'right', width: '12%' }}>Qty</th>
                <th style={{ ...thStyle, textAlign: 'right', width: '15%' }}>Unit Rate</th>
                <th style={{ ...thStyle, textAlign: 'right', width: '18%' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <>
                  <tr key={`grp-${group.label}`}>
                    <td colSpan={4} style={{
                      padding: '10px 12px 4px',
                      fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.05em', color: '#333', background: '#f8f8f8',
                    }}>
                      {group.label}
                    </td>
                  </tr>
                  {group.lines.map((line: FeeLine) => (
                    <tr key={line.id}>
                      <td style={tdStyle}>{line.description}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{line.quantity}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(line.unit_price)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500 }}>{formatCurrency(line.subtotal)}</td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Totals */}
      {totals && (
        <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: 280 }}>
            <ConfTotalRow label="Subtotal" value={formatCurrency(totals.subtotal)} />
            {totals.totalAsf > 0 && (
              <ConfTotalRow label="Agency Service Fee (15%)" value={formatCurrency(totals.totalAsf)} />
            )}
            <ConfTotalRow label="GST (10%)" value={formatCurrency(totals.totalGst)} />
            {totals.totalSuper > 0 && (
              <ConfTotalRow label="Crew Fringes" value={formatCurrency(totals.totalSuper)} />
            )}
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

function ConfTotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f0f0f0', fontSize: 12 }}>
      <span style={{ color: '#555' }}>{label}</span>
      <span>{value}</span>
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
