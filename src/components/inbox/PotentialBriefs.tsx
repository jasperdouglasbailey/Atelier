'use client';

/**
 * Potential Briefs panel — Option B for inbound brief auto-detect.
 *
 * Shows recent Gmail messages that look like creative briefs. Two actions
 * per row: "Convert to booking" (creates a `brief_received` booking and
 * navigates to it) and "Not a brief" (persistently dismisses the message
 * so it stops appearing on future refreshes).
 *
 * Dismissal is undoable two ways:
 *   1. Inline toast within 8s of clicking "Not a brief"
 *   2. "Show N dismissed" toggle at the bottom — restore any past
 *      dismissal at any time
 *
 * Heuristic-based, human-in-the-loop — never auto-creates without a click.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { convertEmailToBookingAction } from '@/app/actions/bookings';
import { dismissBriefCandidateAction, undismissBriefCandidateAction } from '@/app/actions/dismissed-briefs';
import { PALETTE } from '@/lib/utils/constants';

type Candidate = {
  id: string;
  subject: string;
  from: string;
  receivedAt: string;
  snippet: string;
};

type DismissedRow = {
  gmail_message_id: string;
  dismissed_at: string;
  subject: string | null;
  from_header: string | null;
  received_at: string | null;
};

type Props = {
  candidates: Candidate[];
  dismissed: DismissedRow[];
};

type ToastState = { id: string; subject: string } | null;

export default function PotentialBriefs({ candidates, dismissed }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  // Optimistic hiding while the server confirms the dismissal — the toast
  // shows during this window with Undo. After 8s or after the user clicks
  // somewhere else, the server already has the row.
  const [optimisticallyHidden, setOptimisticallyHidden] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<ToastState>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = candidates.filter((c) => !optimisticallyHidden.has(c.id));

  function handleConvert(c: Candidate) {
    setError(null);
    setBusyId(c.id);
    startTransition(async () => {
      const result = await convertEmailToBookingAction({
        messageId: c.id,
        subject: c.subject,
        fromHeader: c.from,
      });
      setBusyId(null);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      router.push(`/bookings/${result.bookingId}`);
      router.refresh();
    });
  }

  function handleDismiss(c: Candidate) {
    setError(null);
    setBusyId(c.id);
    // Optimistically hide right away so the row disappears immediately.
    setOptimisticallyHidden((prev) => new Set(prev).add(c.id));
    setToast({ id: c.id, subject: c.subject || '(no subject)' });

    startTransition(async () => {
      const result = await dismissBriefCandidateAction({
        gmail_message_id: c.id,
        subject: c.subject,
        from_header: c.from,
        received_at: c.receivedAt,
      });
      setBusyId(null);
      if (!result.ok) {
        // Revert optimistic hide on failure.
        setOptimisticallyHidden((prev) => {
          const next = new Set(prev);
          next.delete(c.id);
          return next;
        });
        setToast(null);
        setError(result.error);
        return;
      }
      router.refresh();
    });

    // Auto-clear the toast after 8s (server persistence stays).
    setTimeout(() => {
      setToast((t) => (t?.id === c.id ? null : t));
    }, 8000);
  }

  function handleUndoDismiss(messageId: string) {
    setError(null);
    setToast(null);
    startTransition(async () => {
      const result = await undismissBriefCandidateAction(messageId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Drop the optimistic-hide so the row re-appears in `visible`.
      setOptimisticallyHidden((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
      router.refresh();
    });
  }

  // Render-time dedup: a candidate dismissed AND in the live candidates list
  // (race condition: dismiss action ran but candidates fetched stale data)
  // shouldn't appear in the active list.
  const dismissedIds = new Set(dismissed.map((d) => d.gmail_message_id));
  const visibleAfterDedup = visible.filter((c) => !dismissedIds.has(c.id));

  return (
    <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>
          Potential briefs <span style={{ opacity: 0.7 }}>· {visibleAfterDedup.length}</span>
        </h2>
        <span className="text-[10px]" style={{ color: PALETTE.muted }}>
          Last 30 days · matches brief / RFP / shoot / availability
        </span>
      </div>

      {visibleAfterDedup.length === 0 ? (
        <p className="text-[11px]" style={{ color: PALETTE.muted }}>
          No new candidates. {dismissed.length > 0 && 'Toggle below to recover dismissed.'}
        </p>
      ) : (
        <div className="space-y-2">
          {visibleAfterDedup.map((c) => {
            const fromName = c.from.replace(/<.*>/, '').trim() || c.from;
            const date = new Date(c.receivedAt);
            const ago = relativeDays(date);
            return (
              <div
                key={c.id}
                className="rounded-md border-l-2 px-3 py-2"
                style={{ borderColor: PALETTE.accent, background: `${PALETTE.accent}06` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate" style={{ color: PALETTE.text }}>
                      {c.subject || '(no subject)'}
                    </div>
                    <div className="mt-0.5 text-[11px]" style={{ color: PALETTE.muted }}>
                      {fromName} · {ago}
                    </div>
                    {c.snippet && (
                      <div className="mt-1 text-[11px] line-clamp-2" style={{ color: PALETTE.muted, opacity: 0.85 }}>
                        {c.snippet}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 flex-none">
                    <button
                      type="button"
                      onClick={() => handleConvert(c)}
                      disabled={pending && busyId === c.id}
                      className="rounded px-2.5 py-1 text-[11px] font-medium disabled:opacity-50"
                      style={{ background: PALETTE.accent, color: PALETTE.bg, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      {pending && busyId === c.id ? 'Converting…' : 'Convert to booking'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDismiss(c)}
                      disabled={pending && busyId === c.id}
                      className="rounded px-2.5 py-1 text-[10px] disabled:opacity-50"
                      style={{ background: 'transparent', color: PALETTE.muted, border: `1px solid ${PALETTE.border}`, cursor: 'pointer' }}
                    >
                      Not a brief
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inline toast — visible for 8s after dismiss. Clicking Undo restores immediately. */}
      {toast && (
        <div
          role="status"
          className="mt-3 flex items-center justify-between gap-3 rounded-md border-l-2 px-3 py-2"
          style={{ background: `${PALETTE.warning}10`, borderColor: PALETTE.warning, color: PALETTE.text }}
        >
          <span className="text-[11px]">
            Dismissed <strong>{toast.subject}</strong>. Persistent — will not reappear on refresh.
          </span>
          <button
            type="button"
            onClick={() => handleUndoDismiss(toast.id)}
            className="text-[11px] font-semibold underline"
            style={{ color: PALETTE.warning, cursor: 'pointer' }}
          >
            Undo
          </button>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded px-3 py-2 text-[11px]" style={{ color: PALETTE.danger, background: `${PALETTE.danger}10` }}>
          {error}
        </div>
      )}

      {/* "Show dismissed" toggle — persistent recovery for any past dismissal. */}
      {dismissed.length > 0 && (
        <div className="mt-3 pt-3 border-t" style={{ borderColor: PALETTE.border }}>
          <button
            type="button"
            onClick={() => setShowDismissed((v) => !v)}
            className="text-[11px] underline"
            style={{ color: PALETTE.muted, cursor: 'pointer' }}
          >
            {showDismissed ? 'Hide' : 'Show'} {dismissed.length} dismissed
          </button>

          {showDismissed && (
            <div className="mt-2 space-y-1">
              {dismissed.map((d) => {
                const subject = d.subject || '(no subject)';
                const fromName = (d.from_header ?? '').replace(/<.*>/, '').trim() || d.from_header || '';
                return (
                  <div
                    key={d.gmail_message_id}
                    className="flex items-center justify-between gap-3 rounded px-2 py-1.5"
                    style={{ background: PALETTE.bg, opacity: 0.85 }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] truncate" style={{ color: PALETTE.text }}>{subject}</div>
                      <div className="text-[10px] truncate" style={{ color: PALETTE.muted }}>
                        {fromName} · dismissed {relativeDays(new Date(d.dismissed_at))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUndoDismiss(d.gmail_message_id)}
                      className="rounded px-2 py-0.5 text-[10px] flex-none"
                      style={{ background: 'transparent', color: PALETTE.accent, border: `1px solid ${PALETTE.accent}55`, cursor: 'pointer' }}
                    >
                      Restore
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <p className="mt-3 text-[10px]" style={{ color: PALETTE.muted }}>
        Heuristic-based — false positives are normal. Dismissals persist across refreshes and can be undone above.
      </p>
    </section>
  );
}

function relativeDays(d: Date): string {
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return `${Math.floor(days / 7)} week${days < 14 ? '' : 's'} ago`;
}
