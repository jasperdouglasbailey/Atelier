'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PALETTE } from '@/lib/utils/constants';
import { sendQuoteEmailAction } from '@/app/actions/bookings';

type Props = {
  bookingId: string;
  /** Client email from DB — may be null if not yet set. */
  clientEmail: string | null;
  clientName: string;
  bookingRef: string | null;
  title: string;
  grandTotal: number;
  currentState: string;
  googleConfigured: boolean;
};

export default function SendQuotePanel({
  bookingId, clientEmail, clientName, bookingRef, title, grandTotal, currentState, googleConfigured,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(clientEmail ?? '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Only show button when quote is ready to send
  const canSend = ['quote_drafted', 'quote_sent', 'artists_crew_held'].includes(currentState);
  if (!canSend) return null;

  async function handleAction(mode: 'draft' | 'send') {
    setBusy(true);
    setResult(null);
    const res = await sendQuoteEmailAction(bookingId, mode, to !== clientEmail ? { to } : undefined);
    setBusy(false);

    if ('error' in res) {
      setResult({ type: 'error', message: res.error ?? 'Unknown error' });
      return;
    }

    if (res.mode === 'no_google') {
      setResult({ type: 'success', message: 'Google not yet configured — copy the draft below to send manually.' });
      return;
    }
    if (res.mode === 'drafted') {
      setResult({ type: 'success', message: 'Draft created in Gmail. Open Gmail to review and send.' });
    }
    if (res.mode === 'sent') {
      setResult({ type: 'success', message: 'Quote sent. Booking moved to Quote Sent.' });
      router.refresh();
    }
  }

  async function handleCopy() {
    const text = [
      `To: ${to}`,
      `Subject: [${bookingRef ?? ''}] Quote — ${title}`,
      '',
      `Hi ${clientName || 'there'},`,
      '',
      `Please find our quote for ${title} (${bookingRef}) below.`,
      '',
      grandTotal > 0 ? `Total (inc. GST): ${grandTotal.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })}` : '',
      '',
      `To confirm, please reply to this email. We'll hold the dates and issue paperwork once we hear from you.`,
      '',
      'Jasper Bailey',
      'Saunders & Co',
      'info@saundersandco.com.au',
    ].filter(l => l !== null).join('\n');

    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md px-3 py-1.5 text-xs font-medium"
        style={{ background: PALETTE.accent, color: PALETTE.bg }}
      >
        ✉ Send Quote
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            className="w-full max-w-lg rounded-xl border p-6 space-y-4"
            style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold" style={{ color: PALETTE.text }}>
                Send Quote — {bookingRef}
              </h3>
              <button
                type="button"
                aria-label="Close send-quote panel"
                onClick={() => { setOpen(false); setResult(null); }}
                style={{ color: PALETTE.muted }}
              >
                ✕
              </button>
            </div>

            {result && (
              <div
                className="rounded px-3 py-2 text-xs"
                style={{
                  background: result.type === 'success' ? `${PALETTE.success}18` : `${PALETTE.danger}18`,
                  color: result.type === 'success' ? PALETTE.success : PALETTE.danger,
                }}
              >
                {result.message}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase mb-1" style={{ color: PALETTE.muted }}>To</label>
                <input
                  type="email"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="client@company.com"
                  className="w-full rounded border px-3 py-2 text-sm"
                  style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
                />
                {!clientEmail && (
                  <p className="mt-1 text-[10px]" style={{ color: PALETTE.warning }}>
                    No email on client profile — add one, or enter manually above.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase mb-1" style={{ color: PALETTE.muted }}>Subject</label>
                <div className="rounded border px-3 py-2 text-sm" style={{ background: PALETTE.bgSoft, borderColor: PALETTE.border, color: PALETTE.muted }}>
                  [{bookingRef}] Quote — {title}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase mb-1" style={{ color: PALETTE.muted }}>Preview</label>
                <div className="rounded border px-3 py-2 text-xs space-y-1 leading-relaxed" style={{ background: PALETTE.bgSoft, borderColor: PALETTE.border, color: PALETTE.muted }}>
                  <p>Hi {clientName || 'there'},</p>
                  <p>Please find our quote for <span style={{ color: PALETTE.text }}>{title}</span> ({bookingRef}) below.</p>
                  {grandTotal > 0 && (
                    <p><strong style={{ color: PALETTE.text }}>Total (inc. GST):</strong> {grandTotal.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })}</p>
                  )}
                  <p>To confirm, please reply to this email...</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {googleConfigured ? (
                <>
                  <button
                    onClick={() => handleAction('draft')}
                    disabled={busy || !to}
                    className="rounded px-4 py-2 text-xs font-medium disabled:opacity-50"
                    style={{ background: `${PALETTE.accent}22`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}44` }}
                  >
                    {busy ? 'Working…' : 'Save as Gmail Draft'}
                  </button>
                  <button
                    onClick={() => handleAction('send')}
                    disabled={busy || !to}
                    className="rounded px-4 py-2 text-xs font-medium disabled:opacity-50"
                    style={{ background: PALETTE.accent, color: PALETTE.bg }}
                  >
                    {busy ? 'Sending…' : 'Send Now'}
                  </button>
                </>
              ) : (
                <button
                  onClick={handleCopy}
                  disabled={!to}
                  className="rounded px-4 py-2 text-xs font-medium disabled:opacity-50"
                  style={{ background: `${PALETTE.accent}22`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}44` }}
                >
                  {copied ? 'Copied!' : 'Copy draft to clipboard'}
                </button>
              )}
              <button
                onClick={() => { setOpen(false); setResult(null); }}
                className="rounded px-3 py-2 text-xs"
                style={{ color: PALETTE.muted }}
              >
                Cancel
              </button>
            </div>

            {!googleConfigured && (
              <p className="text-[10px]" style={{ color: PALETTE.muted }}>
                Google not yet connected — connect in Settings to send directly from the app.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
