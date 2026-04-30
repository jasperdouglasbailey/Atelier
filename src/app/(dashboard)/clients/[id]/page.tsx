import { notFound } from 'next/navigation';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import { getClient } from '@/lib/data/entities';
import { listBookings } from '@/lib/data/bookings';
import { PALETTE, BOOKING_STATE_LABELS, STATE_COLORS, SHOOT_TIER_LABELS } from '@/lib/utils/constants';
import { formatDate, formatCurrency } from '@/lib/utils/format';

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

export default async function ClientDetailPage({ params }: Props) {
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();

  const { bookings } = await listBookings({ clientId: id, pageSize: 50 });

  return (
    <>
      <Topbar title={client.name} />
      <div className="p-4 sm:p-6 max-w-3xl space-y-4">
        <Link href="/clients" className="text-xs" style={{ color: PALETTE.accent }}>← Clients</Link>

        {/* Header */}
        <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
          <div className="flex items-start justify-between">
            <h2 className="text-lg font-semibold" style={{ color: PALETTE.text }}>{client.name}</h2>
            {client.is_creative_agency && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${PALETTE.accent}22`, color: PALETTE.accent }}>
                Agency
              </span>
            )}
          </div>
        </section>

        {/* Details */}
        <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Details</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Company" value={client.company} />
            <Field label="Email" value={client.email} />
            <Field label="Phone" value={client.phone} />
            <Field label="ABN" value={client.abn} />
            <Field label="Payment Terms" value={client.payment_terms_days ? `${client.payment_terms_days} days` : null} />
            <Field label="Avg DOI" value={client.avg_doi_days ? `${client.avg_doi_days} days` : null} />
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
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
            Bookings ({bookings.length})
          </h3>
          {bookings.length === 0 ? (
            <p className="text-xs" style={{ color: PALETTE.muted }}>No bookings for this client yet.</p>
          ) : (
            <div className="space-y-2">
              {bookings.map((b) => (
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
              ))}
            </div>
          )}
        </section>

        <div className="text-[10px] pt-2" style={{ color: PALETTE.muted }}>
          Created {formatDate(client.created_at)} · Updated {formatDate(client.updated_at)}
        </div>
      </div>
    </>
  );
}
