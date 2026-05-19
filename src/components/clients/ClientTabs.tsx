'use client';

/**
 * Tabbed layout for the client detail page.
 *
 * Mirrors `BookingTabs` exactly — same URL-derived active state (no
 * useState), same paper-2 strip + sand underline visual. Five tabs:
 *
 *   - Details   — identity, ABN, addresses, comms style, payment terms
 *   - Staff     — additional contacts (read-only here; editing lives on the edit page)
 *   - Notes     — long-form notes
 *   - Bookings  — booking history with state chips
 *   - Activity  — audit-log timeline scoped to this client
 *
 * Phase A of the Syngency-inspired clients overhaul (`pure-weaving-piglet`
 * plan). Schema is unchanged in Phase A; tabs only reshape existing data.
 */

import { type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PALETTE } from '@/lib/utils/constants';

type TabKey = 'details' | 'staff' | 'notes' | 'bookings' | 'activity';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'details',  label: 'Details'  },
  { key: 'staff',    label: 'Staff'    },
  { key: 'notes',    label: 'Notes'    },
  { key: 'bookings', label: 'Bookings' },
  { key: 'activity', label: 'Activity' },
];

const TAB_KEYS = new Set<TabKey>(TABS.map((t) => t.key));

function parseTab(raw: string | null): TabKey {
  if (raw && TAB_KEYS.has(raw as TabKey)) return raw as TabKey;
  return 'details';
}

type Props = {
  details: ReactNode;
  staff: ReactNode;
  notes: ReactNode;
  bookings: ReactNode;
  activity: ReactNode;
  /** Optional badge counts shown next to tab labels (e.g. Staff (3)). */
  counts?: Partial<Record<TabKey, number>>;
};

export default function ClientTabs({ details, staff, notes, bookings, activity, counts }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = parseTab(searchParams.get('tab'));

  function handleTabChange(key: TabKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Client sections"
        className="flex gap-0 mb-6 border-b"
        style={{
          borderColor: PALETTE.border,
          background: 'var(--p-surface)',
          marginLeft: -16,
          marginRight: -16,
          paddingLeft: 16,
          paddingRight: 16,
        }}
      >
        {TABS.map(({ key, label }) => {
          const isActive = active === key;
          const count = counts?.[key];
          return (
            <button
              key={key}
              type="button"
              role="tab"
              id={`tab-${key}`}
              aria-controls={`tabpanel-${key}`}
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => handleTabChange(key)}
              className="uppercase transition-colors"
              style={{
                fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
                fontWeight: isActive ? 600 : 400,
                fontSize: 11,
                letterSpacing: '0.06em',
                color: isActive ? PALETTE.text : PALETTE.muted,
                borderBottom: isActive ? `2px solid ${PALETTE.accent}` : '2px solid transparent',
                marginBottom: '-1px',
                background: 'none',
                cursor: 'pointer',
                padding: '0.625rem 1rem',
              }}
            >
              {label}
              {typeof count === 'number' && count > 0 && (
                <span style={{ marginLeft: 6, opacity: 0.7 }}>({count})</span>
              )}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id="tabpanel-details"  aria-labelledby="tab-details"  hidden={active !== 'details'}  className="space-y-4">{details}</div>
      <div role="tabpanel" id="tabpanel-staff"    aria-labelledby="tab-staff"    hidden={active !== 'staff'}    className="space-y-4">{staff}</div>
      <div role="tabpanel" id="tabpanel-notes"    aria-labelledby="tab-notes"    hidden={active !== 'notes'}    className="space-y-4">{notes}</div>
      <div role="tabpanel" id="tabpanel-bookings" aria-labelledby="tab-bookings" hidden={active !== 'bookings'} className="space-y-4">{bookings}</div>
      <div role="tabpanel" id="tabpanel-activity" aria-labelledby="tab-activity" hidden={active !== 'activity'} className="space-y-4">{activity}</div>
    </div>
  );
}
