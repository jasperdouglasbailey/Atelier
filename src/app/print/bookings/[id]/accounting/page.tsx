import { notFound } from 'next/navigation';
import { getBooking } from '@/lib/data/bookings';
import { listFeeLinesForActiveQuote, listBookingTalent, listBookingCrew } from '@/lib/data/quotes';
import {
  computeQuoteTotals, computeAgencyMargin, computeGstPassthrough,
  computeArtistPayment, computeCrewPayment, effectiveCost,
} from '@/lib/utils/fee-engine';
import { formatCurrency } from '@/lib/utils/format';
import { getAgencyConfig } from '@/lib/utils/agency-config';
import {
  FEE_LINE_TYPE_LABELS, SHOOT_TIER_LABELS, GST_RATE,
  DEFAULT_COMMISSION_RATE, DEFAULT_ASF_RATE,
  SUPER_RATE_CHARGED, SUPER_RATE_PAID,
} from '@/lib/utils/constants';
import type { FeeLineType, ShootTier } from '@/lib/types/database';
import PrintActions from '../quote/PrintActions';

type Props = { params: Promise<{ id: string }> };

const ARTIST_LINE_TYPES = new Set<FeeLineType>(['artist_fee', 'usage_licence', 'file_management', 'retouching', 'post_production', 'artist_overtime', 'artist_travel']);
// All crew labour types — used for the GST-passthrough calc (GST IS due on
// overtime). Per-person crew-payment calls split these further into
// super-bearing vs non-super-bearing because overtime is NOT super-bearing.
const CREW_LABOUR_LINE_TYPES = new Set<FeeLineType>(['crew_labour', 'crew_overtime']);
const CREW_SUPER_BEARING_TYPES = new Set<FeeLineType>(['crew_labour']);
const CREW_OVERTIME_TYPES = new Set<FeeLineType>(['crew_overtime']);

/**
 * Job accounting statement — a single-job GST reconciliation suitable
 * for handing to an accountant or attaching to a BAS supporting workpaper.
 *
 * Sections follow AU industry convention:
 *   1. Header — agency identity, ABN, document title, period
 *   2. Job identification — ref, project, client, dates
 *   3. Revenue — what's billed to the client (the tax invoice)
 *   4. Cost of sales — what flows out to artist/crew/vendors
 *   5. GST reconciliation — collected vs input credits, net to ATO
 *   6. Agency margin — what's retained as agency revenue
 *   7. Reconciliation check — every dollar of the grand total accounted for
 *
 * All figures in AUD inc. GST where noted. Per the doctrine:
 *   - Commission 20% on artist labour (no super, no ASF)
 *   - ASF 15% default, per-line adjustable
 *   - Super charged 15% / paid 12% on crew labour only
 *   - GST 10% on subtotal + ASF (super is GST-free)
 *   - Reimbursements pass through at +10% GST when payee is GST-registered
 */
export default async function AccountingPrintPage({ params }: Props) {
  const { id } = await params;

  const [booking, feeLines, talent, crew] = await Promise.all([
    getBooking(id),
    listFeeLinesForActiveQuote(id),
    listBookingTalent(id),
    listBookingCrew(id),
  ]);

  if (!booking) notFound();

  const agency = getAgencyConfig();
  const today = new Date();
  const preparedAt = today.toLocaleDateString('en-AU', { dateStyle: 'long' });
  const documentRef = booking.booking_ref ? `JAS-${booking.booking_ref}` : `JAS-${id.slice(0, 8).toUpperCase()}`;
  const clientName = booking.client?.company || booking.client?.name || null;

  // Compute totals + breakdowns
  const totals = computeQuoteTotals(feeLines);
  const margin = computeAgencyMargin(totals);
  const primaryArtist = (talent[0] as { talent?: { gst_registered?: boolean; working_name?: string } } | undefined)?.talent;
  const artistGstRegistered = primaryArtist?.gst_registered ?? false;

  // All paid-out math uses COST subtotals (effectiveCost = cost_subtotal ?? subtotal).
  // When cost_subtotal isn't set on any line, cost = billed and the accounting
  // statement is unchanged from the pre-cost-split era.
  const artistFeeSubtotal = feeLines
    .filter((l) => ARTIST_LINE_TYPES.has(l.line_type) && !l.is_artist_reimbursement)
    .reduce((s, l) => s + effectiveCost(l), 0);
  const artistReimbursementSubtotal = feeLines
    .filter((l) => l.is_artist_reimbursement)
    .reduce((s, l) => s + effectiveCost(l), 0);

  const crewLabourSubtotalGstRegistered = feeLines
    .filter((l) => CREW_LABOUR_LINE_TYPES.has(l.line_type) && l.crew_id != null)
    .reduce((sum, l) => {
      const crewRow = (crew as Array<{ crew_id: string; crew?: { gst_registered?: boolean } }>).find((bc) => bc.crew_id === l.crew_id);
      return crewRow?.crew?.gst_registered ? sum + effectiveCost(l) : sum;
    }, 0);

  const gst = computeGstPassthrough({
    totals,
    artistFeeSubtotal,
    artistGstRegistered,
    crewLabourSubtotalGstRegistered,
    artistReimbursementSubtotal,
  });

  // Artist payment derivation (for the cost-of-sales narrative)
  const artistPayment = artistFeeSubtotal > 0
    ? computeArtistPayment(artistFeeSubtotal, artistGstRegistered)
    : null;

  // Crew payments — group by crew_id, then unlinked block.
  // Labour and overtime are tracked separately because overtime is NOT
  // super-bearing — passing them combined as `labourSubtotal` to
  // computeCrewPayment would overstate super by 12% of every OT line.
  const crewLabourByCrew = new Map<string | null, number>();
  const crewOvertimeByCrew = new Map<string | null, number>();
  const crewExpensesByCrew = new Map<string | null, number>();
  const crewIds = new Set<string | null>();
  for (const l of feeLines) {
    const key = l.crew_id ?? null;
    if (CREW_SUPER_BEARING_TYPES.has(l.line_type)) {
      crewLabourByCrew.set(key, (crewLabourByCrew.get(key) ?? 0) + effectiveCost(l));
      crewIds.add(key);
    } else if (CREW_OVERTIME_TYPES.has(l.line_type)) {
      crewOvertimeByCrew.set(key, (crewOvertimeByCrew.get(key) ?? 0) + effectiveCost(l));
      crewIds.add(key);
    } else if (l.line_type === 'crew_equipment' && !l.is_artist_reimbursement) {
      crewExpensesByCrew.set(key, (crewExpensesByCrew.get(key) ?? 0) + effectiveCost(l));
      crewIds.add(key);
    }
  }
  type CrewPaymentRow = { name: string; gstReg: boolean; labour: number; overtime: number; expenses: number; superPaid: number; gst: number; net: number };
  const crewPayments: CrewPaymentRow[] = [];
  for (const crewId of crewIds) {
    const crewRow = crewId ? (crew as Array<{ crew_id: string; crew?: { name?: string; gst_registered?: boolean } }>).find((bc) => bc.crew_id === crewId) : null;
    const name = crewRow?.crew?.name ?? 'Unattached crew';
    const isReg = crewRow?.crew?.gst_registered ?? false;
    const labour = crewLabourByCrew.get(crewId) ?? 0;
    const overtime = crewOvertimeByCrew.get(crewId) ?? 0;
    const expenses = crewExpensesByCrew.get(crewId) ?? 0;
    const cp = computeCrewPayment(labour, expenses, isReg, overtime);
    crewPayments.push({ name, gstReg: isReg, labour, overtime, expenses, superPaid: cp.superPaid, gst: cp.gst, net: cp.netPayment });
  }

  // Reimbursement payout figure (incl GST passed through when artist is registered)
  const reimbursementPayout = artistGstRegistered
    ? Math.round(artistReimbursementSubtotal * (1 + GST_RATE) * 100) / 100
    : artistReimbursementSubtotal;

  const totalPaidOut = (artistPayment?.netPayment ?? 0)
    + reimbursementPayout
    + crewPayments.reduce((s, c) => s + c.net, 0);

  // Reconciliation: grand total + super charged (super is added separately) should equal
  // paid out + super to fund + net to ATO + agency margin.
  // Actually totals.grandTotal already includes super charged, so:
  //   grandTotal = paidOut + netToAto + margin.total + (vendor invoices not modelled)
  const reconciliationDelta = totals.grandTotal - totalPaidOut - gst.netToAto - margin.total;

  // ─────────────────────────────────────────────────────────────────────────
  // Styles — match the invoice template's professional A4 aesthetic
  // ─────────────────────────────────────────────────────────────────────────
  const sectionTitle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
    color: '#1a1a1a', borderBottom: '2px solid #1a1a1a', paddingBottom: 6, marginBottom: 12, marginTop: 28,
  };
  const subSection: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
    color: '#666', marginTop: 18, marginBottom: 8,
  };
  const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f0f0f0', fontSize: 12, color: '#1a1a1a', verticalAlign: 'top' };
  const tdNum: React.CSSProperties = { ...tdStyle, textAlign: 'right', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontVariantNumeric: 'tabular-nums' };
  const thStyle: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#666', borderBottom: '2px solid #1a1a1a' };
  const thNum: React.CSSProperties = { ...thStyle, textAlign: 'right' };
  const totalRow: React.CSSProperties = { padding: '10px 10px', fontSize: 12, fontWeight: 700, color: '#1a1a1a', borderTop: '2px solid #1a1a1a' };
  const totalNum: React.CSSProperties = { ...totalRow, textAlign: 'right', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontVariantNumeric: 'tabular-nums' };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 48px', color: '#1a1a1a', background: '#fff' }}>
      <PrintActions />

      {/* Header — agency identity + document title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 36 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{agency.name.toUpperCase()}</div>
          <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>Photography Production Agency · {agency.address ?? 'Sydney, NSW'}</div>
          <div style={{ fontSize: 11, color: '#666', marginTop: 1 }}>
            ABN: {agency.abn ?? <span style={{ fontStyle: 'italic' }}>not configured</span>}
            {agency.email && <> · {agency.email}</>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 24, fontWeight: 300, letterSpacing: '-0.02em' }}>JOB ACCOUNTING STATEMENT</div>
          <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}>{documentRef}</div>
          <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>Prepared {preparedAt}</div>
        </div>
      </div>

      {/* Job identification */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, paddingBottom: 24, borderBottom: '1px solid #e8e8e8' }}>
        <div>
          <div style={{ ...subSection, marginTop: 0 }}>Job</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{booking.title}</div>
          <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
            {booking.booking_ref} · {SHOOT_TIER_LABELS[booking.tier as ShootTier]}
          </div>
          {booking.shoot_date_notes && (
            <div style={{ fontSize: 11, color: '#666', marginTop: 1 }}>{booking.shoot_date_notes}</div>
          )}
          {booking.shoot_location && (
            <div style={{ fontSize: 11, color: '#666', marginTop: 1 }}>{booking.shoot_location}</div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ ...subSection, marginTop: 0 }}>Client</div>
          {clientName && <div style={{ fontSize: 14, fontWeight: 600 }}>{clientName}</div>}
          {booking.client?.abn && <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>ABN: {booking.client.abn}</div>}
          {booking.brand?.name && <div style={{ fontSize: 11, color: '#666', marginTop: 1 }}>Brand: {booking.brand.name}</div>}
        </div>
      </div>

      {feeLines.length === 0 ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: '#999', fontSize: 13 }}>
          No fee lines have been added to this booking. Once the quote is built, the accounting statement will populate automatically.
        </div>
      ) : (
        <>
          {/* ──────────────────────────────────────────────────────────────────
              SECTION 1 — REVENUE (tax invoice to client)
              ────────────────────────────────────────────────────────────── */}
          <div style={sectionTitle}>1. Revenue — Tax invoice to client</div>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 12, lineHeight: 1.5 }}>
            Amounts charged to the client per the issued tax invoice. Line totals shown
            include the line subtotal, Agency Service Fee (ASF), and 10% GST.
            Superannuation contributions on crew labour are charged separately at {(SUPER_RATE_CHARGED * 100).toFixed(0)}%
            (GST-free per ATO ruling).
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: '36%' }}>Description</th>
                <th style={{ ...thStyle, width: '14%' }}>Type</th>
                <th style={{ ...thNum, width: '12%' }}>Subtotal</th>
                <th style={{ ...thNum, width: '12%' }}>ASF</th>
                <th style={{ ...thNum, width: '12%' }}>GST</th>
                <th style={{ ...thNum, width: '14%' }}>Line Total</th>
              </tr>
            </thead>
            <tbody>
              {feeLines.map((l, i) => {
                const computed = totals.lines[i];
                return (
                  <tr key={l.id}>
                    <td style={tdStyle}>
                      {l.description}
                      {l.is_artist_reimbursement && (
                        <span style={{ marginLeft: 6, padding: '1px 5px', fontSize: 9, fontWeight: 600, background: '#f3eee5', color: '#8a6d3b', borderRadius: 3 }}>REIMB</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 11, color: '#666' }}>{FEE_LINE_TYPE_LABELS[l.line_type] ?? l.line_type}</td>
                    <td style={tdNum}>{formatCurrency(computed.subtotal)}</td>
                    <td style={tdNum}>{computed.asfAmount > 0 ? formatCurrency(computed.asfAmount) : '—'}</td>
                    <td style={tdNum}>{computed.gstAmount > 0 ? formatCurrency(computed.gstAmount) : '—'}</td>
                    <td style={{ ...tdNum, fontWeight: 600 }}>{formatCurrency(computed.lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td style={totalRow} colSpan={2}>Sub-totals</td>
                <td style={totalNum}>{formatCurrency(totals.subtotal)}</td>
                <td style={totalNum}>{formatCurrency(totals.totalAsf)}</td>
                <td style={totalNum}>{formatCurrency(totals.totalGst)}</td>
                <td style={totalNum}>{formatCurrency(totals.subtotal + totals.totalAsf + totals.totalGst)}</td>
              </tr>
              {totals.totalSuper > 0 && (
                <tr>
                  <td style={{ ...tdStyle, fontWeight: 500 }} colSpan={5}>+ Superannuation (charged at {(SUPER_RATE_CHARGED * 100).toFixed(0)}% on crew labour, GST-free)</td>
                  <td style={{ ...tdNum, fontWeight: 600 }}>{formatCurrency(totals.totalSuper)}</td>
                </tr>
              )}
              <tr>
                <td style={{ ...totalRow, fontSize: 13 }} colSpan={5}>Grand total invoiced to client</td>
                <td style={{ ...totalNum, fontSize: 14 }}>{formatCurrency(totals.grandTotal)}</td>
              </tr>
            </tfoot>
          </table>

          {/* ──────────────────────────────────────────────────────────────────
              SECTION 2 — COST OF SALES (cash out)
              ────────────────────────────────────────────────────────────── */}
          <div style={sectionTitle}>2. Cost of sales — Payments out</div>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 12, lineHeight: 1.5 }}>
            Cash paid to talent, crew, and superannuation funds. Commission ({(DEFAULT_COMMISSION_RATE * 100).toFixed(0)}%)
            and commission GST are deducted from the artist&rsquo;s gross fees before payment. Crew payments include
            superannuation at the legislated {(SUPER_RATE_PAID * 100).toFixed(0)}% rate plus GST where the crew member is registered.
          </div>

          {/* Artist payment derivation */}
          {artistPayment && (
            <>
              <div style={subSection}>Artist · {primaryArtist?.working_name ?? 'Primary artist'} {artistGstRegistered ? '· GST-registered' : '· not GST-registered'}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={tdStyle}>Artist fees (gross, subject to commission)</td>
                    <td style={tdNum}>{formatCurrency(artistPayment.grossFees)}</td>
                  </tr>
                  <tr>
                    <td style={tdStyle}>Less: agency commission {(DEFAULT_COMMISSION_RATE * 100).toFixed(0)}%</td>
                    <td style={{ ...tdNum, color: '#c0392b' }}>−{formatCurrency(artistPayment.commission)}</td>
                  </tr>
                  <tr>
                    <td style={tdStyle}>Less: GST on agency commission ({(GST_RATE * 100).toFixed(0)}% of commission)</td>
                    <td style={{ ...tdNum, color: '#c0392b' }}>−{formatCurrency(artistPayment.commissionGst)}</td>
                  </tr>
                  {artistGstRegistered && (
                    <tr>
                      <td style={tdStyle}>Add: GST on artist&rsquo;s invoice to agency ({(GST_RATE * 100).toFixed(0)}% of fees, claimable input credit)</td>
                      <td style={{ ...tdNum, color: '#3d7a5a' }}>+{formatCurrency(artistPayment.artistGst)}</td>
                    </tr>
                  )}
                  <tr>
                    <td style={totalRow}>Net cash to artist</td>
                    <td style={totalNum}>{formatCurrency(artistPayment.netPayment)}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {/* Reimbursement pass-through */}
          {artistReimbursementSubtotal > 0 && (
            <>
              <div style={subSection}>Reimbursements / allowances to artist</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={tdStyle}>Equipment, allowances (1:1 pass-through, no commission)</td>
                    <td style={tdNum}>{formatCurrency(artistReimbursementSubtotal)}</td>
                  </tr>
                  {artistGstRegistered && (
                    <tr>
                      <td style={tdStyle}>+ GST on artist&rsquo;s on-charge ({(GST_RATE * 100).toFixed(0)}%, claimable input credit)</td>
                      <td style={{ ...tdNum, color: '#3d7a5a' }}>+{formatCurrency(Math.round(artistReimbursementSubtotal * GST_RATE * 100) / 100)}</td>
                    </tr>
                  )}
                  <tr>
                    <td style={totalRow}>Reimbursement paid to artist</td>
                    <td style={totalNum}>{formatCurrency(reimbursementPayout)}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {/* Crew payments */}
          {crewPayments.length > 0 && (
            <>
              <div style={subSection}>Crew payments (per recipient)</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: '22%' }}>Recipient</th>
                    <th style={{ ...thStyle, width: '10%' }}>Status</th>
                    <th style={{ ...thNum, width: '12%' }}>Labour</th>
                    <th style={{ ...thNum, width: '10%' }}>Overtime</th>
                    <th style={{ ...thNum, width: '12%' }}>Expenses</th>
                    <th style={{ ...thNum, width: '11%' }}>Super {(SUPER_RATE_PAID * 100).toFixed(0)}%</th>
                    <th style={{ ...thNum, width: '10%' }}>GST</th>
                    <th style={{ ...thNum, width: '13%' }}>Net Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {crewPayments.map((c, i) => (
                    <tr key={i}>
                      <td style={tdStyle}>{c.name}</td>
                      <td style={{ ...tdStyle, fontSize: 11, color: '#666' }}>{c.gstReg ? 'GST reg.' : 'Not reg.'}</td>
                      <td style={tdNum}>{formatCurrency(c.labour)}</td>
                      <td style={tdNum}>{c.overtime > 0 ? formatCurrency(c.overtime) : '—'}</td>
                      <td style={tdNum}>{c.expenses > 0 ? formatCurrency(c.expenses) : '—'}</td>
                      <td style={tdNum}>{formatCurrency(c.superPaid)}</td>
                      <td style={tdNum}>{c.gst > 0 ? formatCurrency(c.gst) : '—'}</td>
                      <td style={{ ...tdNum, fontWeight: 600 }}>{formatCurrency(c.net)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={totalRow} colSpan={7}>Total crew payments</td>
                    <td style={totalNum}>{formatCurrency(crewPayments.reduce((s, c) => s + c.net, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </>
          )}

          {/* Total cost of sales */}
          <div style={{ marginTop: 16, padding: '12px 14px', background: '#f8f8f8', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total cost of sales (cash paid out)</span>
            <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{formatCurrency(totalPaidOut)}</span>
          </div>

          {/* ──────────────────────────────────────────────────────────────────
              SECTION 3 — GST RECONCILIATION
              ────────────────────────────────────────────────────────────── */}
          <div style={sectionTitle}>3. GST reconciliation — Net liability to ATO</div>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 12, lineHeight: 1.5 }}>
            GST collected from the client minus input credits paid to GST-registered talent and crew.
            Per ATO doctrine, commission income is a taxable supply by the agency to the artist; the GST
            on commission is therefore owed to the ATO. Superannuation contributions are GST-free.
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={tdStyle}>
                  <strong>GST collected</strong> on client tax invoice ({(GST_RATE * 100).toFixed(0)}% × (subtotals + ASF))
                </td>
                <td style={tdNum}>{formatCurrency(gst.collectedOnLines)}</td>
              </tr>
              {gst.collectedOnCommission > 0 && (
                <tr>
                  <td style={tdStyle}>
                    <strong>GST on agency commission income</strong> ({(GST_RATE * 100).toFixed(0)}% × commission, deducted from artist&rsquo;s pay)
                  </td>
                  <td style={tdNum}>{formatCurrency(gst.collectedOnCommission)}</td>
                </tr>
              )}
              <tr>
                <td style={tdStyle}>Total GST in agency hands (before input credits)</td>
                <td style={{ ...tdNum, fontWeight: 600 }}>{formatCurrency(gst.collectedTotal)}</td>
              </tr>
              {gst.artistInputCredits > 0 && (
                <tr>
                  <td style={tdStyle}>Less: input credit — GST on artist&rsquo;s invoice to agency (fees + reimb)</td>
                  <td style={{ ...tdNum, color: '#3d7a5a' }}>−{formatCurrency(gst.artistInputCredits)}</td>
                </tr>
              )}
              {gst.crewInputCredits > 0 && (
                <tr>
                  <td style={tdStyle}>Less: input credit — GST on GST-registered crew invoices</td>
                  <td style={{ ...tdNum, color: '#3d7a5a' }}>−{formatCurrency(gst.crewInputCredits)}</td>
                </tr>
              )}
              <tr>
                <td style={totalRow}>Net GST payable to ATO</td>
                <td style={totalNum}>{formatCurrency(gst.netToAto)}</td>
              </tr>
            </tbody>
          </table>

          {/* ──────────────────────────────────────────────────────────────────
              SECTION 4 — AGENCY MARGIN
              ────────────────────────────────────────────────────────────── */}
          <div style={sectionTitle}>4. Agency margin — Revenue retained</div>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 12, lineHeight: 1.5 }}>
            Gross margin recognised by the agency on this booking, before operating costs and corporate tax.
            Comprises commission on artist labour, Agency Service Fee charged on each line, and the spread
            on crew superannuation (charged at {(SUPER_RATE_CHARGED * 100).toFixed(0)}%, paid to fund at {(SUPER_RATE_PAID * 100).toFixed(0)}%).
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {margin.commission > 0 && (
                <tr>
                  <td style={tdStyle}>Commission ({(DEFAULT_COMMISSION_RATE * 100).toFixed(0)}% on artist labour subtotal)</td>
                  <td style={tdNum}>{formatCurrency(margin.commission)}</td>
                </tr>
              )}
              {margin.asf > 0 && (
                <tr>
                  <td style={tdStyle}>Agency Service Fee (default {(DEFAULT_ASF_RATE * 100).toFixed(0)}%, per-line adjustable)</td>
                  <td style={tdNum}>{formatCurrency(margin.asf)}</td>
                </tr>
              )}
              {margin.superSpread > 0 && (
                <tr>
                  <td style={tdStyle}>Super spread (charged {(SUPER_RATE_CHARGED * 100).toFixed(0)}% − paid {(SUPER_RATE_PAID * 100).toFixed(0)}%)</td>
                  <td style={tdNum}>{formatCurrency(margin.superSpread)}</td>
                </tr>
              )}
              <tr>
                <td style={totalRow}>Total agency margin (pre-tax, pre-opex)</td>
                <td style={totalNum}>{formatCurrency(margin.total)}</td>
              </tr>
            </tbody>
          </table>

          {/* ──────────────────────────────────────────────────────────────────
              SECTION 5 — RECONCILIATION CHECK
              ────────────────────────────────────────────────────────────── */}
          <div style={sectionTitle}>5. Reconciliation check</div>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 12, lineHeight: 1.5 }}>
            Every dollar of the grand total is accounted for in one of three buckets:
            cash paid to talent/crew, GST remitted to ATO, or agency margin retained.
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ ...tdStyle, fontWeight: 600 }}>Grand total invoiced to client</td>
                <td style={{ ...tdNum, fontWeight: 600 }}>{formatCurrency(totals.grandTotal)}</td>
              </tr>
              <tr>
                <td style={tdStyle}>Less: total cost of sales (paid to talent + crew + reimb)</td>
                <td style={{ ...tdNum, color: '#c0392b' }}>−{formatCurrency(totalPaidOut)}</td>
              </tr>
              <tr>
                <td style={tdStyle}>Less: net GST payable to ATO</td>
                <td style={{ ...tdNum, color: '#c0392b' }}>−{formatCurrency(gst.netToAto)}</td>
              </tr>
              <tr>
                <td style={tdStyle}>Less: agency margin retained</td>
                <td style={{ ...tdNum, color: '#c0392b' }}>−{formatCurrency(margin.total)}</td>
              </tr>
              <tr>
                <td style={totalRow}>Reconciliation balance</td>
                <td style={{ ...totalNum, color: Math.abs(reconciliationDelta) < 0.01 ? '#3d7a5a' : '#c0392b' }}>
                  {Math.abs(reconciliationDelta) < 0.01 ? formatCurrency(0) + ' ✓' : formatCurrency(reconciliationDelta) + ' ⚠'}
                </td>
              </tr>
            </tbody>
          </table>

          {Math.abs(reconciliationDelta) >= 0.01 && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: '#fef3e0', borderLeft: '3px solid #b06a00', fontSize: 11, color: '#5a3a00' }}>
              <strong>Note:</strong> Reconciliation difference of {formatCurrency(reconciliationDelta)} typically reflects
              vendor invoices billed directly to the agency (studio hire, external equipment rental, etc.) that
              aren&rsquo;t modelled through the artist/crew payment structure. Verify against AP records before BAS.
            </div>
          )}
        </>
      )}

      {/* Footer */}
      <div style={{ marginTop: 48, paddingTop: 16, borderTop: '1px solid #e8e8e8', display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#999' }}>
        <span>{agency.name} · ABN {agency.abn ?? '—'} · Prepared {preparedAt}</span>
        <span>{documentRef} · For accounting use</span>
      </div>
    </div>
  );
}
