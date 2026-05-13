'use client';

import { useState, useTransition } from 'react';
import { acceptQuoteByTokenAction, declineQuoteByTokenAction } from '@/app/actions/quotes-public';

type Props = {
  token: string;
  bookingRef: string | null;
  agencyEmail: string | null;
};

export default function QuoteActions({ token, bookingRef, agencyEmail }: Props) {
  const [state, setState] = useState<'idle' | 'accepted' | 'declined' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [showDeclineConfirm, setShowDeclineConfirm] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleAccept() {
    startTransition(async () => {
      const result = await acceptQuoteByTokenAction(token);
      if (result.ok) {
        setState('accepted');
      } else {
        setErrorMsg(result.error);
        setState('error');
      }
    });
  }

  function handleDecline() {
    startTransition(async () => {
      const result = await declineQuoteByTokenAction(token);
      if (result.ok) {
        setState('declined');
      } else {
        setErrorMsg(result.error);
        setState('error');
      }
    });
  }

  if (state === 'accepted') {
    return (
      <div style={{ background: '#f0faf0', border: '1px solid #86efac', borderRadius: 8, padding: '24px 28px', marginBottom: 28, textAlign: 'center' }}>
        <div style={{ fontSize: 22, marginBottom: 8 }}>&#10003;</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#166534', marginBottom: 6 }}>Quote Accepted</div>
        <div style={{ fontSize: 13, color: '#166534', lineHeight: 1.6 }}>
          Thank you for confirming. We&apos;ve notified the team and will be in touch shortly to arrange next steps.
          {bookingRef && <span style={{ display: 'block', marginTop: 8, fontSize: 12, color: '#4b7c5a' }}>Reference: {bookingRef}</span>}
        </div>
      </div>
    );
  }

  if (state === 'declined') {
    return (
      <div style={{ background: '#fafafa', border: '1px solid #d0d0d0', borderRadius: 8, padding: '24px 28px', marginBottom: 28, textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#444', marginBottom: 6 }}>Quote Declined</div>
        <div style={{ fontSize: 13, color: '#666', lineHeight: 1.6 }}>
          We&apos;ve noted your response. If you&apos;d like to discuss further or revisit the proposal, please reach out.
          {agencyEmail && (
            <span> Contact us at <a href={`mailto:${agencyEmail}`} style={{ color: '#1a6a1a' }}>{agencyEmail}</a>.</span>
          )}
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div style={{ background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 8, padding: '20px 24px', marginBottom: 28 }}>
        <div style={{ fontSize: 13, color: '#b91c1c' }}>{errorMsg || 'Something went wrong. Please try again or contact us directly.'}</div>
        {agencyEmail && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
            Email us at <a href={`mailto:${agencyEmail}`} style={{ color: '#1a6a1a' }}>{agencyEmail}</a>
          </div>
        )}
      </div>
    );
  }

  if (showDeclineConfirm) {
    return (
      <div style={{ background: '#fff8f0', border: '1px solid #fed7aa', borderRadius: 8, padding: '20px 24px', marginBottom: 28 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 }}>Decline this quote?</div>
        <div style={{ fontSize: 13, color: '#555', marginBottom: 16, lineHeight: 1.5 }}>
          This will notify the team that you won&apos;t be proceeding. This action can&apos;t be undone from this link.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleDecline}
            disabled={pending}
            style={{
              padding: '9px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: '#dc2626', color: '#fff', border: 'none', opacity: pending ? 0.6 : 1,
            }}
          >
            {pending ? 'Processing…' : 'Yes, decline'}
          </button>
          <button
            onClick={() => setShowDeclineConfirm(false)}
            disabled={pending}
            style={{
              padding: '9px 20px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
              background: 'transparent', color: '#555', border: '1px solid #d0d0d0',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: '#f0f7f0', border: '1px solid #c8e6c8', borderRadius: 8, padding: '20px 24px', marginBottom: 28 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 }}>
        Ready to go ahead?
      </div>
      <div style={{ fontSize: 13, color: '#555', lineHeight: 1.6, marginBottom: 16 }}>
        Accept this quote to confirm the booking and notify the team, or decline if you&apos;d like to pass.
        {agencyEmail && (
          <span> Questions? Email <a href={`mailto:${agencyEmail}`} style={{ color: '#1a6a1a', fontWeight: 500 }}>{agencyEmail}</a>.</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={handleAccept}
          disabled={pending}
          style={{
            padding: '10px 24px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: '#16a34a', color: '#fff', border: 'none', opacity: pending ? 0.6 : 1,
          }}
        >
          {pending ? 'Processing…' : 'Accept Quote'}
        </button>
        <button
          onClick={() => setShowDeclineConfirm(true)}
          disabled={pending}
          style={{
            padding: '10px 24px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
            background: 'transparent', color: '#dc2626', border: '1px solid #fca5a5',
          }}
        >
          Decline
        </button>
      </div>
    </div>
  );
}
