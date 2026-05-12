'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { PALETTE } from '@/lib/utils/constants';
import type { Client } from '@/lib/types/database';

type Props = {
  allClients: Client[];
};

export default function ClientsClient({ allClients }: Props) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return allClients;
    return allClients.filter((c) => {
      const hay = [c.name, c.company, c.email, c.phone, c.abn]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [allClients, search]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or company…"
          className="min-w-0 flex-1 rounded-md border bg-transparent px-3 py-2 text-sm sm:max-w-xs"
          style={{ borderColor: PALETTE.border, color: PALETTE.text }}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="text-xs underline"
            style={{ color: PALETTE.muted }}
          >
            Clear
          </button>
        )}
        <span className="text-xs ml-auto" style={{ color: PALETTE.muted }}>
          {filtered.length} client{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((c) => (
          <Link
            key={c.id}
            href={`/clients/${c.id}`}
            className="block rounded-lg border p-4 transition hover:border-opacity-80"
            style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
          >
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
        {filtered.length === 0 && (
          <div className="col-span-full py-12 text-center text-sm" style={{ color: PALETTE.muted }}>
            {search
              ? 'No clients match this search.'
              : 'No clients yet. They\'ll be created when you create bookings.'}
          </div>
        )}
      </div>
    </>
  );
}
