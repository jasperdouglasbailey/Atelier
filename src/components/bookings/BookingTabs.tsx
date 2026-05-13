'use client';

import { useState, type ReactNode } from 'react';
import { PALETTE } from '@/lib/utils/constants';

type TabKey = 'overview' | 'team' | 'documents' | 'comms' | 'activity';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview',   label: 'Overview'   },
  { key: 'team',       label: 'Team'       },
  { key: 'documents',  label: 'Documents'  },
  { key: 'comms',      label: 'Comms'      },
  { key: 'activity',   label: 'Activity'   },
];

export default function BookingTabs({
  overview, team, documents, comms, activity,
}: {
  overview: ReactNode;
  team: ReactNode;
  documents: ReactNode;
  comms: ReactNode;
  activity: ReactNode;
}) {
  const [active, setActive] = useState<TabKey>('overview');

  return (
    <div>
      {/* Tab bar */}
      <div
        className="flex gap-1 mb-6 border-b"
        style={{ borderColor: PALETTE.border }}
      >
        {TABS.map(({ key, label }) => {
          const isActive = active === key;
          return (
            <button
              key={key}
              onClick={() => setActive(key)}
              className="text-sm font-medium transition-colors"
              style={{
                color: isActive ? PALETTE.accent : PALETTE.muted,
                borderBottom: isActive ? `2px solid ${PALETTE.accent}` : '2px solid transparent',
                marginBottom: '-1px',
                background: 'none',
                cursor: 'pointer',
                padding: '0.5rem 1rem',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Tab panels — all server-rendered, toggled with hidden attribute */}
      <div hidden={active !== 'overview'}  className="space-y-6">{overview}</div>
      <div hidden={active !== 'team'}      className="space-y-6">{team}</div>
      <div hidden={active !== 'documents'} className="space-y-6">{documents}</div>
      <div hidden={active !== 'comms'}     className="space-y-6">{comms}</div>
      <div hidden={active !== 'activity'}  className="space-y-6">{activity}</div>
    </div>
  );
}
