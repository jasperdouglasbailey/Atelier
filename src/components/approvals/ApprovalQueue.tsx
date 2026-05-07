'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { approveAction, rejectAction } from '@/app/actions/approvals';
import type { Approval } from '@/lib/types/database';
import { PALETTE } from '@/lib/utils/constants';
import { formatDateTime } from '@/lib/utils/format';
import { humanise } from '@/lib/utils/humanise';

type Props = { approvals: Approval[] };

const statusColors: Record<string, string> = {
  pending: PALETTE.warning,
  approved: PALETTE.success,
  rejected: PALETTE.danger,
  expired:  PALETTE.muted,
};

export default function ApprovalQueue({ approvals }: Props) {
  const router = useRouter();
  const [acting, setActing] = useState<string | null>(null);

  async function handleApprove(id: string) {
    setActing(id);
    await approveAction(id);
    router.refresh();
    setActing(null);
  }

  async function handleReject(id: string) {
    const reason = prompt('Rejection reason (optional):');
    setActing(id);
    await rejectAction(id, reason ?? undefined);
    router.refresh();
    setActing(null);
  }

  if (approvals.length === 0) {
    return (
      <div className="py-12 text-center text-sm" style={{ color: PALETTE.muted }}>
        Nothing in the queue. When agents draft actions, they&apos;ll appear here for your approval.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {approvals.map((a) => (
        <div
          key={a.id}
          className="rounded-lg border p-4"
          style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                  style={{ background: `${statusColors[a.status]}22`, color: statusColors[a.status] }}
                >
                  {a.status}
                </span>
                <span className="text-xs font-medium" style={{ color: PALETTE.accent }}>
                  {humanise(a.agent)}
                </span>
                <span className="text-[10px]" style={{ color: PALETTE.muted }}>
                  {humanise(a.action_type)}
                </span>
              </div>
              <p className="mt-1.5 text-sm" style={{ color: PALETTE.text }}>{a.summary}</p>

              {/* Confidence bar + uncertainty */}
              {a.confidence != null && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="relative h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: PALETTE.border }}>
                      <div
                        className="absolute left-0 top-0 h-full rounded-full transition-all"
                        style={{
                          width: `${a.confidence}%`,
                          background: a.confidence >= 80 ? PALETTE.success : a.confidence >= 55 ? PALETTE.warning : PALETTE.danger,
                        }}
                      />
                    </div>
                    <span className="flex-shrink-0 text-[10px] tabular-nums" style={{ color: PALETTE.muted }}>
                      {a.confidence}% confidence
                    </span>
                  </div>
                  {a.uncertainty_sources && a.uncertainty_sources.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {a.uncertainty_sources.map((s, i) => (
                        <span
                          key={i}
                          className="rounded px-1.5 py-0.5 text-[10px]"
                          style={{ background: `${PALETTE.warning}22`, color: PALETTE.warning }}
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Precedents */}
              {a.precedent_refs && a.precedent_refs.length > 0 && (
                <div className="mt-1 text-[11px]" style={{ color: PALETTE.muted }}>
                  Precedent: {a.precedent_refs.join(', ')}
                </div>
              )}

              {/* Draft content preview — pretty-print known action types */}
              <DraftPreview actionType={a.action_type} content={a.draft_content as unknown as Record<string, unknown> | null} />

              {/* Rejection reason */}
              {a.rejection_reason && (
                <div className="mt-2 text-xs" style={{ color: PALETTE.danger }}>
                  Rejected: {a.rejection_reason}
                </div>
              )}

              <div className="mt-2 text-[10px]" style={{ color: '#6b6b6b' }}>
                {formatDateTime(a.created_at)}
                {a.decided_at && ` · Decided ${formatDateTime(a.decided_at)}`}
              </div>
            </div>

            {/* Action buttons */}
            {a.status === 'pending' && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => handleApprove(a.id)}
                  disabled={acting === a.id}
                  className="rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                  style={{ background: PALETTE.success, color: PALETTE.bg }}
                >
                  Approve
                </button>
                <button
                  onClick={() => handleReject(a.id)}
                  disabled={acting === a.id}
                  className="rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                  style={{ borderColor: PALETTE.danger, color: PALETTE.danger }}
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

type DraftContent = Record<string, unknown> | null;

function DraftPreview({ actionType, content }: { actionType: string; content: DraftContent }) {
  if (actionType === 'crew_hold_request' && content) {
    const email = content.email as { to?: string; subject?: string; body?: string } | undefined;
    if (email) {
      return (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px]" style={{ color: PALETTE.muted }}>
            View email draft
          </summary>
          <div
            className="mt-2 rounded-md border p-3 text-[11px]"
            style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
          >
            <div className="mb-2 space-y-0.5 border-b pb-2" style={{ borderColor: PALETTE.border }}>
              <div><span style={{ color: PALETTE.muted }}>To:</span> {email.to ?? '— no email on file —'}</div>
              <div><span style={{ color: PALETTE.muted }}>Subject:</span> {email.subject}</div>
            </div>
            <pre
              className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed"
              style={{ color: PALETTE.text }}
            >{email.body}</pre>
          </div>
        </details>
      );
    }
  }
  // Fallback — JSON
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-[11px]" style={{ color: PALETTE.muted }}>
        View draft content
      </summary>
      <pre className="mt-1 max-h-40 overflow-auto rounded-md p-2 text-[11px]" style={{ background: PALETTE.bg, color: PALETTE.muted }}>
        {JSON.stringify(content, null, 2)}
      </pre>
    </details>
  );
}
