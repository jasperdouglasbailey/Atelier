'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { approveAction, rejectAction } from '@/app/actions/approvals';
import type { Approval } from '@/lib/types/database';
import { PALETTE } from '@/lib/utils/constants';
import { formatDateTime } from '@/lib/utils/format';

type Props = { approvals: Approval[] };

const statusColors: Record<string, string> = {
  pending: PALETTE.warning,
  approved: PALETTE.success,
  rejected: PALETTE.danger,
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
        Nothing in the queue. When agents draft actions, they'll appear here for your approval.
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
                  {a.agent.replace(/_/g, ' ')}
                </span>
                <span className="text-[10px]" style={{ color: PALETTE.muted }}>
                  {a.action_type.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="mt-1.5 text-sm" style={{ color: PALETTE.text }}>{a.summary}</p>

              {/* Confidence & uncertainty */}
              {a.confidence != null && (
                <div className="mt-2 flex items-center gap-3 text-[11px]" style={{ color: PALETTE.muted }}>
                  <span>Confidence: {a.confidence}%</span>
                  {a.uncertainty_sources && a.uncertainty_sources.length > 0 && (
                    <span>Uncertainty: {a.uncertainty_sources.join(', ')}</span>
                  )}
                </div>
              )}

              {/* Precedents */}
              {a.precedent_refs && a.precedent_refs.length > 0 && (
                <div className="mt-1 text-[11px]" style={{ color: PALETTE.muted }}>
                  Precedent: {a.precedent_refs.join(', ')}
                </div>
              )}

              {/* Draft content preview */}
              <details className="mt-2">
                <summary className="cursor-pointer text-[11px]" style={{ color: PALETTE.muted }}>
                  View draft content
                </summary>
                <pre className="mt-1 max-h-40 overflow-auto rounded-md p-2 text-[11px]" style={{ background: PALETTE.bg, color: PALETTE.muted }}>
                  {JSON.stringify(a.draft_content, null, 2)}
                </pre>
              </details>

              {/* Rejection reason */}
              {a.rejection_reason && (
                <div className="mt-2 text-xs" style={{ color: PALETTE.danger }}>
                  Rejected: {a.rejection_reason}
                </div>
              )}

              <div className="mt-2 text-[10px]" style={{ color: '#6b7186' }}>
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
