'use client';

import { PALETTE, ARTIST_DISCIPLINE_LABELS } from '@/lib/utils/constants';
import { orderCityKeys, NO_CITY_KEY } from '@/lib/utils/city-order';
import DenseListTable, { type Column, type Filter, type GroupBy } from '@/components/ui/DenseListTable';
import type { Talent, ArtistDiscipline } from '@/lib/types/database';

type Props = {
  allTalent: Talent[];
  defaultGroupByCity: boolean;
};

export default function TalentClient({ allTalent, defaultGroupByCity }: Props) {
  const columns: Column<Talent>[] = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      sortValue: (t) => t.working_name?.toLowerCase() ?? '',
      width: 'minmax(220px, 1.4fr)',
      render: (t) => (
        <div className="min-w-0">
          <div className="font-medium truncate" style={{ color: PALETTE.text }}>{t.working_name}</div>
          <div className="text-[11px] truncate" style={{ color: PALETTE.muted }}>
            {ARTIST_DISCIPLINE_LABELS[t.discipline as ArtistDiscipline] ?? t.discipline}
            {t.specialty ? ` · ${t.specialty}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'city',
      label: 'City',
      sortable: true,
      sortValue: (t) => t.city ?? '',
      hideBelow: 'md',
      width: '140px',
      render: (t) => <span style={{ color: PALETTE.muted }}>{t.city ?? '—'}</span>,
    },
    {
      key: 'email',
      label: 'Email',
      hideBelow: 'lg',
      width: 'minmax(180px, 1fr)',
      render: (t) => <span className="truncate block" style={{ color: PALETTE.muted }}>{t.email ?? '—'}</span>,
    },
    {
      key: 'mobile',
      label: 'Mobile',
      hideBelow: 'lg',
      width: '140px',
      render: (t) => <span style={{ color: PALETTE.muted }}>{t.mobile ?? '—'}</span>,
    },
    {
      key: 'instagram',
      label: 'Instagram',
      hideBelow: 'lg',
      width: '140px',
      render: (t) => t.instagram
        ? <span style={{ color: PALETTE.muted }}>@{t.instagram}</span>
        : <span style={{ color: PALETTE.muted }}>—</span>,
    },
    {
      key: 'rate',
      label: 'Day rate',
      sortable: true,
      sortValue: (t) => t.default_day_rate ?? 0,
      hideBelow: 'md',
      width: '100px',
      align: 'right',
      render: (t) => t.default_day_rate
        ? <span className="tabular-nums" style={{ color: PALETTE.text }}>${t.default_day_rate.toLocaleString()}</span>
        : <span style={{ color: PALETTE.muted }}>—</span>,
    },
    {
      key: 'status',
      label: 'Status',
      width: '180px',
      render: (t) => (
        <div className="flex flex-wrap items-center justify-end gap-1">
          {!t.is_active && (
            <Chip text="Inactive" color={PALETTE.danger} />
          )}
          {t.representation_status === 'exclusive' && (
            <Chip text="Exclusive" color={PALETTE.accent} />
          )}
          {!t.onboarding_completed && (
            <Chip text="Onboarding" color={PALETTE.warning} />
          )}
          {t.gst_registered && (
            <Chip text="GST" color={PALETTE.muted} />
          )}
        </div>
      ),
      align: 'right',
    },
  ];

  const filters: Filter<Talent>[] = [
    {
      kind: 'search',
      key: 'q',
      placeholder: 'Search by name, specialty, email, city…',
      predicate: (t, q) => {
        const needle = q.toLowerCase().trim();
        if (!needle) return true;
        const hay = [t.working_name, t.legal_name, t.specialty, t.email, t.city, t.instagram]
          .filter(Boolean).join(' ').toLowerCase();
        return hay.includes(needle);
      },
    },
    {
      kind: 'select',
      key: 'discipline',
      label: 'All disciplines',
      options: Object.entries(ARTIST_DISCIPLINE_LABELS).map(([k, v]) => ({ value: k, label: v })),
      predicate: (t, v) => t.discipline === v,
    },
  ];

  const hasAnyCity = allTalent.some((t) => Boolean(t.city));
  const groupBy: GroupBy<Talent> | undefined = hasAnyCity ? {
    getValue: (t) => t.city ?? NO_CITY_KEY,
    labelFor: (k) => k === NO_CITY_KEY ? 'No city set' : k,
    orderKeys: (entries) => orderCityKeys(entries),
    persistKey: 'talent',
    enabledByDefault: defaultGroupByCity,
    toggleHeader: 'Group by city',
  } : undefined;

  return (
    <DenseListTable<Talent>
      rows={allTalent}
      columns={columns}
      filters={filters}
      hrefFor={(t) => `/talent/${t.id}`}
      groupBy={groupBy}
      rowDimWhen={(t) => !t.is_active}
      emptyTitle="No talent yet."
      emptyDescription="Add your first artist to get started."
      countLabel={(n) => `${n} artist${n !== 1 ? 's' : ''}`}
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
