import { PALETTE } from '@/lib/utils/constants';
import { formatDate } from '@/lib/utils/format';

export interface GmailThread {
  id: string;
  subject: string;
  from: string;
  receivedAt: string;
  snippet: string;
}

type Props = {
  bookingRef: string | null;
  threads: GmailThread[];
  isConfigured: boolean;
};

export default function BookingComms({ bookingRef, threads, isConfigured }: Props) {
  if (!bookingRef) return null;

  return (
    <section className="rounded-lg border" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: PALETTE.border }}>
        <h3 className="section-title">
          Comms — {bookingRef}
        </h3>
        {!isConfigured && (
          <span className="text-[10px]" style={{ color: PALETTE.muted }}>Gmail not connected</span>
        )}
        {isConfigured && threads.length === 0 && (
          <span className="text-[10px]" style={{ color: PALETTE.muted }}>No emails found</span>
        )}
      </div>

      {threads.length > 0 && (
        <ul className="divide-y" style={{ borderColor: PALETTE.border }}>
          {threads.map((t) => (
            <li key={t.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" style={{ color: PALETTE.text }}>
                    {t.subject || '(no subject)'}
                  </p>
                  <p className="mt-0.5 truncate text-xs" style={{ color: PALETTE.muted }}>
                    {t.from}
                  </p>
                  {t.snippet && (
                    <p className="mt-1 line-clamp-2 text-xs" style={{ color: PALETTE.muted }}>
                      {t.snippet}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] whitespace-nowrap" style={{ color: PALETTE.muted }}>
                    {formatDate(t.receivedAt.slice(0, 10))}
                  </p>
                  <a
                    href={`https://mail.google.com/mail/u/0/#inbox/${t.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-[10px]"
                    style={{ color: PALETTE.accent }}
                  >
                    Open →
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
