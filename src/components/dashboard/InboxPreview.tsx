import Link from 'next/link';
import type { Approval } from '@/lib/types/database';
import { PALETTE } from '@/lib/utils/constants';
import { humanise } from '@/lib/utils/humanise';
import { formatDateTime } from '@/lib/utils/format';
import SectionCard from '@/components/ui/SectionCard';

type PotentialBrief = {
  id: string;
  subject: string;
  from: string;
};

/**
 * Last pending approvals + potential brief candidates from Gmail.
 *
 * Two sources of inbox-worthy items shown together:
 *   - Top: up to 5 pending approvals (the canonical inbox queue)
 *   - Bottom: up to 3 potential briefs (Gmail messages that look like
 *     creative briefs and haven't been converted/dismissed yet)
 *
 * Header meta surfaces both counts at a glance. Whole panel links
 * through to /inbox; each row also links to /inbox.
 */
export default function InboxPreview({
  approvals,
  potentialBriefs = [],
  className,
}: {
  approvals: Approval[];
  potentialBriefs?: PotentialBrief[];
  className?: string;
}) {
  const top = approvals.slice(0, 5);
  const briefs = potentialBriefs.slice(0, 3);

  const metaParts: string[] = [];
  metaParts.push(`${approvals.length} pending`);
  if (potentialBriefs.length > 0) {
    metaParts.push(`${potentialBriefs.length} brief${potentialBriefs.length === 1 ? '' : 's'} to triage`);
  }

  return (
    <SectionCard
      title="Inbox"
      meta={metaParts.join(' · ')}
      action={{ label: 'Open inbox', href: '/inbox' }}
      className={className}
    >
      {top.length === 0 && briefs.length === 0 ? (
        <p className="text-[11px]" style={{ color: PALETTE.muted }}>
          Nothing pending review.
        </p>
      ) : (
        <div className="space-y-3">
          {top.length > 0 && (
            <div>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>
                Pending approvals
              </div>
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
            </div>
          )}

          {briefs.length > 0 && (
            <div>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>
                Potential briefs ({potentialBriefs.length})
              </div>
              <ul className="space-y-1.5">
                {briefs.map((b) => {
                  const fromName = b.from.replace(/<.*>/, '').trim() || b.from;
                  return (
                    <li key={b.id}>
                      <Link
                        href="/inbox"
                        className="block rounded border-l-2 px-2 py-1.5 transition hover:opacity-80"
                        style={{ background: `${PALETTE.accent}06`, borderColor: PALETTE.accent }}
                      >
                        <div className="text-[11px] truncate font-medium" style={{ color: PALETTE.text }}>
                          {b.subject || '(no subject)'}
                        </div>
                        <div className="text-[10px] truncate" style={{ color: PALETTE.muted }}>
                          from {fromName}
                        </div>
                      </Link>
                    </li>
                  );
                })}
                {potentialBriefs.length > 3 && (
                  <li className="px-2 text-[10px]" style={{ color: PALETTE.muted }}>
                    + {potentialBriefs.length - 3} more in inbox
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
