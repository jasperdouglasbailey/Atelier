'use client';

import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { PALETTE } from '@/lib/utils/constants';

// Shared list-page chrome — used by Talent, Crew, Clients, Locations, Audit.
// Dense rows (single line + optional secondary line on hover), sticky header,
// inline filter bar, optional grouping, hover-revealed actions. Replaces the
// 3-column card grids that previously made every list page require scrolling.

export type Column<T> = {
  key: string;
  label: string;
  width?: string;            // e.g. '120px', 'minmax(0, 1fr)', 'auto'
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  hideBelow?: 'sm' | 'md' | 'lg'; // Tailwind breakpoint at which to hide
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | null | undefined;
};

export type Filter<T> =
  | {
      kind: 'search';
      key: string;
      placeholder?: string;
      predicate: (row: T, value: string) => boolean;
    }
  | {
      kind: 'select';
      key: string;
      label: string;             // dropdown placeholder ("All cities" etc.)
      options: { value: string; label: string }[];
      predicate: (row: T, value: string) => boolean;
      defaultValue?: string;
    };

export type GroupBy<T> = {
  getValue: (row: T) => string;
  orderKeys?: (entries: { key: string; count: number }[]) => string[];
  labelFor?: (key: string) => string;
  persistKey?: string;          // localStorage key prefix for collapse state
  enabledByDefault?: boolean;
  toggleHeader?: string;        // label for the group-by toggle, e.g. "Group by city"
};

export type DenseListTableProps<T extends { id: string | number }> = {
  rows: T[];
  columns: Column<T>[];
  filters?: Filter<T>[];
  hrefFor?: (row: T) => string;
  rowAction?: (row: T) => void;
  groupBy?: GroupBy<T>;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Optional CTA shown inside the empty state when no filters are active.
   *  Used by Locations to restore the "Add first location" inline link
   *  that was lost in the original card-grid → DenseListTable port. */
  emptyCta?: { label: string; href: string };
  rowDimWhen?: (row: T) => boolean;
  countLabel?: (n: number) => string;   // "5 artists", "12 crew members"
  initialSort?: { key: string; dir: 'asc' | 'desc' };
};

const HIDE_CLASS: Record<NonNullable<Column<unknown>['hideBelow']>, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
};

export default function DenseListTable<T extends { id: string | number }>({
  rows,
  columns,
  filters = [],
  hrefFor,
  rowAction,
  groupBy,
  emptyTitle = 'No results',
  emptyDescription,
  emptyCta,
  rowDimWhen,
  countLabel,
  initialSort,
}: DenseListTableProps<T>) {
  const router = useRouter();

  // Filter state — keyed by filter.key
  const [filterState, setFilterState] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of filters) {
      if (f.kind === 'select' && f.defaultValue) init[f.key] = f.defaultValue;
      else init[f.key] = '';
    }
    return init;
  });
  const setFilterValue = (key: string, value: string) =>
    setFilterState((prev) => ({ ...prev, [key]: value }));

  // Sort state
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null);

  // Group state — controlled by toggle button if groupBy is provided
  const [grouped, setGrouped] = useState(groupBy?.enabledByDefault ?? Boolean(groupBy));

  // Apply filters
  const filtered = useMemo(() => {
    let out = rows;
    for (const f of filters) {
      const v = filterState[f.key];
      if (!v) continue;
      out = out.filter((row) => f.predicate(row, v));
    }
    return out;
  }, [rows, filters, filterState]);

  // Apply sort
  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return filtered;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, sort, columns]);

  // Group sorted rows
  const groups = useMemo(() => {
    if (!groupBy || !grouped) return null;
    const map = new Map<string, T[]>();
    for (const row of sorted) {
      const key = groupBy.getValue(row) || '—';
      const arr = map.get(key) ?? [];
      arr.push(row);
      map.set(key, arr);
    }
    const entries = Array.from(map.entries()).map(([key, items]) => ({ key, count: items.length }));
    const ordered = groupBy.orderKeys ? groupBy.orderKeys(entries) : entries.sort((a, b) => b.count - a.count).map((e) => e.key);
    return ordered.map((key) => ({ key, label: groupBy.labelFor?.(key) ?? key, items: map.get(key) ?? [] }));
  }, [sorted, groupBy, grouped]);

  const hasFilters = Object.values(filterState).some(Boolean);

  function clickHeader(col: Column<T>) {
    if (!col.sortable) return;
    if (sort?.key !== col.key) setSort({ key: col.key, dir: 'asc' });
    else if (sort.dir === 'asc') setSort({ key: col.key, dir: 'desc' });
    else setSort(null);
  }

  function clickRow(row: T) {
    if (rowAction) rowAction(row);
    else if (hrefFor) router.push(hrefFor(row));
  }

  return (
    <div>
      <FilterBar
        filters={filters}
        filterState={filterState}
        setFilterValue={setFilterValue}
        onClear={() => setFilterState((prev) => Object.fromEntries(Object.keys(prev).map((k) => [k, ''])))}
        hasFilters={hasFilters}
        count={sorted.length}
        countLabel={countLabel}
        groupBy={groupBy}
        grouped={grouped}
        setGrouped={setGrouped}
      />

      {sorted.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} hasFilters={hasFilters} cta={emptyCta} />
      ) : (
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: PALETTE.border, background: PALETTE.surface }}>
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10" style={{ background: PALETTE.bg }}>
              <tr style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
                {columns.map((col) => {
                  const isSorted = sort?.key === col.key;
                  const hideClass = col.hideBelow ? HIDE_CLASS[col.hideBelow] : '';
                  return (
                    <th
                      key={col.key}
                      className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wide ${hideClass}`}
                      style={{
                        color: PALETTE.muted,
                        textAlign: col.align ?? 'left',
                        width: col.width,
                        cursor: col.sortable ? 'pointer' : 'default',
                        userSelect: 'none',
                      }}
                      onClick={() => clickHeader(col)}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {col.sortable && (
                          <span aria-hidden style={{ opacity: isSorted ? 1 : 0.25 }}>
                            {isSorted ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
                          </span>
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {groups ? (
                groups.map((group) => (
                  <GroupRows<T>
                    key={group.key}
                    label={group.label}
                    rawKey={group.key}
                    items={group.items}
                    columns={columns}
                    clickRow={clickRow}
                    rowDimWhen={rowDimWhen}
                    hrefFor={hrefFor}
                    persistKey={groupBy?.persistKey}
                  />
                ))
              ) : (
                sorted.map((row) => (
                  <Row<T>
                    key={row.id}
                    row={row}
                    columns={columns}
                    clickRow={clickRow}
                    dim={rowDimWhen?.(row) ?? false}
                    hrefFor={hrefFor}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterBar<T>({
  filters, filterState, setFilterValue, onClear, hasFilters, count, countLabel, groupBy, grouped, setGrouped,
}: {
  filters: Filter<T>[];
  filterState: Record<string, string>;
  setFilterValue: (key: string, value: string) => void;
  onClear: () => void;
  hasFilters: boolean;
  count: number;
  countLabel?: (n: number) => string;
  groupBy?: GroupBy<T>;
  grouped: boolean;
  setGrouped: (v: boolean) => void;
}) {
  if (filters.length === 0 && !groupBy && countLabel === undefined) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {filters.map((f) => {
        if (f.kind === 'search') {
          return (
            <input
              key={f.key}
              type="text"
              value={filterState[f.key] ?? ''}
              onChange={(e) => setFilterValue(f.key, e.target.value)}
              placeholder={f.placeholder ?? 'Search…'}
              className="min-w-0 flex-1 rounded-md border bg-transparent px-3 py-1.5 text-sm sm:max-w-xs"
              style={{ borderColor: PALETTE.border, color: PALETTE.text }}
            />
          );
        }
        return (
          <select
            key={f.key}
            value={filterState[f.key] ?? ''}
            onChange={(e) => setFilterValue(f.key, e.target.value)}
            className="rounded-md border px-3 py-1.5 text-sm"
            style={{ borderColor: PALETTE.border, color: PALETTE.text, background: PALETTE.bg }}
          >
            <option value="">{f.label}</option>
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        );
      })}
      {hasFilters && (
        <button type="button" onClick={onClear} className="text-xs underline" style={{ color: PALETTE.muted }}>
          Clear
        </button>
      )}
      <div className="ml-auto flex items-center gap-3 text-xs" style={{ color: PALETTE.muted }}>
        {groupBy && (
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
            <span>{groupBy.toggleHeader ?? 'Group'}</span>
          </label>
        )}
        <span>{countLabel ? countLabel(count) : `${count} result${count !== 1 ? 's' : ''}`}</span>
      </div>
    </div>
  );
}

function Row<T extends { id: string | number }>({
  row, columns, clickRow, dim, hrefFor,
}: {
  row: T;
  columns: Column<T>[];
  clickRow: (row: T) => void;
  dim: boolean;
  hrefFor?: (row: T) => string;
}) {
  const navigable = Boolean(hrefFor);
  return (
    <tr
      onClick={() => clickRow(row)}
      className="group cursor-pointer transition-colors hover:bg-[var(--p-bg-soft)]"
      style={{
        borderTop: `1px solid ${PALETTE.border}`,
        opacity: dim ? 0.55 : 1,
        cursor: navigable ? 'pointer' : 'default',
      }}
    >
      {columns.map((col) => {
        const hideClass = col.hideBelow ? HIDE_CLASS[col.hideBelow] : '';
        return (
          <td
            key={col.key}
            className={`px-3 py-2 align-middle ${hideClass}`}
            style={{ textAlign: col.align ?? 'left', color: PALETTE.text }}
          >
            {col.render(row)}
          </td>
        );
      })}
    </tr>
  );
}

function GroupRows<T extends { id: string | number }>({
  label, rawKey, items, columns, clickRow, rowDimWhen, hrefFor, persistKey,
}: {
  label: string;
  rawKey: string;
  items: T[];
  columns: Column<T>[];
  clickRow: (row: T) => void;
  rowDimWhen?: (row: T) => boolean;
  hrefFor?: (row: T) => string;
  persistKey?: string;
}) {
  const storageKey = persistKey ? `${persistKey}:${rawKey}:collapsed` : null;
  const [collapsed, setCollapsed] = useState(false);

  // Hydrate collapse state from localStorage after mount. Matches the
  // existing pattern in CollapsibleCityGroup.tsx — one-shot read of a
  // persisted preference, which must run on the client to avoid SSR/CSR
  // mismatch (the server has no localStorage so it always renders `false`).
  useEffect(() => {
    if (!storageKey) return;
    try {
      const stored = window.localStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot read of persisted preference after hydration; intentional pattern to avoid SSR/CSR mismatch
      if (stored === '1') setCollapsed(true);
    } catch { /* localStorage may be disabled — ignore */ }
  }, [storageKey]);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    if (!storageKey) return;
    try { window.localStorage.setItem(storageKey, next ? '1' : '0'); } catch { /* ignore */ }
  }

  return (
    <>
      <tr style={{ background: PALETTE.bg, borderTop: `1px solid ${PALETTE.border}` }}>
        <td
          colSpan={columns.length}
          className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide cursor-pointer select-none"
          style={{ color: PALETTE.muted }}
          onClick={toggle}
        >
          <span aria-hidden className="inline-block w-3 text-center">{collapsed ? '▸' : '▾'}</span>{' '}
          {label} <span style={{ opacity: 0.6 }}>· {items.length}</span>
        </td>
      </tr>
      {!collapsed && items.map((row) => (
        <Row<T> key={row.id} row={row} columns={columns} clickRow={clickRow} dim={rowDimWhen?.(row) ?? false} hrefFor={hrefFor} />
      ))}
    </>
  );
}

function EmptyState({
  title, description, hasFilters, cta,
}: {
  title: string;
  description?: string;
  hasFilters: boolean;
  cta?: { label: string; href: string };
}) {
  return (
    <div className="rounded-lg border py-12 text-center" style={{ borderColor: PALETTE.border, background: PALETTE.surface }}>
      <p className="text-sm" style={{ color: PALETTE.text }}>
        {hasFilters ? 'No results match the current filters.' : title}
      </p>
      {description && !hasFilters && (
        <p className="mt-1 text-xs" style={{ color: PALETTE.muted }}>{description}</p>
      )}
      {cta && !hasFilters && (
        <a
          href={cta.href}
          className="mt-4 inline-block rounded-md px-3 py-1.5 text-xs font-medium"
          style={{ background: PALETTE.accent, color: PALETTE.bg }}
        >
          {cta.label}
        </a>
      )}
    </div>
  );
}
