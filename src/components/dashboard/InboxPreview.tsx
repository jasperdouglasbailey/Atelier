import Link from 'next/link';
import type { Approval } from '@/lib/types/database';
import { PALETTE } from '@/lib/utils/constants';
import { humanise } from '@/lib/utils/humanise';
import { formatDateTime } from '@/lib/utils/format';
import SectionCard from '@/components/ui/SectionCard';

/**
 * Last 5 pending approvals — quick glance for the dashboard. Each row is a
 * link to /inbox; the panel header also links there.
 */
export default function InboxPreview({ approvals }: { approvals: Approval[] }) {
  const top = approvals.slice(0, 5);

  return (
    <SectionCard
      title="Inbox"
      meta={`${approvals.length} pending`}
      action={{ label: 'Open inbox', href: '/inbox' }}
    >
      {top.length === 0 ? (
        <p className="text-[11px]" style={{ color: PALETTE.muted }}>
          Nothing pending review.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {top.map((a) => (
            <li key={a.id}>
              <Link
                href="/inbox"
                className="block rounded px-2 py-1.5 transition hover:opacity-80"
                style={{ background: PALETTE.bg }}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] font-medium" style={{ color: PALETTE.accent }}>
                    {humanise(a.agent)}
                  </span>
                  <span className="text-[10px]" style={{ color: PALETTE.muted }}>
                    {humanise(a.action_type)}
                  </span>
                  {a.confidence != null && (
                    <span
                      className="ml-auto text-[10px] tabular-nums"
                      style={{
                        color: a.confidence >= 80 ? PALETTE.success : a.confidence >= 55 ? PALETTE.warning : PALETTE.danger,
                      }}
                    >
                      {a.confidence}%
                    </span>
                  )}
                </div>
                <div className="text-[11px] truncate" style={{ color: PALETTE.text }}>
                  {a.summary}
                </div>
                <div className="text-[10px]" style={{ color: PALETTE.muted }}>
                  {formatDateTime(a.created_at)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
