import { notFound } from 'next/navigation';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import CloneBookingButton from '@/components/bookings/CloneBookingButton';
import { getClient } from '@/lib/data/entities';
import { listBookings } from '@/lib/data/bookings';
import { PALETTE, BOOKING_STATE_LABELS, STATE_COLORS, SHOOT_TIER_LABELS } from '@/lib/utils/constants';
import { formatDate, formatCurrency } from '@/lib/utils/format';
import DataRightsControls from '@/components/entities/DataRightsControls';

type Props = { params: Promise<{ id: string }> };

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>{label}</div>
      <div className="mt-0.5 text-sm" style={{ color: PALETTE.text }}>{value}</div>
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border p-3 space-y-0.5" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>{label}</div>
      <div className="text-lg font-semibold tabular-nums" style={{ color: PALETTE.text }}>{value}</div>
      {sub && <div className="text-[10px]" style={{ color: PALETTE.muted }}>{sub}</div>}
    </div>
  );
}

const BILLED_STATES = new Set(['final_delivery', 'invoice_issued', 'paid']);
const LOST_STATES = new Set(['released', 'cancelled']);
const ACTIVE_STATES = new Set([
  'brief_received', 'brief_parsed', 'quote_drafted', 'quote_sent',
  'artists_crew_held', 'quote_confirmed', 'pre_production', 'shoot_live',
  'morning_after_check', 'post_production',
]);
const thisYear = new Date().getFullYear();

export default async function ClientDetailPage({ params }: Props) {
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();

  const { bookings } = await listBookings({ clientId: id, pageSize: 200 });

  // ---- Revenue signals ------------------------------------------------
  let totalBilled = 0;
  let ytdBilled = 0;
  let pipeline = 0;
  let wonCount = 0;
  let lostCount = 0;
  let activeCount = 0;
  const valuesForAvg: number[] = [];

  // Talent frequency map
  const talentCount: Record<string, { name: string; discipline: string | null; count: number }> = {};

  for (const b of bookings) {
    const isBilled = BILLED_STATES.has(b.state);
    const isLost = LOST_STATES.has(b.state);
    const isActive = ACTIVE_STATES.has(b.state);

    if (isBilled) {
      wonCount++;
      if (b.grand_total > 0) {
        totalBilled += b.grand_total;
        valuesForAvg.push(b.grand_total);
        if (new Date(b.created_at).getFullYear() === thisYear) ytdBilled += b.grand_total;
      }
    } else if (isLost) {
      lostCount++;
    } else if (isActive) {
      activeCount++;
      if (b.grand_total > 0) pipeline += b.grand_total;
    }

    // Tally talent appearances
    for (const bt of (b.booking_talent ?? [])) {
      const t = bt.talent;
      if (!t) continue;
      const key = t.name;
      if (!talentCount[key]) talentCount[key] = { name: t.name, discipline: t.discipline, count: 0 };
      talentCount[key].count++;
    }
  }

  const avgValue = valuesForAvg.length > 0
    ? valuesForAvg.reduce((a, b) => a + b, 0) / valuesForAvg.length
    : 0;

  const topTalent = Object.values(talentCount)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <>
      <Topbar title={client.name} />
      <div className="p-4 sm:p-6 max-w-3xl space-y-4">
        <Link href="/clients" className="text-xs" style={{ color: PALETTE.accent }}>← Clients</Link>

        {/* Header */}
        <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold" style={{ color: PALETTE.text }}>{client.name}</h2>
              {client.is_creative_agency && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${PALETTE.accent}22`, color: PALETTE.accent }}>
                  Agency
                </span>
              )}
            </div>
            <Link
              href={`/clients/${client.id}/edit`}
              className="rounded px-3 py-1 text-xs font-medium"
              style={{ background: PALETTE.surface, color: PALETTE.muted, border: `1px solid ${PALETTE.border}` }}
            >
              Edit
            </Link>
          </div>
        </section>

        {/* Revenue KPIs */}
        {bookings.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard
              label="Total Billed"
              value={totalBilled > 0 ? formatCurrency(totalBilled) : '—'}
              sub={`${wonCount} completed booking${wonCount !== 1 ? 's' : ''}`}
            />
            <KpiCard
              label={`${thisYear} Revenue`}
              value={ytdBilled > 0 ? formatCurrency(ytdBilled) : '—'}
              sub="year to date"
            />
            <KpiCard
              label="Avg Booking"
              value={avgValue > 0 ? formatCurrency(avgValue) : '—'}
              sub="completed jobs"
            />
            <KpiCard
              label="Pipeline"
              value={pipeline > 0 ? formatCurrency(pipeline) : '—'}
              sub={`${activeCount} active${lostCount > 0 ? ` · ${lostCount} lost` : ''}`}
            />
          </div>
        )}

        {/* Top artists */}
        {topTalent.length > 0 && (
          <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
              Frequent Artists
            </h3>
            <div className="flex flex-wrap gap-2">
              {topTalent.map((t) => (
                <div
                  key={t.name}
                  className="flex items-center gap-2 rounded border px-3 py-1.5"
                  style={{ borderColor: PALETTE.border }}
                >
                  <span className="text-xs font-medium" style={{ color: PALETTE.text }}>{t.name}</span>
                  {t.discipline && (
                    <span className="text-[10px]" style={{ color: PALETTE.muted }}>{t.discipline}</span>
                  )}
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
                    style={{ background: `${PALETTE.accent}22`, color: PALETTE.accent }}
                  >
                    ×{t.count}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Details */}
        <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Details</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Company" value={client.company} />
            <Field label="Email" value={client.email} />
            <Field label="Phone" value={client.phone} />
            <Field label="ABN" value={client.abn} />
            <Field label="Payment Terms" value={client.payment_terms_days ? `${client.payment_terms_days} days` : null} />
            {client.avg_doi_days ? (
              (() => {
                const isSlowPayer = client.payment_terms_days != null
                  ? client.avg_doi_days > client.payment_terms_days
                  : client.avg_doi_days > 30;
                return (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>Avg DOI</div>
                    <div className="mt-0.5 text-sm font-semibold" style={{ color: isSlowPayer ? PALETTE.danger : PALETTE.success }}>
                      {client.avg_doi_days} days
                      {isSlowPayer ? ' — slow payer' : ' — on time'}
                    </div>
                  </div>
                );
              })()
            ) : null}
          </div>
        </section>

        {client.notes && (
          <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Notes</h3>
            <p className="whitespace-pre-wrap text-sm" style={{ color: PALETTE.text }}>{client.notes}</p>
          </section>
        )}

        {/* Booking history */}
        <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
              Bookings ({bookings.length})
            </h3>
            {bookings.length > 0 && (
              <CloneBookingButton sourceBookingId={bookings[0].id} label="Repeat last booking" />
            )}
          </div>
          {bookings.length === 0 ? (
            <p className="text-xs" style={{ color: PALETTE.muted }}>No bookings for this client yet.</p>
          ) : (
            <div className="space-y-2">
              {bookings.map((b) => {
                const primaryArtist = b.booking_talent?.[0]?.talent;
                return (
                  <Link
                    key={b.id}
                    href={`/bookings/${b.id}`}
                    className="flex items-center justify-between rounded border px-3 py-2 transition hover:border-opacity-80"
                    style={{ borderColor: PALETTE.border }}
                  >
                    <div>
                      <div className="text-xs font-medium" style={{ color: PALETTE.text }}>
                        {b.booking_ref ?? b.title}
                      </div>
                      <div className="text-[10px] flex gap-2" style={{ color: PALETTE.muted }}>
                        <span>{SHOOT_TIER_LABELS[b.tier]}</span>
                        <span>{formatDate(b.created_at)}</span>
                        {primaryArtist && (
                          <span style={{ color: PALETTE.accent }}>
                            {primaryArtist.name}
                            {primaryArtist.discipline && ` · ${primaryArtist.discipline}`}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {b.grand_total > 0 && (
                        <span className="text-xs tabular-nums" style={{ color: PALETTE.muted }}>
                          {formatCurrency(b.grand_total)}
                        </span>
                      )}
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ background: `${STATE_COLORS[b.state]}22`, color: STATE_COLORS[b.state] }}
                      >
                        {BOOKING_STATE_LABELS[b.state]}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <DataRightsControls type="client" id={client.id} name={client.name} />

        <div className="text-[10px] pt-2" style={{ color: PALETTE.muted }}>
          Created {formatDate(client.created_at)} · Updated {formatDate(client.updated_at)}
        </div>
      </div>
    </>
  );
}
