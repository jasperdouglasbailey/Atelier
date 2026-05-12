/**
 * Public quote viewer — no authentication required.
 * Accessible via the opaque token included in quote emails.
 * Clients see project details, fee schedule, and totals.
 * Internal fields (ASF, margin, state) are NOT shown.
 */
import { notFound } from 'next/navigation';
import { getBookingByQuoteToken } from '@/lib/data/bookings';
import { getLatestQuoteVersionPublic, listFeeLinesPublic } from '@/lib/data/quotes';
import { computeQuoteTotals } from '@/lib/utils/fee-engine';
import { SHOOT_TIER_LABELS } from '@/lib/utils/constants';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { getAgencyConfig } from '@/lib/utils/agency-config';
import type { FeeLine } from '@/lib/types/database';

type Props = { params: Promise<{ token: string }> };

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

export default async function PublicQuotePage({ params }: Props) {
  const { token } = await params;

  const booking = await getBookingByQuoteToken(token);
  if (!booking) notFound();

  // Quote-token expiry (migration 0025). Past expiry, the token is no longer
  // valid — render a friendly expired page rather than the quote, so a
  // forwarded email six months later doesn't leak a stale quote / talent
  // identity / pricing. Owner can regenerate the token + extend the expiry
  // from the booking record if a fresh client view is needed.
  if (booking.quote_token_expires_at) {
    const expiresAt = new Date(booking.quote_token_expires_at);
    // eslint-disable-next-line react-hooks/purity -- server component; Date.now() runs once on the server, not during client re-render
    if (Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
      return <ExpiredQuoteView agencyEmail={getAgencyConfig().email ?? null} />;
    }
  }

  const qv = await getLatestQuoteVersionPublic(booking.id);
  const lines = qv ? await listFeeLinesPublic(qv.id) : [];

  const agency = getAgencyConfig();
  const clientName = booking.client?.company || booking.client?.name || null;
  const today = new Date().toLocaleDateString('en-AU', { dateStyle: 'long' });
  const totals = lines.length > 0 ? computeQuoteTotals(lines) : null;

  // Only show fee lines — hide any line type that's purely internal
  const clientLines = lines.filter(Boolean);

  const tdStyle: React.CSSProperties = {
    padding: '10px 14px',
    borderBottom: '1px solid #ebebeb',
    fontSize: 13,
    color: '#1a1a1a',
    verticalAlign: 'top',
  };
  const thStyle: React.CSSProperties = {
    padding: '8px 14px',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#888',
    borderBottom: '2px solid #d0d0d0',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f5f5f5', minHeight: '100vh', padding: '32px 16px' }}>
      <div style={{ maxWidth: 780, margin: '0 auto', background: '#fff', borderRadius: 10, boxShadow: '0 2px 16px rgba(0,0,0,0.08)', overflow: 'hidden' }}>

        {/* Header band */}
        <div style={{ background: '#1a1a1a', padding: '28px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', color: '#fff' }}>
              {agency.name.toUpperCase()}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 3 }}>
              Photography Production Agency
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 26, fontWeight: 200, letterSpacing: '-0.02em', color: '#fff' }}>QUOTE</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
              {qv ? `Version ${qv.version}` : 'Draft'} &middot; {today}
            </div>
          </div>
        </div>

        <div style={{ padding: '32px 40px' }}>
          {/* Parties */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32, paddingBottom: 28, borderBottom: '1px solid #ebebeb' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#aaa', marginBottom: 8 }}>
                Prepared For
              </div>
              {clientName && (
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a' }}>{clientName}</div>
              )}
              {booking.brand?.name && (
                <div style={{ fontSize: 13, color: '#555', marginTop: 3 }}>Brand: {booking.brand.name}</div>
              )}
              {booking.client?.name && booking.client.company && (
                <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>Attn: {booking.client.name}</div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#aaa', marginBottom: 8 }}>
                Reference
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{booking.booking_ref}</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Valid: {agency.quoteValidityDays} days from issue</div>
            </div>
          </div>

          {/* Project */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#aaa', marginBottom: 10 }}>
              Project
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#1a1a1a', marginBottom: 12 }}>{booking.title}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 32px' }}>
              <Row label="Shoot Type" value={SHOOT_TIER_LABELS[booking.tier]} />
              {booking.shoot_location && <Row label="Location" value={booking.shoot_location} />}
              {(booking.shoot_dates || booking.shoot_date_notes) && (
                <Row label="Dates" value={formatShootDates(booking.shoot_dates) ?? booking.shoot_date_notes ?? ''} />
              )}
              {(booking.call_time || booking.wrap_time) && (
                <Row label="Call / Wrap" value={`${booking.call_time ?? '—'} → ${booking.wrap_time ?? '—'}`} />
              )}
              {booking.deliverables_type && <Row label="Deliverables" value={booking.deliverables_type} />}
              {booking.deliverables_count && (
                <Row label="Deliverable Count" value={String(booking.deliverables_count)} />
              )}
            </div>
          </div>

          {/* Fee schedule */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#aaa', marginBottom: 12 }}>
              Fee Schedule (AUD, inc. GST)
            </div>
            {clientLines.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: '#aaa', fontSize: 13 }}>
                Fee schedule to follow.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: '55%' }}>Description</th>
                    <th style={{ ...thStyle, textAlign: 'right', width: '10%' }}>Qty</th>
                    <th style={{ ...thStyle, textAlign: 'right', width: '15%' }}>Rate</th>
                    <th style={{ ...thStyle, textAlign: 'right', width: '20%' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {clientLines.map((line: FeeLine) => (
                    <tr key={line.id}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 500 }}>{line.description}</div>
                        {line.is_super_bearing && (
                          <div style={{ fontSize: 11, color: '#aaa', marginTop: 1 }}>
                            Incl. superannuation ({Math.round((line.super_rate_charged ?? 0.15) * 100)}%)
                          </div>
                        )}
                        {line.is_gst_exempt && (
                          <div style={{ fontSize: 11, color: '#aaa', marginTop: 1 }}>GST exempt</div>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#666' }}>{line.quantity}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#666' }}>{formatCurrency(line.unit_price)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(line.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Totals */}
            {totals && (
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ width: 260 }}>
                  <TotalRow label="Subtotal" value={formatCurrency(totals.subtotal)} />
                  <TotalRow label="GST (10%)" value={formatCurrency(totals.totalGst)} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', borderTop: '2px solid #1a1a1a', marginTop: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>TOTAL (AUD)</span>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{formatCurrency(totals.grandTotal)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quote notes */}
          {qv?.notes && (
            <div style={{ marginBottom: 24, padding: '14px 18px', background: '#f8f8f8', borderRadius: 6, fontSize: 13, color: '#444' }}>
              <div style={{ fontWeight: 600, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Notes</div>
              <p style={{ margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{qv.notes}</p>
            </div>
          )}

          {/* Confirm CTA */}
          <div style={{ background: '#f0f7f0', border: '1px solid #c8e6c8', borderRadius: 8, padding: '20px 24px', marginBottom: 28 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 }}>
              Ready to go ahead?
            </div>
            <div style={{ fontSize: 13, color: '#555', lineHeight: 1.6 }}>
              Reply to the quote email to confirm — we will hold the dates and send paperwork once we hear from you.
              {agency.email && (
                <> Or email us at <a href={`mailto:${agency.email}`} style={{ color: '#1a6a1a', fontWeight: 500 }}>{agency.email}</a>.</>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{ borderTop: '1px solid #ebebeb', paddingTop: 20, fontSize: 11, color: '#aaa', lineHeight: 1.7 }}>
            <p style={{ margin: '0 0 4px' }}>
              This quote is valid for {agency.quoteValidityDays} days from issue. All amounts are in Australian Dollars (AUD) and inclusive of GST where applicable.
            </p>
            <p style={{ margin: '0 0 4px' }}>
              Quote is subject to talent and crew availability. Cancellation terms apply once a booking is confirmed.
              {agency.name} acts as agent on behalf of represented talent.
            </p>
            <p style={{ margin: 0 }}>
              <a href="/privacy" target="_blank" rel="noreferrer" style={{ color: '#888' }}>
                Privacy policy
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <span style={{ fontSize: 11, color: '#aaa', fontWeight: 500 }}>{label}: </span>
      <span style={{ fontSize: 13, color: '#1a1a1a' }}>{value}</span>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
      <span style={{ color: '#666' }}>{label}</span>
      <span style={{ color: '#1a1a1a' }}>{value}</span>
    </div>
  );
}

/**
 * Rendered when the quote token has passed its expiry date. Plain prose,
 * no quote details — the link is gone, asking the agency for a fresh one
 * is the only path forward.
 */
function ExpiredQuoteView({ agencyEmail }: { agencyEmail: string | null }) {
  return (
    <div style={{ background: '#faf9f7', minHeight: '100vh', padding: '60px 24px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', background: '#ffffff', border: '1px solid #ebebeb', borderRadius: 8, padding: 40 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>
          This quote link has expired
        </h1>
        <p style={{ fontSize: 14, color: '#525252', marginTop: 16, lineHeight: 1.55 }}>
          For your protection, public quote links expire after a set period.
          The pricing and details on this quote may have changed since it was
          first sent.
        </p>
        <p style={{ fontSize: 14, color: '#525252', marginTop: 12, lineHeight: 1.55 }}>
          {agencyEmail
            ? <>Please contact <a href={`mailto:${agencyEmail}`} style={{ color: '#6c8aff' }}>{agencyEmail}</a> to receive an updated quote.</>
            : <>Please contact Saunders &amp; Co to receive an updated quote.</>}
        </p>
      </div>
    </div>
  );
}
