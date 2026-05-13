'use client';

import { useState } from 'react';
import { sendQuickEmailAction } from '@/app/actions/bookings';
import { PALETTE } from '@/lib/utils/constants';

type Props = {
  bookingId: string;
  bookingRef: string | null;
  bookingTitle: string;
  defaultTo?: string | null;
  googleConfigured: boolean;
};

export default function QuickCompose({ bookingId, bookingRef, bookingTitle, defaultTo, googleConfigured }: Props) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultTo ?? '');
  const [subject, setSubject] = useState(
    bookingRef ? `Re: [${bookingRef}] ${bookingTitle}` : `Re: ${bookingTitle}`
  );
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(mode: 'send' | 'draft') {
    setBusy(true);
    setError(null);
    setResult(null);
    const res = await sendQuickEmailAction({ bookingId, to, subject, body, mode });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
    } else if (res.mode === 'no_google') {
      setError('Google is not configured — connect Gmail in Settings first.');
    } else {
      setResult(res.mode === 'sent' ? 'Email sent.' : 'Draft saved to Gmail.');
      setBody('');
      setTimeout(() => { setOpen(false); setResult(null); }, 2000);
    }
  }

  const inputStyle: React.CSSProperties = {
    background: PALETTE.bg,
    border: `1px solid ${PALETTE.border}`,
    color: PALETTE.text,
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 12,
    width: '100%',
    outline: 'none',
  };

  return (
    <section
      className="rounded-lg border"
      style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="section-title">
          Quick email
        </span>
        <span className="text-[11px]" style={{ color: PALETTE.accent }}>
          {open ? 'Close' : 'Compose →'}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2 border-t" style={{ borderColor: PALETTE.border }}>
          <div className="pt-3">
            <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: PALETTE.muted }}>To</label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: PALETTE.muted }}>Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: PALETTE.muted }}>Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="Type your message…"
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          {error && (
            <div className="rounded px-3 py-2 text-xs" style={{ color: PALETTE.danger, border: `1px solid ${PALETTE.danger}44` }}>
              {error}
            </div>
          )}
          {result && (
            <div className="rounded px-3 py-2 text-xs font-semibold" style={{ color: PALETTE.success, border: `1px solid ${PALETTE.success}44` }}>
              {result}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => handleSubmit('send')}
              disabled={busy || !googleConfigured}
              className="rounded px-3 py-1.5 text-xs font-semibold"
              style={{
                background: PALETTE.accent,
                color: '#fff',
                opacity: (busy || !googleConfigured) ? 0.5 : 1,
              }}
            >
              {busy ? 'Sending…' : 'Send now'}
            </button>
            <button
              type="button"
              onClick={() => handleSubmit('draft')}
              disabled={busy || !googleConfigured}
              className="rounded px-3 py-1.5 text-xs font-semibold"
              style={{
                background: `${PALETTE.accent}22`,
                color: PALETTE.accent,
                border: `1px solid ${PALETTE.accent}44`,
                opacity: (busy || !googleConfigured) ? 0.5 : 1,
              }}
            >
              Save as draft
            </button>
            {!googleConfigured && (
              <span className="text-[10px]" style={{ color: PALETTE.muted }}>Gmail not connected</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
