'use client';

import { type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PALETTE } from '@/lib/utils/constants';

type TabKey = 'overview' | 'finance' | 'team' | 'documents' | 'comms' | 'activity';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview',   label: 'Overview'   },
  { key: 'finance',    label: 'Finance'    },
  { key: 'team',       label: 'Team'       },
  { key: 'documents',  label: 'Documents'  },
  { key: 'comms',      label: 'Comms'      },
  { key: 'activity',   label: 'Activity'   },
];

const TAB_KEYS = new Set<TabKey>(TABS.map((t) => t.key));

function parseTab(raw: string | null): TabKey {
  if (raw && TAB_KEYS.has(raw as TabKey)) return raw as TabKey;
  return 'overview';
}

export default function BookingTabs({
  overview, finance, team, documents, comms, activity,
}: {
  overview:  ReactNode;
  finance:   ReactNode;
  team:      ReactNode;
  documents: ReactNode;
  comms:     ReactNode;
  activity:  ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Derive directly from URL — no useState. This eliminates state-drift
  // bugs where back/forward navigation or a deep-linked ?tab= reload would
  // leave the active state stale. Audit found the previous useState
  // implementation didn't survive hard-reloads on /bookings/[id]?tab=team.
  const active = parseTab(searchParams.get('tab'));

  function handleTabChange(key: TabKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', key);
    // Use the full pathname rather than a bare query string — the bare
    // form has been observed to drop the path on some Next.js / browser
    // combinations.
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div>
      {/* Tab bar — paper-2 bg strip, sand underline on active */}
      <div
        role="tablist"
        aria-label="Booking sections"
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
            </button>
          );
        })}
      </div>

      {/* Tab panels — all server-rendered, toggled with hidden attribute */}
      <div role="tabpanel" id="tabpanel-overview"  aria-labelledby="tab-overview"  hidden={active !== 'overview'}   className="space-y-6">{overview}</div>
      <div role="tabpanel" id="tabpanel-finance"   aria-labelledby="tab-finance"   hidden={active !== 'finance'}    className="space-y-6">{finance}</div>
      <div role="tabpanel" id="tabpanel-team"      aria-labelledby="tab-team"      hidden={active !== 'team'}       className="space-y-6">{team}</div>
      <div role="tabpanel" id="tabpanel-documents" aria-labelledby="tab-documents" hidden={active !== 'documents'}  className="space-y-6">{documents}</div>
      <div role="tabpanel" id="tabpanel-comms"     aria-labelledby="tab-comms"     hidden={active !== 'comms'}      className="space-y-6">{comms}</div>
      <div role="tabpanel" id="tabpanel-activity"  aria-labelledby="tab-activity"  hidden={active !== 'activity'}   className="space-y-6">{activity}</div>
    </div>
  );
}
