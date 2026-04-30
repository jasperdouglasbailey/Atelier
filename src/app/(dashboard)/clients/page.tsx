import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import { listClients } from '@/lib/data/entities';
import { PALETTE } from '@/lib/utils/constants';
import CreateClientDialog from '@/components/entities/CreateClientDialog';

export default async function ClientsPage() {
  const clients = await listClients();

  return (
    <>
      <Topbar title="Clients" />
      <div className="p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs" style={{ color: PALETTE.muted }}>{clients.length} client{clients.length === 1 ? '' : 's'}</p>
          <CreateClientDialog />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => (
            <Link key={c.id} href={`/clients/${c.id}`} className="block rounded-lg border p-4 transition hover:border-opacity-80" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
              <div className="flex items-start justify-between">
                <div className="text-sm font-medium" style={{ color: PALETTE.text }}>{c.name}</div>
                {c.is_creative_agency && (
                  <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: `${PALETTE.accent}22`, color: PALETTE.accent }}>Agency</span>
                )}
              </div>
              {c.company && <div className="mt-0.5 text-xs" style={{ color: PALETTE.muted }}>{c.company}</div>}
              <div className="mt-2 space-y-0.5 text-xs" style={{ color: PALETTE.muted }}>
                {c.email && <div>{c.email}</div>}
                {c.phone && <div>{c.phone}</div>}
                {c.abn && <div>ABN: {c.abn}</div>}
                {c.payment_terms_days && <div>Terms: {c.payment_terms_days} days</div>}
              </div>
            </Link>
          ))}
          {clients.length === 0 && (
            <div className="col-span-full py-12 text-center text-sm" style={{ color: PALETTE.muted }}>
              No clients yet. They'll be created when you create bookings.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
