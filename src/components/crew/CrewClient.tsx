'use client';

import { PALETTE, CREW_TIER_LABELS, CREW_ROLES } from '@/lib/utils/constants';
import { humanise } from '@/lib/utils/humanise';
import { orderCityKeys, NO_CITY_KEY } from '@/lib/utils/city-order';
import DenseListTable, { type Column, type Filter, type GroupBy } from '@/components/ui/DenseListTable';
import type { Crew } from '@/lib/types/database';

type Props = {
  allCrew: Crew[];
  defaultGroupByCity: boolean;
  cities: string[];
};

const RATE_BANDS: { value: string; label: string; min: number | null; max: number | null }[] = [
  { value: 'lt500',   label: 'Under $500',  min: null, max: 499 },
  { value: '500-800', label: '$500–$800',   min: 500, max: 800 },
  { value: '800-1200',label: '$800–$1200',  min: 801, max: 1200 },
  { value: 'gt1200',  label: '$1200+',      min: 1201, max: null },
];

const tierColor = (tier: string) => {
  if (tier === 'preferred_core') return PALETTE.success;
  if (tier === 'never_again') return PALETTE.danger;
  return PALETTE.muted;
};

export default function CrewClient({ allCrew, defaultGroupByCity, cities }: Props) {
  const columns: Column<Crew>[] = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      sortValue: (c) => c.name?.toLowerCase() ?? '',
      width: 'minmax(220px, 1.5fr)',
      render: (c) => (
        <div className="min-w-0">
          <div className="font-medium truncate" style={{ color: PALETTE.text }}>{c.name}</div>
          {c.primary_role && (
            <div className="text-[11px] truncate" style={{ color: PALETTE.accent }}>
              {[c.primary_role, ...(c.secondary_roles ?? [])].map(humanise).join(' / ')}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'city',
      label: 'City',
      sortable: true,
      sortValue: (c) => c.city ?? '',
      hideBelow: 'md',
      width: '140px',
      render: (c) => <span style={{ color: PALETTE.muted }}>{c.city ?? '—'}</span>,
    },
    {
      key: 'tier',
      label: 'Tier',
      sortable: true,
      sortValue: (c) => c.tier,
      hideBelow: 'sm',
      width: '140px',
      render: (c) => (
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{ background: `${tierColor(c.tier)}22`, color: tierColor(c.tier) }}
        >
          {CREW_TIER_LABELS[c.tier]}
        </span>
      ),
    },
    {
      key: 'email',
      label: 'Email',
      hideBelow: 'lg',
      width: 'minmax(180px, 1fr)',
      render: (c) => <span className="truncate block" style={{ color: PALETTE.muted }}>{c.email ?? '—'}</span>,
    },
    {
      key: 'mobile',
      label: 'Mobile',
      hideBelow: 'lg',
      width: '140px',
      render: (c) => <span style={{ color: PALETTE.muted }}>{c.mobile ?? '—'}</span>,
    },
    {
      key: 'rate',
      label: 'Day rate',
      sortable: true,
      sortValue: (c) => c.default_day_rate ?? 0,
      hideBelow: 'md',
      width: '100px',
      align: 'right',
      render: (c) => c.default_day_rate
        ? <span className="tabular-nums" style={{ color: PALETTE.text }}>${c.default_day_rate.toLocaleString()}</span>
        : <span style={{ color: PALETTE.muted }}>—</span>,
    },
    {
      key: 'status',
      label: 'Status',
      width: '160px',
      render: (c) => (
        <div className="flex flex-wrap items-center justify-end gap-1">
          {!c.onboarding_completed && (
            <Chip text="Onboarding" color={PALETTE.warning} />
          )}
          {c.gst_registered && (
            <Chip text="GST" color={PALETTE.muted} />
          )}
          {c.dietary && c.dietary.toUpperCase() !== 'NIL' && c.dietary.toUpperCase() !== 'NIL DIET' && (
            <Chip text="Diet" color={PALETTE.muted} />
          )}
        </div>
      ),
      align: 'right',
    },
  ];

  const filters: Filter<Crew>[] = [
    {
      kind: 'search',
      key: 'q',
      placeholder: 'Search by name, role, email, city…',
      predicate: (c, q) => {
        const needle = q.toLowerCase().trim();
        if (!needle) return true;
        const hay = [c.name, c.primary_role, ...(c.secondary_roles ?? []), c.email, c.city]
          .filter(Boolean).join(' ').toLowerCase();
        return hay.includes(needle);
      },
    },
    {
      kind: 'select',
      key: 'city',
      label: 'All cities',
      options: cities.map((c) => ({ value: c, label: c })),
      predicate: (c, v) => c.city === v,
    },
    {
      kind: 'select',
      key: 'tier',
      label: 'All tiers',
      options: Object.entries(CREW_TIER_LABELS).map(([k, v]) => ({ value: k, label: v })),
      predicate: (c, v) => c.tier === v,
    },
    {
      kind: 'select',
      key: 'role',
      label: 'All roles',
      options: CREW_ROLES.map((r) => ({ value: r, label: humanise(r) })),
      predicate: (c, v) => [c.primary_role, ...(c.secondary_roles ?? [])].includes(v as Crew['primary_role']),
    },
    {
      kind: 'select',
      key: 'rate',
      label: 'Any rate',
      options: RATE_BANDS.map((b) => ({ value: b.value, label: b.label })),
      predicate: (c, v) => {
        const band = RATE_BANDS.find((b) => b.value === v);
        if (!band) return true;
        const rate = c.default_day_rate ?? 0;
        if (band.min !== null && rate < band.min) return false;
        if (band.max !== null && rate > band.max) return false;
        return true;
      },
    },
  ];

  const hasAnyCity = allCrew.some((c) => Boolean(c.city));
  const groupBy: GroupBy<Crew> | undefined = hasAnyCity ? {
    getValue: (c) => c.city ?? NO_CITY_KEY,
    labelFor: (k) => k === NO_CITY_KEY ? 'No city set' : k,
    orderKeys: (entries) => orderCityKeys(entries),
    persistKey: 'crew',
    enabledByDefault: defaultGroupByCity,
    toggleHeader: 'Group by city',
  } : undefined;

  return (
    <DenseListTable<Crew>
      rows={allCrew}
      columns={columns}
      filters={filters}
      hrefFor={(c) => `/crew/${c.id}`}
      groupBy={groupBy}
      emptyTitle="No crew yet."
      emptyDescription="Add your first crew member to get started."
      countLabel={(n) => `${n} crew member${n !== 1 ? 's' : ''}`}
    />
  );
}

function Chip({ text, color }: { text: string; color: string }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ background: `${color}22`, color }}
    >
      {text}
    </span>
  );
}
