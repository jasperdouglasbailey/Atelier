import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

/**
 * Security headers applied to every response.
 *
 * - HSTS: forces HTTPS for 1 year, includes subdomains, eligible for preload list.
 *   Vercel terminates TLS; this prevents downgrade attacks via stale bookmarks.
 * - X-Frame-Options DENY: blocks the app being embedded in another site's iframe
 *   (defends against clickjacking on owner / partner sessions).
 * - X-Content-Type-Options nosniff: stops browsers MIME-sniffing responses, which
 *   closes a class of attacks where a non-HTML asset is served as HTML.
 * - Referrer-Policy strict-origin-when-cross-origin: leaks origin only on cross-
 *   origin navigation, never the full path. Keeps tokenised URLs (e.g. `/q/<uuid>`,
 *   `/onboard/<uuid>`) out of third-party referer logs.
 * - Permissions-Policy: drops a long list of capabilities the app never uses.
 *   Defence-in-depth — if a script gets injected, it can't reach for camera/mic.
 *
 * No CSP yet. Adding a strict CSP without breaking Next.js inline runtime
 * scripts requires nonce wiring through every layout — leaving that for a
 * dedicated follow-up so this PR stays reviewable.
 */
const SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: [
      'accelerometer=()',
      'autoplay=()',
      'camera=()',
      'cross-origin-isolated=()',
      'display-capture=()',
      'encrypted-media=()',
      'fullscreen=(self)',
      'geolocation=()',
      'gyroscope=()',
      'keyboard-map=()',
      'magnetometer=()',
      'microphone=()',
      'midi=()',
      'payment=()',
      'picture-in-picture=()',
      'publickey-credentials-get=()',
      'screen-wake-lock=()',
      'sync-xhr=()',
      'usb=()',
      'xr-spatial-tracking=()',
    ].join(', '),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

/**
 * Sentry wrapper. Inert when no DSN env var is set (the runtime init
 * code checks for NEXT_PUBLIC_SENTRY_DSN before calling Sentry.init).
 * The wrapper itself adds source-map upload + tracing instrumentation
 * at build time; it's a no-op if SENTRY_AUTH_TOKEN is also unset.
 *
 * Re-export through withSentryConfig so the headers() etc. above stay
 * intact while Sentry layers on its build-time hooks.
 */
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  // Project / org left to env vars (SENTRY_ORG, SENTRY_PROJECT) so the
  // codebase doesn't hardcode either. Build proceeds without source-map
  // upload when those aren't set.
  widenClientFileUpload: true,
  disableLogger: true,
  sourcemaps: { disable: false },
});
