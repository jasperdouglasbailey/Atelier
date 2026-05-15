import { PALETTE } from '@/lib/utils/constants';

/**
 * Hello + welcome header for the dashboard / portal landing pages.
 *
 * Role-aware: "Hello, Jasper" feels right for an owner returning to
 * their own platform; the welcome line varies by role to reflect the
 * different jobs each user comes here to do.
 *
 * Time-of-day adapts so it doesn't say "Good morning" at 9pm.
 */

function firstName(displayName: string | null | undefined, fallbackEmail?: string | null): string {
  const raw = (displayName ?? '').trim();
  if (raw) {
    const first = raw.split(/[\s,]+/)[0];
    if (first) return first;
  }
  if (fallbackEmail) {
    // Strip @domain and split on common separators
    const local = fallbackEmail.split('@')[0] ?? '';
    const cleaned = local.split(/[._-]/)[0] ?? local;
    if (cleaned) return cleaned[0]!.toUpperCase() + cleaned.slice(1);
  }
  return 'there';
}

function timeGreeting(now: Date = new Date()): string {
  // Use Australia/Sydney for the time-of-day check — Vercel server is UTC
  // so getHours() would say "Good morning" at 9pm Sydney time. Intl is the
  // reliable way to extract the local hour for a specific timezone.
  const hour = Number(new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    hour: 'numeric',
    hour12: false,
  }).format(now));
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

type Role = 'owner' | 'partner' | 'talent' | 'crew';

const ROLE_TAGLINE: Record<Role, string> = {
  owner:   'Welcome back. Here’s what’s happening today.',
  partner: 'Welcome back. Here’s what’s happening today.',
  talent:  'Welcome back. Your upcoming work is below.',
  crew:    'Welcome back. Your upcoming jobs are below.',
};

export default function GreetingHeader({
  displayName,
  email,
  role,
  /** Override the current time — useful for tests. */
  now,
}: {
  displayName: string | null | undefined;
  email?: string | null;
  role: Role;
  now?: Date;
}) {
  const name = firstName(displayName, email);
  const tod = timeGreeting(now);
  return (
    <header className="space-y-0.5">
      <h1
        className="text-2xl font-semibold tracking-tight sm:text-3xl"
        style={{ color: PALETTE.text }}
      >
        {tod}, {name}
      </h1>
      <p className="text-sm" style={{ color: PALETTE.muted }}>
        {ROLE_TAGLINE[role]}
      </p>
    </header>
  );
}

// Export helpers for tests
export const __testing = { firstName, timeGreeting };
