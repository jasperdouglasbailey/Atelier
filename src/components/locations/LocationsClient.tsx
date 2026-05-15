'use client';

import dynamic from 'next/dynamic';
import { PALETTE } from '@/lib/utils/constants';
import { FACILITY_OPTIONS } from './LocationForm';
import DenseListTable, { type Column, type Filter, type GroupBy } from '@/components/ui/DenseListTable';
import type { Location, StudioType } from '@/lib/types/database';

// Lazy-load the map — Leaflet touches window directly so SSR must be off,
// and the ~120KB leaflet bundle only ships when /locations is opened.
const LocationsMap = dynamic(() => import('./LocationsMap'), {
  ssr: false,
  loading: () => (
    <div
      className="rounded-lg border flex items-center justify-center"
      style={{ background: PALETTE.surface, borderColor: PALETTE.border, height: 420 }}
    >
      <span style={{ color: PALETTE.muted, fontSize: 12 }}>Loading map…</span>
    </div>
  ),
});

const STUDIO_TYPE_LABELS: Record<StudioType, string> = {
  photo_studio: 'Photo Studio',
  film_studio: 'Film Studio',
  outdoor: 'Outdoor',
  retail: 'Retail',
  residential: 'Residential',
  venue: 'Venue',
  other: 'Other',
};

function formatRate(half: number | null, full: number | null) {
  if (!half && !full) return null;
  if (half && full) return `$${half.toLocaleString()} / $${full.toLocaleString()}`;
  if (half) return `$${half.toLocaleString()} half`;
  return `$${full!.toLocaleString()} full`;
}

type Props = { locations: Location[] };

export default function LocationsClient({ locations }: Props) {
  // Surface only facility filters that are actually used by some location.
  const usedFacilities = new Set<string>();
  for (const loc of locations) for (const f of loc.facilities ?? []) usedFacilities.add(f);
  const facilityOptions = FACILITY_OPTIONS.filter((f) => usedFacilities.has(f.value));

  const columns: Column<Location>[] = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      sortValue: (l) => l.name?.toLowerCase() ?? '',
      width: 'minmax(220px, 1.5fr)',
      render: (l) => (
        <div className="min-w-0">
          <div className="font-medium truncate" style={{ color: PALETTE.text }}>{l.name}</div>
          {l.alias && (
            <div className="text-[11px] truncate" style={{ color: PALETTE.muted }}>{l.alias}</div>
          )}
        </div>
      ),
    },
    {
      key: 'type',
      label: 'Type',
      sortable: true,
      sortValue: (l) => l.studio_type,
      width: '140px',
      render: (l) => (
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{ background: `${PALETTE.accent}18`, color: PALETTE.accent }}
        >
          {STUDIO_TYPE_LABELS[l.studio_type]}
        </span>
      ),
    },
    {
      key: 'location',
      label: 'Where',
      hideBelow: 'md',
      width: 'minmax(160px, 1fr)',
      render: (l) => (
        <span className="truncate block" style={{ color: PALETTE.muted }}>
          {l.suburb ? `${l.suburb}${l.state ? `, ${l.state}` : ''}` : l.address ?? '—'}
        </span>
      ),
    },
    {
      key: 'rate',
      label: 'Rate (½ / full)',
      sortable: true,
      sortValue: (l) => l.full_day_rate ?? l.half_day_rate ?? 0,
      hideBelow: 'md',
      width: '160px',
      align: 'right',
      render: (l) => {
        const rate = formatRate(l.half_day_rate, l.full_day_rate);
        return rate
          ? <span className="tabular-nums" style={{ color: PALETTE.text }}>{rate}</span>
          : <span style={{ color: PALETTE.muted }}>—</span>;
      },
    },
    {
      key: 'rooms',
      label: 'Rooms',
      hideBelow: 'lg',
      width: '80px',
      align: 'right',
      sortable: true,
      sortValue: (l) => l.studio_rooms?.length ?? 0,
      render: (l) => l.studio_rooms?.length
        ? <span style={{ color: PALETTE.text }}>{l.studio_rooms.length}</span>
        : <span style={{ color: PALETTE.muted }}>—</span>,
    },
    {
      key: 'contact',
      label: 'Contact',
      hideBelow: 'lg',
      width: '160px',
      render: (l) => <span className="truncate block" style={{ color: PALETTE.muted }}>{l.contact_name ?? '—'}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      width: '130px',
      align: 'right',
      render: (l) => (
        <div className="flex items-center justify-end gap-1">
          {l.drive_folder_link && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ background: `${PALETTE.success}18`, color: PALETTE.success }}
            >
              Drive
            </span>
          )}
          {!l.is_active && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ background: `${PALETTE.muted}22`, color: PALETTE.muted }}
            >
              Inactive
            </span>
          )}
        </div>
      ),
    },
  ];

  const filters: Filter<Location>[] = [
    {
      kind: 'search',
      key: 'q',
      placeholder: 'Search by name, suburb, alias…',
      predicate: (l, q) => {
        const needle = q.toLowerCase().trim();
        if (!needle) return true;
        const hay = [l.name, l.alias, l.suburb, l.address, l.state]
          .filter(Boolean).join(' ').toLowerCase();
        return hay.includes(needle);
      },
    },
    {
      kind: 'select',
      key: 'type',
      label: 'All types',
      options: Object.entries(STUDIO_TYPE_LABELS).map(([k, v]) => ({ value: k, label: v })),
      predicate: (l, v) => l.studio_type === v,
    },
    ...(facilityOptions.length > 0 ? [{
      kind: 'select' as const,
      key: 'facility',
      label: 'Any facility',
      options: facilityOptions.map((f) => ({ value: f.value, label: f.label })),
      predicate: (l: Location, v: string) => (l.facilities ?? []).includes(v),
    }] : []),
    {
      kind: 'select',
      key: 'active',
      label: 'Active only',
      options: [
        { value: 'active', label: 'Active only' },
        { value: 'inactive', label: 'Inactive only' },
      ],
      predicate: (l, v) => v === 'active' ? l.is_active : !l.is_active,
      defaultValue: 'active',
    },
  ];

  const groupBy: GroupBy<Location> = {
    getValue: (l) => l.studio_type,
    labelFor: (k) => STUDIO_TYPE_LABELS[k as StudioType] ?? k,
    persistKey: 'locations',
    enabledByDefault: false,
    toggleHeader: 'Group by type',
  };

  const withoutCoords = locations.filter((l) => l.latitude == null || l.longitude == null).length;
  const withCoords = locations.length - withoutCoords;

  return (
    <div className="space-y-4">
      <div>
        <LocationsMap locations={locations} />
        <div className="mt-1.5 px-1 flex items-center justify-between text-[11px]" style={{ color: PALETTE.muted }}>
          <span>
            {withCoords} of {locations.length} location{locations.length === 1 ? '' : 's'} on the map
            {withoutCoords > 0 && (
              <> · {withoutCoords} without coordinates (add an address to plot)</>
            )}
          </span>
          <span style={{ color: PALETTE.muted, opacity: 0.7 }}>
            Hover for details · click a dot to open
          </span>
        </div>
      </div>

      <DenseListTable<Location>
        rows={locations}
        columns={columns}
        filters={filters}
        hrefFor={(l) => `/locations/${l.id}`}
        groupBy={groupBy}
        rowDimWhen={(l) => !l.is_active}
        emptyTitle="No locations yet."
        emptyDescription="Add studios, outdoor spaces, and venues to pre-fill booking forms."
        emptyCta={{ label: 'Add first location', href: '/locations/new' }}
        countLabel={(n) => `${n} location${n !== 1 ? 's' : ''}`}
      />
    </div>
  );
}
