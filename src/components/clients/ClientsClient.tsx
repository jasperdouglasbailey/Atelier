'use client';

import { PALETTE } from '@/lib/utils/constants';
import DenseListTable, { type Column, type Filter } from '@/components/ui/DenseListTable';
import type { Client } from '@/lib/types/database';

type Props = {
  allClients: Client[];
};

export default function ClientsClient({ allClients }: Props) {
  const columns: Column<Client>[] = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      sortValue: (c) => c.name?.toLowerCase() ?? '',
      width: 'minmax(220px, 1.5fr)',
      render: (c) => (
        <div className="min-w-0">
          <div className="font-medium truncate" style={{ color: PALETTE.text }}>{c.name}</div>
          {c.company && c.company !== c.name && (
            <div className="text-[11px] truncate" style={{ color: PALETTE.muted }}>{c.company}</div>
          )}
        </div>
      ),
    },
    {
      key: 'email',
      label: 'Email',
      hideBelow: 'md',
      width: 'minmax(180px, 1fr)',
      render: (c) => <span className="truncate block" style={{ color: PALETTE.muted }}>{c.email ?? '—'}</span>,
    },
    {
      key: 'phone',
      label: 'Phone',
      hideBelow: 'lg',
      width: '140px',
      render: (c) => <span style={{ color: PALETTE.muted }}>{c.phone ?? '—'}</span>,
    },
    {
      key: 'abn',
      label: 'ABN',
      hideBelow: 'lg',
      width: '140px',
      render: (c) => <span className="tabular-nums" style={{ color: PALETTE.muted }}>{c.abn ?? '—'}</span>,
    },
    {
      key: 'terms',
      label: 'Terms',
      hideBelow: 'md',
      width: '90px',
      align: 'right',
      sortable: true,
      sortValue: (c) => c.payment_terms_days ?? 0,
      render: (c) => c.payment_terms_days
        ? <span style={{ color: PALETTE.muted }}>{c.payment_terms_days}d</span>
        : <span style={{ color: PALETTE.muted }}>—</span>,
    },
    {
      key: 'status',
      label: 'Status',
      width: '120px',
      align: 'right',
      render: (c) => (
        <div className="flex items-center justify-end gap-1">
          {c.is_creative_agency && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ background: `${PALETTE.accent}22`, color: PALETTE.accent }}
            >
              Agency
            </span>
          )}
        </div>
      ),
    },
  ];

  const filters: Filter<Client>[] = [
    {
      kind: 'search',
      key: 'q',
      placeholder: 'Search by name, company, email, ABN…',
      predicate: (c, q) => {
        const needle = q.toLowerCase().trim();
        if (!needle) return true;
        const hay = [c.name, c.company, c.email, c.phone, c.abn]
          .filter(Boolean).join(' ').toLowerCase();
        return hay.includes(needle);
      },
    },
    {
      kind: 'select',
      key: 'type',
      label: 'All types',
      options: [
        { value: 'agency', label: 'Creative agency' },
        { value: 'brand', label: 'Brand direct' },
      ],
      predicate: (c, v) => v === 'agency' ? Boolean(c.is_creative_agency) : !c.is_creative_agency,
    },
  ];

  return (
    <DenseListTable<Client>
      rows={allClients}
      columns={columns}
      filters={filters}
      hrefFor={(c) => `/clients/${c.id}`}
      emptyTitle="No clients yet."
      emptyDescription="Clients are created automatically when you create bookings."
      countLabel={(n) => `${n} client${n !== 1 ? 's' : ''}`}
    />
  );
}
