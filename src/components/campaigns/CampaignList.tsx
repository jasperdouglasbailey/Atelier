'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Campaign, Client, Brand } from '@/lib/types/database';
import { PALETTE } from '@/lib/utils/constants';
import { createCampaignAction } from '@/app/actions/campaigns';

type Props = {
  campaigns: Campaign[];
  clients: Client[];
  brands: Brand[];
};

export default function CampaignList({ campaigns, clients, brands }: Props) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleCreate(formData: FormData) {
    setBusy(true);
    await createCampaignAction(formData);
    setShowCreate(false);
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold" style={{ color: PALETTE.text }}>
          {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}
        </h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded px-3 py-1.5 text-xs font-medium"
          style={{ background: PALETTE.accent, color: PALETTE.bg }}
        >
          {showCreate ? 'Cancel' : '+ New Campaign'}
        </button>
      </div>

      {showCreate && (
        <form action={handleCreate} className="rounded-lg border p-4 space-y-3" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[10px] font-semibold uppercase" style={{ color: PALETTE.muted }}>Campaign Name *</label>
              <input name="name" required className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs" style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase" style={{ color: PALETTE.muted }}>Client</label>
              <select name="client_id" className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs" style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}>
                <option value="">None</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase" style={{ color: PALETTE.muted }}>Brand</label>
              <select name="brand_id" className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs" style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}>
                <option value="">None</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase" style={{ color: PALETTE.muted }}>Year</label>
              <input name="year" type="number" defaultValue={new Date().getFullYear()} className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs" style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase" style={{ color: PALETTE.muted }}>Season</label>
              <input name="season" placeholder="e.g. SS27, AW26" className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs" style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }} />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase" style={{ color: PALETTE.muted }}>Notes</label>
            <textarea name="notes" rows={2} className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs" style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }} />
          </div>
          <button type="submit" disabled={busy} className="rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50" style={{ background: PALETTE.accent, color: PALETTE.bg }}>
            Create Campaign
          </button>
        </form>
      )}

      {campaigns.length === 0 ? (
        <p className="text-xs" style={{ color: PALETTE.muted }}>No campaigns yet.</p>
      ) : (
        <div className="space-y-2">
          {campaigns.map((c) => {
            const client = clients.find(cl => cl.id === c.client_id);
            const brand = brands.find(b => b.id === c.brand_id);
            return (
              <div key={c.id} className="rounded-lg border p-3" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium" style={{ color: PALETTE.text }}>{c.name}</div>
                  <div className="flex gap-2 text-[10px]" style={{ color: PALETTE.muted }}>
                    {c.season && <span>{c.season}</span>}
                    {c.year && <span>{c.year}</span>}
                  </div>
                </div>
                <div className="flex gap-3 mt-1 text-[10px]" style={{ color: PALETTE.muted }}>
                  {client && <span>Client: {client.name}</span>}
                  {brand && <span>Brand: {brand.name}</span>}
                </div>
                {c.notes && <p className="mt-1 text-xs" style={{ color: PALETTE.muted }}>{c.notes}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
