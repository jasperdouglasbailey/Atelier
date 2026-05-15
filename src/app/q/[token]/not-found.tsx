/**
 * Rendered when notFound() is called from /q/[token]/page.tsx — i.e. the
 * token doesn't match any booking. AUDIT-2026-05-15 caught this: a bad
 * token was rendering raw Next.js streaming chunks (404 page without a
 * not-found.tsx) instead of a graceful "this link isn't valid" page.
 *
 * Plain prose, no quote details — the link is dead, contacting the
 * agency is the only path forward. Mirrors the styling of the inline
 * ExpiredQuoteView on page.tsx for visual consistency.
 */
import { getAgencyConfig } from '@/lib/utils/agency-config';

export default function QuoteTokenNotFound() {
  const agency = getAgencyConfig();
  const agencyEmail = agency.email ?? null;

  return (
    <div style={{ background: '#faf9f7', minHeight: '100vh', padding: '60px 24px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', background: '#ffffff', border: '1px solid #ebebeb', borderRadius: 8, padding: 40 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>
          This quote link isn&rsquo;t valid
        </h1>
        <p style={{ fontSize: 14, color: '#525252', marginTop: 16, lineHeight: 1.55 }}>
          The link you followed doesn&rsquo;t match any quote we have on
          file. It may have been mistyped, truncated by an email client,
          or revoked.
        </p>
        <p style={{ fontSize: 14, color: '#525252', marginTop: 12, lineHeight: 1.55 }}>
          {agencyEmail ? (
            <>
              Please contact{' '}
              <a href={`mailto:${agencyEmail}`} style={{ color: '#C4A882' }}>
                {agencyEmail}
              </a>{' '}
              to receive a fresh quote.
            </>
          ) : (
            <>Please contact {agency.name} to receive a fresh quote.</>
          )}
        </p>
      </div>
    </div>
  );
}
