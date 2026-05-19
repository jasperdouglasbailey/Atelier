/**
 * Next.js instrumentation hook — runs once per server start in each
 * runtime (Node and Edge).
 *
 * Sentry init lives here so server-side error reporting comes online
 * before any route handler executes. Inert when SENTRY_DSN isn't set
 * — no DSN means no Sentry client, no events, no overhead.
 */
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      // 10% trace sample by default — plenty for a single-operator agency.
      // Bump in env via SENTRY_TRACES_SAMPLE_RATE if a real incident is being chased.
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
      // Strip noisy PII off events. Errors are about code paths, not who hit them.
      sendDefaultPii: false,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
      sendDefaultPii: false,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    });
  }
}

/**
 * Forward request-level errors to Sentry. Hook signature is from Next.js
 * 15+; running on 16 here.
 */
export const onRequestError = Sentry.captureRequestError;
