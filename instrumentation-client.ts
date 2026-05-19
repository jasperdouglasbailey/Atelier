/**
 * Sentry — client init. Runs in the browser on every navigation.
 *
 * Inert when NEXT_PUBLIC_SENTRY_DSN isn't set so dev environments
 * without a project configured stay quiet.
 */
import * as Sentry from '@sentry/nextjs';

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    // Don't auto-capture browser PII (URL params, form values). Errors are
    // about code paths, not who hit them.
    sendDefaultPii: false,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    // Session replay disabled by default — opt in via env if needed.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
