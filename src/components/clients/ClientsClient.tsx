'use client';

import { useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PALETTE } from '@/lib/utils/constants';
import DenseListTable, { type Column, type Filter } from '@/components/ui/DenseListTable';
import type { Client } from '@/lib/types/database';

type Props = {
  allClients: Client[];
  /** Union of every tag across every client — drives the chip row. */
  allTags: string[];
};

/**
 * Renders the clients index list with an optional tag-filter chip row
 * above the table.
 *
 * Tag filter UX:
 * - Empty state: no tags shown beyond the chip row itself; clicking a chip
 *   sets `?tag=foo` in the URL.
 * - Active tag: that chip is highlighted; the table is narrowed to clients
 *   whose tags array contains the active tag.
 * - Click the same chip again to clear.
 *
 * URL-driven so deep-linked filters survive reloads — same pattern as
 * `BookingTabs` and `ClientTabs`.
 */
export default function ClientsClient({ allClients, allTags }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTag = searchParams.get('tag');

  const filtered = useMemo(() => {
    if (!activeTag) return allClients;
    return allClients.filter((c) => Array.isArray(c.tags) && c.tags.includes(activeTag));
  }, [allClients, activeTag]);

  function setTag(tag: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (tag) params.set('tag', tag);
    else params.delete('tag');
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }

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
      key: 'tags',
      label: 'Tags',
      hideBelow: 'md',
      width: 'minmax(140px, 1fr)',
      render: (c) => {
        const tags = c.tags ?? [];
        if (tags.length === 0) return <span style={{ color: PALETTE.muted }}>—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="rounded px-1.5 py-0.5 text-[10px]"
                style={{ background: `${PALETTE.accent}15`, color: PALETTE.accent }}
              >
                {t}
              </span>
            ))}
            {tags.length > 3 && (
              <span className="text-[10px]" style={{ color: PALETTE.muted }}>+{tags.length - 3}</span>
            )}
          </div>
        );
      },
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
    <div className="space-y-3">
      {allTags.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Filter by tag"
        >
          <span
            className="text-[10px] font-semibold uppercase tracking-wider mr-1"
            style={{ color: PALETTE.muted }}
          >
            Tags
          </span>
          {allTags.map((tag) => {
            const isActive = activeTag === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => setTag(isActive ? null : tag)}
                className="rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors"
                style={{
                  background: isActive ? PALETTE.accent : `${PALETTE.accent}12`,
                  color: isActive ? PALETTE.bg : PALETTE.accent,
                  border: `1px solid ${isActive ? PALETTE.accent : `${PALETTE.accent}33`}`,
                  cursor: 'pointer',
                }}
                aria-pressed={isActive}
              >
                {tag}
              </button>
            );
          })}
          {activeTag && (
            <button
              type="button"
              onClick={() => setTag(null)}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium ml-1"
              style={{ color: PALETTE.muted, background: 'transparent', border: `1px solid ${PALETTE.border}`, cursor: 'pointer' }}
            >
              Clear
            </button>
          )}
        </div>
      )}

      <DenseListTable<Client>
        rows={filtered}
        columns={columns}
        filters={filters}
        hrefFor={(c) => `/clients/${c.id}`}
        emptyTitle={activeTag ? `No clients tagged "${activeTag}".` : 'No clients yet.'}
        emptyDescription={activeTag
          ? 'Clear the tag filter to see all clients.'
          : 'Clients are created automatically when you create bookings.'}
        countLabel={(n) => `${n} client${n !== 1 ? 's' : ''}`}
      />
    </div>
  );
}
