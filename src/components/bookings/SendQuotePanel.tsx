'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PALETTE } from '@/lib/utils/constants';
import { getAgencyConfig } from '@/lib/utils/agency-config';
import { sendQuoteEmailAction } from '@/app/actions/bookings';

/** Server-side pre-flight data for the "ready to quote?" checks. */
export type PreflightData = {
  talentCount: number;
  feeLineCount: number;
  hasDeliverables: boolean;
  usageLicenceCount: number;
};

type CheckStatus = 'ok' | 'warn' | 'block';

type Check = {
  label: string;
  status: CheckStatus;
  detail: string;
};

function statusIcon(s: CheckStatus) {
  if (s === 'ok')    return <span style={{ color: PALETTE.success }}>✓</span>;
  if (s === 'warn')  return <span style={{ color: PALETTE.warning }}>⚠</span>;
  return <span style={{ color: PALETTE.danger }}>✗</span>;
}

function statusColor(s: CheckStatus) {
  if (s === 'ok')   return PALETTE.success;
  if (s === 'warn') return PALETTE.warning;
  return PALETTE.danger;
}

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
  /** Pre-computed pre-flight data from the server. */
  preflight?: PreflightData;
};

type Stage = 'idle' | 'preflight' | 'compose';

export default function SendQuotePanel({
  bookingId, clientEmail, clientName, bookingRef, title, grandTotal, currentState, googleConfigured, preflight,
}: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('idle');
  const [to, setTo] = useState(clientEmail ?? '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Only show button when quote is ready to send
  const canSend = ['quote_drafted', 'quote_sent', 'artists_crew_held'].includes(currentState);
  if (!canSend) return null;

  // ── Pre-flight checks ──────────────────────────────────────────────────────
  function buildChecks(recipientEmail: string): Check[] {
    const checks: Check[] = [];

    // Email — blocker
    checks.push(
      recipientEmail.trim()
        ? { label: 'Recipient email', status: 'ok', detail: recipientEmail.trim() }
        : { label: 'Recipient email', status: 'block', detail: 'Enter a recipient email before sending' }
    );

    if (preflight) {
      // Talent — warning
      checks.push(
        preflight.talentCount > 0
          ? { label: 'Talent attached', status: 'ok', detail: `${preflight.talentCount} artist${preflight.talentCount === 1 ? '' : 's'} on the booking` }
          : { label: 'Talent attached', status: 'warn', detail: 'No artist attached — the quote will lack an artist name' }
      );

      // Fee lines — warning
      checks.push(
        preflight.feeLineCount > 0
          ? { label: 'Fee lines', status: 'ok', detail: `${preflight.feeLineCount} line${preflight.feeLineCount === 1 ? '' : 's'} in the quote` }
          : { label: 'Fee lines', status: 'warn', detail: 'No fee lines — the quote total will be $0' }
      );

      // Grand total — warning (separate from fee lines so both show)
      checks.push(
        grandTotal > 0
          ? { label: 'Quote total', status: 'ok', detail: grandTotal.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }) }
          : { label: 'Quote total', status: 'warn', detail: 'Grand total is $0 — double-check fee lines before sending' }
      );

      // Deliverables — soft warning
      checks.push(
        preflight.hasDeliverables
          ? { label: 'Deliverables noted', status: 'ok', detail: 'Deliverables are set on the booking' }
          : { label: 'Deliverables noted', status: 'warn', detail: 'No deliverables set — the brief panel lets you add them' }
      );

      // Usage — informational (only warn, common to omit)
      checks.push(
        preflight.usageLicenceCount > 0
          ? { label: 'Usage licences', status: 'ok', detail: `${preflight.usageLicenceCount} licence${preflight.usageLicenceCount === 1 ? '' : 's'} added` }
          : { label: 'Usage licences', status: 'warn', detail: 'No usage licences — confirm this is a buy-out or production-only job' }
      );
    }

    return checks;
  }

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
      getAgencyConfig().name,
      getAgencyConfig().email ?? '',
    ].filter(l => l !== null).join('\n');

    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function close() {
    setStage('idle');
    setResult(null);
  }

  const checks = buildChecks(to);
  const hasBlockers = checks.some((c) => c.status === 'block');
  const hasWarnings = checks.some((c) => c.status === 'warn');
  const allOk = !hasBlockers && !hasWarnings;

  return (
    <>
      <button
        onClick={() => setStage('preflight')}
        className="rounded-md px-3 py-1.5 text-xs font-medium"
        style={{ background: PALETTE.accent, color: PALETTE.bg }}
      >
        ✉ Send Quote
      </button>

      {/* ── Pre-flight modal ─────────────────────────────────────────────── */}
      {stage === 'preflight' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div
            className="w-full max-w-md rounded-xl border p-6 space-y-4"
            style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold" style={{ color: PALETTE.text }}>
                Ready to send?
              </h3>
              <button type="button" aria-label="Close" onClick={close} style={{ color: PALETTE.muted }}>
                ✕
              </button>
            </div>

            <p className="text-xs" style={{ color: PALETTE.muted }}>
              Quick check before the quote goes out.
            </p>

            {/* Email field — editable here too so blocking issue is fixable without closing */}
            <div>
              <label className="block text-[10px] font-semibold uppercase mb-1" style={{ color: PALETTE.muted }}>Recipient</label>
              <input
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="client@company.com"
                className="w-full rounded border px-3 py-2 text-sm"
                style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
              />
            </div>

            {/* Check list */}
            <ul className="space-y-2">
              {buildChecks(to).map((check) => (
                <li key={check.label} className="flex items-start gap-2 text-xs">
                  <span className="mt-0.5 shrink-0 font-bold text-sm leading-none">
                    {statusIcon(check.status)}
                  </span>
                  <div>
                    <span className="font-medium" style={{ color: PALETTE.text }}>{check.label}</span>
                    <span className="mx-1.5" style={{ color: PALETTE.muted }}>—</span>
                    <span style={{ color: statusColor(check.status) }}>{check.detail}</span>
                  </div>
                </li>
              ))}
            </ul>

            {/* CTA */}
            <div className="flex gap-2 pt-1">
              {!hasBlockers && (
                <button
                  onClick={() => setStage('compose')}
                  className="rounded px-4 py-2 text-xs font-medium"
                  style={{
                    background: allOk ? PALETTE.accent : `${PALETTE.warning}22`,
                    color: allOk ? PALETTE.bg : PALETTE.warning,
                    border: allOk ? 'none' : `1px solid ${PALETTE.warning}66`,
                  }}
                >
                  {allOk ? 'Looks good — continue' : 'Continue anyway'}
                </button>
              )}
              {hasBlockers && (
                <button
                  disabled
                  className="rounded px-4 py-2 text-xs font-medium opacity-40 cursor-not-allowed"
                  style={{ background: PALETTE.danger, color: PALETTE.bg }}
                  title="Fix the issues above before sending"
                >
                  Fix issues to continue
                </button>
              )}
              <button onClick={close} className="rounded px-3 py-2 text-xs" style={{ color: PALETTE.muted }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Compose modal ────────────────────────────────────────────────── */}
      {stage === 'compose' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div
            className="w-full max-w-lg rounded-xl border p-6 space-y-4"
            style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setStage('preflight'); setResult(null); }}
                  className="text-xs rounded px-2 py-1"
                  style={{ color: PALETTE.muted, border: `1px solid ${PALETTE.border}` }}
                >
                  ← Back
                </button>
                <h3 className="text-sm font-semibold" style={{ color: PALETTE.text }}>
                  Send Quote — {bookingRef}
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close send-quote panel"
                onClick={close}
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
                onClick={close}
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
