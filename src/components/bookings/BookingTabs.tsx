'use client';

import { useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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

const TAB_KEYS = new Set(TABS.map((t) => t.key));

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
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab');
  const [active, setActive] = useState<TabKey>(
    initialTab && TAB_KEYS.has(initialTab as TabKey) ? (initialTab as TabKey) : 'overview',
  );

  function handleTabChange(key: TabKey) {
    setActive(key);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', key);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div>
      {/* Tab bar — paper-2 bg strip, sand underline on active */}
      <div
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
      <div hidden={active !== 'overview'}   className="space-y-6">{overview}</div>
      <div hidden={active !== 'finance'}    className="space-y-6">{finance}</div>
      <div hidden={active !== 'team'}       className="space-y-6">{team}</div>
      <div hidden={active !== 'documents'}  className="space-y-6">{documents}</div>
      <div hidden={active !== 'comms'}      className="space-y-6">{comms}</div>
      <div hidden={active !== 'activity'}   className="space-y-6">{activity}</div>
    </div>
  );
}
