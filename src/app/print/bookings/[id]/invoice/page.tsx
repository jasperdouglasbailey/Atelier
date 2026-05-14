import { notFound } from 'next/navigation';
import { getBooking } from '@/lib/data/bookings';
import { listFeeLinesForBooking } from '@/lib/data/quotes';
import { computeQuoteTotals } from '@/lib/utils/fee-engine';
import { formatCurrency } from '@/lib/utils/format';
import { getAgencyConfig } from '@/lib/utils/agency-config';
import type { FeeLine } from '@/lib/types/database';
import PrintActions from '../quote/PrintActions';

type Props = { params: Promise<{ id: string }> };

/** Group fee lines into logical invoice categories. */
type InvoiceGroup = { label: string; subtotal: number; lines: FeeLine[] };

function groupFeeLines(feeLines: FeeLine[]): InvoiceGroup[] {
  const ARTIST_TYPES = new Set(['artist_fee', 'usage_licence', 'file_management', 'retouching', 'post_production', 'artist_overtime', 'artist_travel']);
  const CREW_TYPES = new Set(['crew_labour', 'crew_equipment', 'overtime']);
  const EXPENSE_TYPES = new Set(['equipment_rental', 'studio_hire', 'travel', 'catering', 'wardrobe', 'props', 'casting', 'location_fee', 'permits', 'insurance', 'other_expense']);

  const artists = feeLines.filter((l) => ARTIST_TYPES.has(l.line_type));
  const crew = feeLines.filter((l) => CREW_TYPES.has(l.line_type));
  const expenses = feeLines.filter((l) => EXPENSE_TYPES.has(l.line_type));

  const groups: InvoiceGroup[] = [];

  if (artists.length > 0) {
    groups.push({
      label: 'Photography & Artist Fees',
      subtotal: artists.reduce((s, l) => s + l.subtotal, 0),
      lines: artists,
    });
  }
  if (crew.length > 0) {
    groups.push({
      label: 'Crew & Labour',
      subtotal: crew.reduce((s, l) => s + l.subtotal, 0),
      lines: crew,
    });
  }
  if (expenses.length > 0) {
    groups.push({
      label: 'Production Expenses',
      subtotal: expenses.reduce((s, l) => s + l.subtotal, 0),
      lines: expenses,
    });
  }

  return groups;
}

export default async function InvoicePrintPage({ params }: Props) {
  const { id } = await params;

  const [booking, feeLines] = await Promise.all([
    getBooking(id),
    listFeeLinesForBooking(id),
  ]);

  if (!booking) notFound();

  const clientName = booking.client?.company || booking.client?.name || null;
  const today = new Date();
  const todayStr = today.toLocaleDateString('en-AU', { dateStyle: 'long' });
  const agency = getAgencyConfig();
  // Prefer client-specific terms over agency default
  const paymentTerms = booking.client?.payment_terms_days ?? agency.defaultPaymentTermsDays;
  const dueDate = new Date(today);
  dueDate.setDate(dueDate.getDate() + paymentTerms);
  const dueDateStr = dueDate.toLocaleDateString('en-AU', { dateStyle: 'long' });
  const invoiceNumber = booking.booking_ref ? `INV-${booking.booking_ref}` : `INV-${id.slice(0, 8).toUpperCase()}`;
  const totals = feeLines.length > 0 ? computeQuoteTotals(feeLines) : null;
  const groups = groupFeeLines(feeLines);

  const tdStyle: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid #f0f0f0', fontSize: 13, color: '#1a1a1a', verticalAlign: 'top' };
  const thStyle: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: '#666', borderBottom: '2px solid #1a1a1a' };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 48px' }}>
      <PrintActions />

      {/* Draft watermark */}
      {booking.state !== 'invoice_issued' && booking.state !== 'paid' && (
        <div style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(-45deg)',
          fontSize: 120, fontWeight: 900, color: '#0000000a', pointerEvents: 'none', zIndex: 0,
          userSelect: 'none', whiteSpace: 'nowrap',
        }}>
          DRAFT
        </div>
      )}

      {/* Agency header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{agency.name.toUpperCase()}</div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>Photography Production Agency · {agency.address ?? 'Sydney, NSW'}</div>
          <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
            ABN: {agency.abn ?? <span style={{ fontStyle: 'italic' }}>Add NEXT_PUBLIC_AGENCY_ABN to settings</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 300, letterSpacing: '-0.02em' }}>
            {booking.state === 'invoice_issued' || booking.state === 'paid' ? 'TAX INVOICE' : 'DRAFT INVOICE'}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{invoiceNumber}</div>
        </div>
      </div>

      {/* Invoice meta */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginBottom: 36, paddingBottom: 32, borderBottom: '1px solid #e8e8e8' }}>
        {/* From */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999', marginBottom: 8 }}>
            Invoice To
          </div>
          {clientName && <div style={{ fontSize: 15, fontWeight: 600 }}>{clientName}</div>}
          {booking.producer_name ? (
            <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>Attn: {booking.producer_name}</div>
          ) : booking.client?.name && booking.client.company ? (
            <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>Attn: {booking.client.name}</div>
          ) : null}
          {booking.client?.abn && (
            <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>ABN: {booking.client.abn}</div>
          )}
        </div>

        {/* Dates */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999', marginBottom: 8 }}>
            Invoice Details
          </div>
          <div style={{ fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginBottom: 4 }}>
              <span style={{ color: '#666' }}>Invoice Date</span>
              <span style={{ fontWeight: 500 }}>{todayStr}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginBottom: 4 }}>
              <span style={{ color: '#666' }}>Payment Due</span>
              <span style={{ fontWeight: 500 }}>{dueDateStr}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginBottom: 4 }}>
              <span style={{ color: '#666' }}>Terms</span>
              <span style={{ fontWeight: 500 }}>Net {paymentTerms} days</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16 }}>
              <span style={{ color: '#666' }}>Ref</span>
              <span style={{ fontWeight: 500 }}>{booking.booking_ref}</span>
            </div>
            {booking.po_number && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginTop: 4 }}>
                <span style={{ color: '#666' }}>PO Number</span>
                <span style={{ fontWeight: 500 }}>{booking.po_number}</span>
              </div>
            )}
            {booking.job_number && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginTop: 4 }}>
                <span style={{ color: '#666' }}>Job Number</span>
                <span style={{ fontWeight: 500 }}>{booking.job_number}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Project line */}
      <div style={{ marginBottom: 28, padding: '14px 18px', background: '#f8f8f8', borderRadius: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999', marginBottom: 6 }}>
          Project
        </div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{booking.title}</div>
        {booking.brand?.name && (
          <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>Brand: {booking.brand.name}</div>
        )}
      </div>

      {/* Fee lines */}
      {feeLines.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: '#999', fontSize: 13 }}>
          No fee lines have been added to this booking.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
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
                <tr key={`group-${group.label}`}>
                  <td colSpan={4} style={{
                    padding: '12px 12px 4px',
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.05em', color: '#333',
                    background: '#f8f8f8',
                  }}>
                    {group.label}
                  </td>
                </tr>
                {group.lines.map((line: FeeLine) => (
                  <tr key={line.id}>
                    <td style={tdStyle}>
                      <div>{line.description}</div>
                      {line.notes && <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{line.notes}</div>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{line.quantity}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(line.unit_price)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500 }}>{formatCurrency(line.subtotal)}</td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      )}

      {/* Totals */}
      {totals && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 40 }}>
          <div style={{ width: 320 }}>
            <TotalRow label="Subtotal" value={formatCurrency(totals.subtotal)} />
            {totals.totalAsf > 0 && (
              <TotalRow label="Agency Service Fee (15%)" value={formatCurrency(totals.totalAsf)} />
            )}
            <TotalRow label="GST (10%)" value={formatCurrency(totals.totalGst)} />
            {totals.totalSuper > 0 && (
              <TotalRow label="Crew Fringes" value={formatCurrency(totals.totalSuper)} />
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 0', borderTop: '2px solid #1a1a1a', marginTop: 4 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>TOTAL DUE</span>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{formatCurrency(totals.grandTotal)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Payment instructions */}
      <div style={{ padding: '20px 24px', border: '1px solid #e8e8e8', borderRadius: 6, marginBottom: 32 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#666', marginBottom: 12 }}>
          Payment Instructions
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '6px 0', fontSize: 13 }}>
          <span style={{ color: '#999' }}>Method</span>
          <span>Electronic Funds Transfer (EFT)</span>
          <span style={{ color: '#999' }}>Bank</span>
          <span style={{ color: '#bbb', fontStyle: 'italic' }}>Bank details will be included when invoice is issued via Xero</span>
          <span style={{ color: '#999' }}>Reference</span>
          <span style={{ fontWeight: 500 }}>{invoiceNumber}</span>
        </div>
      </div>

      {/* Tax invoice footer */}
      <div style={{ borderTop: '1px solid #e8e8e8', paddingTop: 16, fontSize: 11, color: '#999', lineHeight: 1.7 }}>
        <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#555' }}>
          TAX INVOICE — GST Registered
        </p>
        <p style={{ margin: '0 0 4px' }}>
          ABN: {agency.abn ?? '[set NEXT_PUBLIC_AGENCY_ABN]'} · {agency.name} · {agency.address ?? 'Sydney NSW'}
        </p>
        <p style={{ margin: 0 }}>
          All amounts are in Australian Dollars (AUD) and inclusive of GST where applicable. This invoice is issued in accordance with Australian GST requirements.
          {booking.state !== 'invoice_issued' && booking.state !== 'paid' && (
            <span style={{ color: '#e07b39', fontWeight: 500 }}> This is a draft — not yet issued.</span>
          )}
        </p>
      </div>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
      <span style={{ color: '#555' }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
