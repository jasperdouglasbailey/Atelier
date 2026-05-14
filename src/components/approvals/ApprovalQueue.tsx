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

type PageWarning = { message: string; summary: string };

export default function ApprovalQueue({ approvals }: Props) {
  const router = useRouter();
  const [acting, setActing] = useState<string | null>(null);
  const [pageWarning, setPageWarning] = useState<PageWarning | null>(null);

  async function handleApprove(id: string) {
    setActing(id);
    setPageWarning(null);
    const approval = approvals.find((a) => a.id === id);
    const result = await approveAction(id);
    if (result && 'effectWarning' in result && result.effectWarning) {
      // Lift warning to component level — the card disappears from the pending
      // filter after router.refresh(), so per-card state would vanish unseen.
      setPageWarning({ message: result.effectWarning as string, summary: approval?.summary ?? '' });
    }
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

  return (
    <div className="space-y-3">
      {/* Page-level effect warning — survives the pending-filter refresh that removes the card */}
      {pageWarning && (
        <div
          className="flex items-start justify-between gap-3 rounded-lg border-l-2 px-3 py-2.5 text-xs"
          style={{ borderColor: PALETTE.warning, background: `${PALETTE.warning}11`, color: PALETTE.text }}
        >
          <div>
            <div className="font-semibold mb-0.5" style={{ color: PALETTE.warning }}>Action approved — but email not sent</div>
            {pageWarning.summary && (
              <div className="text-[11px] mb-1" style={{ color: PALETTE.muted }}>{pageWarning.summary}</div>
            )}
            <div className="text-[11px]" style={{ color: PALETTE.warning }}>{pageWarning.message}</div>
          </div>
          <button
            onClick={() => setPageWarning(null)}
            className="flex-shrink-0 text-xs leading-none"
            style={{ color: PALETTE.muted }}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {approvals.length === 0 && !pageWarning ? (
        <div className="py-12 text-center text-sm" style={{ color: PALETTE.muted }}>
          Nothing in the queue. When agents draft actions, they&apos;ll appear here for your approval.
        </div>
      ) : approvals.length === 0 ? null : (
        approvals.map((a) => (
          <div
            key={a.id}
            className="rounded-lg border p-4"
            style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
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
                {/* Recipient hint for email approvals — visible without expanding the draft */}
                {(EMAIL_ACTION_TYPES.has(a.action_type) || a.action_type === 'crew_hold_request') && (() => {
                  const c = a.draft_content as Record<string, unknown> | null;
                  let to: string | null = null;
                  if (c && Array.isArray(c.to)) to = (c.to as string[]).join(', ');
                  else if (c && typeof c.email === 'object' && c.email !== null && typeof (c.email as Record<string, unknown>).to === 'string') {
                    to = (c.email as Record<string, unknown>).to as string;
                  }
                  return to ? (
                    <div className="mt-0.5 text-[10px]" style={{ color: PALETTE.muted }}>To: {to}</div>
                  ) : null;
                })()}
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

                <div className="mt-2 text-[10px]" style={{ color: PALETTE.muted }}>
                  {formatDateTime(a.created_at)}
                  {a.decided_at && ` · Decided ${formatDateTime(a.decided_at)}`}
                </div>
              </div>

              {/* Action buttons — row on mobile, col on desktop */}
              {a.status === 'pending' && (
                <div className="flex flex-row gap-2 sm:flex-col">
                  <button
                    onClick={() => handleApprove(a.id)}
                    disabled={acting === a.id}
                    className="flex-1 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50 sm:flex-none"
                    style={{ background: PALETTE.success, color: PALETTE.bg }}
                  >
                    {acting === a.id ? '…' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleReject(a.id)}
                    disabled={acting === a.id}
                    className="flex-1 rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50 sm:flex-none"
                    style={{ borderColor: PALETTE.danger, color: PALETTE.danger }}
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

type DraftContent = Record<string, unknown> | null;

type EmailContent = { to: string[]; subject: string; body: string };
function asEmailContent(c: DraftContent): EmailContent | null {
  if (!c || typeof c !== 'object') return null;
  const { to, subject, body } = c as Record<string, unknown>;
  if (!Array.isArray(to) || typeof subject !== 'string' || typeof body !== 'string') return null;
  return { to: to as string[], subject, body };
}

const EMAIL_ACTION_TYPES = new Set([
  'client_chase_email', 'client_quote_chase_email', 'client_brief_clarify_email',
  'compliance_renewal_ping', 'business_renewal_reminder',
  'talent_gallery_share_request', 'crew_gallery_share_request',
]);

function DraftPreview({ actionType, content }: { actionType: string; content: DraftContent }) {
  const email = (() => {
    if (actionType === 'crew_hold_request' && content) {
      const e = content.email as { to?: string; subject?: string; body?: string } | undefined;
      if (e) return { to: e.to ? [e.to] : [], subject: e.subject ?? '', body: e.body ?? '' };
    }
    if (EMAIL_ACTION_TYPES.has(actionType)) return asEmailContent(content);
    return null;
  })();

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
            <div className="break-all"><span style={{ color: PALETTE.muted }}>To:</span> {email.to.join(', ') || '— no email on file —'}</div>
            <div className="break-words"><span style={{ color: PALETTE.muted }}>Subject:</span> {email.subject}</div>
          </div>
          <pre
            className="whitespace-pre-wrap break-words font-sans text-[11px] leading-relaxed"
            style={{ color: PALETTE.text }}
          >{email.body}</pre>
        </div>
      </details>
    );
  }

  if (!content) return null;

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-[11px]" style={{ color: PALETTE.muted }}>
        View draft content
      </summary>
      <pre
        className="mt-1 max-h-40 overflow-auto rounded-md p-2 text-[11px] break-all whitespace-pre-wrap"
        style={{ background: PALETTE.bg, color: PALETTE.muted }}
      >
        {JSON.stringify(content, null, 2)}
      </pre>
    </details>
  );
}
