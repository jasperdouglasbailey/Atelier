import { notFound } from 'next/navigation';
import { getBooking } from '@/lib/data/bookings';
import { getActiveQuoteVersion, listFeeLinesForActiveQuote } from '@/lib/data/quotes';
import { computeQuoteTotals } from '@/lib/utils/fee-engine';
import { SHOOT_TIER_LABELS } from '@/lib/utils/constants';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { humanise } from '@/lib/utils/humanise';
import { getAgencyConfig } from '@/lib/utils/agency-config';
import type { FeeLine } from '@/lib/types/database';
import PrintActions from './PrintActions';

type FeeGroup = { label: string; subtotal: number; asf: number; lines: FeeLine[] };

function groupFeeLines(feeLines: FeeLine[]): FeeGroup[] {
  const ARTIST_TYPES = new Set(['artist_fee', 'usage_licence', 'file_management', 'post_production', 'artist_overtime', 'artist_travel']);
  const CREW_TYPES = new Set(['crew_labour', 'crew_overtime']);
  const EXPENSE_TYPES = new Set(['expense', 'crew_travel']);

  const artists = feeLines.filter((l) => ARTIST_TYPES.has(l.line_type));
  const crew = feeLines.filter((l) => CREW_TYPES.has(l.line_type));
  const expenses = feeLines.filter((l) => EXPENSE_TYPES.has(l.line_type));

  const groups: FeeGroup[] = [];
  if (artists.length > 0) groups.push({ label: 'Photography & Artist Fees', subtotal: artists.reduce((s, l) => s + l.subtotal, 0), asf: artists.reduce((s, l) => s + (l.asf_amount ?? 0), 0), lines: artists });
  if (crew.length > 0) groups.push({ label: 'Crew & Labour', subtotal: crew.reduce((s, l) => s + l.subtotal, 0), asf: crew.reduce((s, l) => s + (l.asf_amount ?? 0), 0), lines: crew });
  if (expenses.length > 0) groups.push({ label: 'Production Expenses', subtotal: expenses.reduce((s, l) => s + l.subtotal, 0), asf: expenses.reduce((s, l) => s + (l.asf_amount ?? 0), 0), lines: expenses });
  return groups;
}

type Props = { params: Promise<{ id: string }> };

/** Parse Postgres daterange and return a human-readable span. */
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

export default async function QuotePrintPage({ params }: Props) {
  const { id } = await params;

  const [booking, quoteVersion, feeLines] = await Promise.all([
    getBooking(id),
    getActiveQuoteVersion(id),
    listFeeLinesForActiveQuote(id),
  ]);

  if (!booking) notFound();

  const agency = getAgencyConfig();
  const clientName = booking.client?.company || booking.client?.name || null;

  // "Issued" date = when the quote was actually sent to the client, not
  // when this print template happens to be rendered. A reissue six months
  // later should still show the original issue date, not today's.
  const issuedSource = quoteVersion?.sent_at ?? quoteVersion?.created_at ?? new Date().toISOString();
  const issuedDate = new Date(issuedSource);
  const today = issuedDate.toLocaleDateString('en-AU', { dateStyle: 'long' });

  // eslint-disable-next-line react-hooks/purity -- server component
  const offerExpires = new Date(issuedDate.getTime() + agency.quoteValidityDays * 86400_000);

  const totals = feeLines.length > 0 ? computeQuoteTotals(feeLines) : null;
  const groups = groupFeeLines(feeLines);

  const tdStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderBottom: '1px solid #e8e8e8',
    fontSize: 13,
    color: '#1a1a1a',
  };
  const thStyle: React.CSSProperties = {
    padding: '8px 12px',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#666',
    borderBottom: '2px solid #1a1a1a',
  };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 48px' }}>
      {/* Print / action bar */}
      <PrintActions />

      {/* Agency header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: '#1a1a1a' }}>
            {agency.name.toUpperCase()}
          </div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
            Photography Production Agency · {agency.address ?? 'Sydney, NSW'}
          </div>
          {agency.abn && (
            <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>ABN: {agency.abn}</div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 300, letterSpacing: '-0.02em', color: '#1a1a1a' }}>
            QUOTE
          </div>
          <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
            {quoteVersion ? `Version ${quoteVersion.version}` : 'Draft'}
          </div>
        </div>
      </div>

      {/* Meta row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginBottom: 36, paddingBottom: 32, borderBottom: '1px solid #e8e8e8' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999', marginBottom: 8 }}>
            Prepared For
          </div>
          {clientName && (
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a' }}>{clientName}</div>
          )}
          {booking.brand?.name && (
            <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>Brand: {booking.brand.name}</div>
          )}
          {booking.client?.name && booking.client.company && (
            <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{booking.client.name}</div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999', marginBottom: 8 }}>
            Reference
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{booking.booking_ref}</div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Date: {today}</div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>Valid: {agency.quoteValidityDays} days from issue</div>
          {booking.po_number && (
            <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>PO: {booking.po_number}</div>
          )}
          {booking.job_number && (
            <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>Job: {booking.job_number}</div>
          )}
        </div>
      </div>

      {/* Project details */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999', marginBottom: 12 }}>
          Project
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', marginBottom: 8 }}>{booking.title}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 32px' }}>
          <Row label="Shoot Type" value={SHOOT_TIER_LABELS[booking.tier]} />
          {booking.shoot_location && <Row label="Location" value={booking.shoot_location} />}
          {(booking.shoot_dates || booking.shoot_date_notes) && (
            <Row label="Shoot Dates" value={formatShootDates(booking.shoot_dates) ?? booking.shoot_date_notes ?? ''} />
          )}
          {(booking.call_time || booking.wrap_time) && (
            <Row label="Call / Wrap" value={`${booking.call_time ?? '—'} → ${booking.wrap_time ?? '—'}`} />
          )}
          {booking.deliverables_type && <Row label="Deliverables" value={booking.deliverables_type} />}
          {booking.deliverables_count && <Row label="Deliverable Count" value={String(booking.deliverables_count)} />}
          {booking.post_production_ownership && <Row label="Post-Production" value={humanise(booking.post_production_ownership)} />}
          {booking.selects_cadence && <Row label="Selects Due" value={booking.selects_cadence} />}
        </div>
      </div>

      {/* Fee schedule */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999', marginBottom: 12 }}>
          Fee Schedule
        </div>

        {feeLines.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: '#999', fontSize: 13 }}>
            No fee lines have been added to this quote yet.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: '45%' }}>Description</th>
                <th style={{ ...thStyle, textAlign: 'right', width: '10%' }}>Qty</th>
                <th style={{ ...thStyle, textAlign: 'right', width: '15%' }}>Unit</th>
                <th style={{ ...thStyle, textAlign: 'right', width: '15%' }}>Subtotal</th>
                <th style={{ ...thStyle, textAlign: 'right', width: '15%' }}>ASF</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <>
                  <tr key={`grp-${group.label}`}>
                    <td colSpan={5} style={{
                      padding: '10px 12px 4px',
                      fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.06em', color: '#333',
                      background: '#f8f8f8',
                    }}>
                      {group.label}
                    </td>
                  </tr>
                  {group.lines.map((line: FeeLine) => (
                    <tr key={line.id}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 500 }}>{line.description}</div>
                        {line.is_gst_exempt && (
                          <div style={{ fontSize: 11, color: '#999', marginTop: 1 }}>GST Exempt</div>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{line.quantity}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(line.unit_price)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(line.subtotal)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#666' }}>
                        {line.asf_amount > 0 ? formatCurrency(line.asf_amount) : '—'}
                      </td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        )}

        {/* Totals */}
        {totals && (
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: 280 }}>
              <TotalRow label="Subtotal" value={formatCurrency(totals.subtotal)} />
              {totals.totalAsf > 0 && (
                <TotalRow label="Agency Service Fee (15%)" value={formatCurrency(totals.totalAsf)} />
              )}
              <TotalRow label="GST (10%)" value={formatCurrency(totals.totalGst)} />
              {totals.totalSuper > 0 && (
                <TotalRow label="Crew Fringes" value={formatCurrency(totals.totalSuper)} />
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', borderTop: '2px solid #1a1a1a', marginTop: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>TOTAL DUE (AUD)</span>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{formatCurrency(totals.grandTotal)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quote notes */}
      {quoteVersion?.notes && (
        <div style={{ marginBottom: 24, padding: '14px 18px', background: '#f8f8f8', borderRadius: 6, fontSize: 13, color: '#444' }}>
          <div style={{ fontWeight: 600, fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Notes</div>
          <p style={{ margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{quoteVersion.notes}</p>
        </div>
      )}

      {/* Footer terms */}
      <div style={{ borderTop: '1px solid #e8e8e8', paddingTop: 20, fontSize: 11, color: '#999', lineHeight: 1.7 }}>
        <p style={{ margin: '0 0 4px' }}>
          This estimate is valid for {agency.quoteValidityDays} days from the date of issue
          {' '}(until {offerExpires.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}).
          {' '}All amounts are in Australian Dollars (AUD) and are inclusive of GST where applicable.
        </p>
        <p style={{ margin: 0 }}>
          Quote is subject to talent and crew availability confirmation. Cancellation terms apply once a booking is confirmed.
          {agency.name} acts as agent on behalf of represented talent.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <span style={{ fontSize: 11, color: '#999', fontWeight: 500 }}>{label}: </span>
      <span style={{ fontSize: 13, color: '#1a1a1a' }}>{value}</span>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
      <span style={{ color: '#555' }}>{label}</span>
      <span style={{ color: '#1a1a1a' }}>{value}</span>
    </div>
  );
}
