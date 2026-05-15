'use client';

/**
 * Potential Briefs panel — Option B for inbound brief auto-detect.
 *
 * Shows recent Gmail messages that look like creative briefs (subject
 * matching brief / rfp / shoot / etc., ≤14 days old). Each row has a
 * single-click "Convert to booking" button that pulls the email body
 * and creates a `brief_received` booking, then redirects to its detail
 * page so the producer can run the existing brief parser.
 *
 * Heuristic-based, human-in-the-loop — never auto-creates without a
 * click. False positives are easy to dismiss with the Hide button.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { convertEmailToBookingAction } from '@/app/actions/bookings';
import { PALETTE } from '@/lib/utils/constants';

type Candidate = {
  id: string;
  subject: string;
  from: string;
  receivedAt: string;
  snippet: string;
};

type Props = { candidates: Candidate[] };

export default function PotentialBriefs({ candidates }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = candidates.filter((c) => !hidden.has(c.id));

  if (candidates.length === 0) {
    return (
      <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
          Potential briefs
        </h2>
        <p className="mt-2 text-[11px]" style={{ color: PALETTE.muted }}>
          No new emails matching brief / RFP / shoot / campaign in the last 14 days.
        </p>
      </section>
    );
  }

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

  function handleHide(id: string) {
    setHidden((prev) => new Set(prev).add(id));
  }

  return (
    <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>
          Potential briefs ({visible.length})
        </h2>
        <span className="text-[10px]" style={{ color: PALETTE.muted }}>
          Last 14 days · matches brief / RFP / shoot / campaign / production
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="text-[11px]" style={{ color: PALETTE.muted }}>
          You&apos;ve dismissed all candidates. Refresh to look again.
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((c) => {
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
                      onClick={() => handleHide(c.id)}
                      className="rounded px-2.5 py-1 text-[10px]"
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

      {error && (
        <div className="mt-3 rounded px-3 py-2 text-[11px]" style={{ color: PALETTE.danger, background: `${PALETTE.danger}10` }}>
          {error}
        </div>
      )}

      <p className="mt-3 text-[10px]" style={{ color: PALETTE.muted }}>
        Heuristic-based — false positives are normal, just dismiss them. Conversion drops the email body into a new brief that&rsquo;s ready for the parser.
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
