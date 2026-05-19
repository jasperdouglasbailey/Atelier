/**
 * Crew outreach + confirmation email composer.
 *
 * Pure function — no DB, no Gmail, no surprises. The DB layer assembles
 * the `CrewEmailInput` and hands it here; this returns `{ subject, body }`
 * which is dropped into the approval queue as the email draft.
 *
 * The format is Jasper's spec from 2026-05-20: one emoji per logical field,
 * one ＄ per fee component, missing fields silently skipped, super only
 * ever attached to the day-fee line (never to travel or overtime).
 *
 *   Hi {firstName},
 *
 *   {intro}
 *
 *   🎤 Assisting: Oliver Begg
 *   🎬 Client: Peter Alexander
 *   🧑‍💻 Role: Digital operator
 *   ＄ Rate: $550 + 12% super
 *   📅 Date: Thu, 14 May
 *   ⏱️ Timing: 8:00am – 6:00pm
 *   📍 Location: Lunar Studios / 42 Maddox St, Alexandria NSW 2015
 *
 *   {outro}
 *
 *   Thanks,
 *   — {ownerName}
 *
 * When the booking has travel/OT loaded at confirmation, the rate block
 * splits into one ＄ per fee component:
 *
 *   ＄ Day fee: $550 + 12% super
 *   ＄ Travel: $200
 *   ＄ Overtime: $123.75 (1.5h)
 *
 * The "super only on labour fee" invariant is preserved by structure —
 * only the day-fee row carries the super suffix.
 */

import { formatCurrency } from '@/lib/utils/format';
import { SUPER_RATE_PAID } from '@/lib/utils/constants';

export type CrewEmailMode = 'hold' | 'confirm';

export interface CrewEmailInput {
  mode: CrewEmailMode;
  /** Recipient's first name. Falls back to "there" if blank. */
  recipientFirstName: string;
  /** Artists this crew member would be assisting. Joined with " + ". */
  artists: string[];
  /** Client display label (company preferred, falls back to contact name). */
  clientLabel: string | null;
  /** Crew role on this booking, in human form (e.g. "Digital operator"). */
  role: string | null;
  rates: {
    /** Day fee dollar amount. Null = omit the entire rate block. */
    dayFee: number | null;
    /**
     * Whether the day fee is super-bearing. Crew labour = true.
     * Non-super-bearing roles (or talent reuse later) = false.
     * Only the day-fee row ever shows " + 12% super".
     */
    dayFeeSuperBearing: boolean;
    /** Travel fee in dollars. Null = omit travel row. */
    travel: number | null;
    /** Overtime row — pre-loaded into the confirmation. Usually null at hold. */
    overtime: { amount: number; hours: number } | null;
  };
  /** Human-readable date string ("Thu, 14 May" or "Mon, 14 May – Wed, 16 May"). */
  dates: string | null;
  /** Call → wrap as one row ("8:00am – 6:00pm"). */
  timing: string | null;
  /** Venue / address, joined with " / " upstream. */
  location: string | null;
  /** Agency owner name for the sign-off. From getAgencyConfig().ownerName. */
  agencyOwnerName: string;
}

interface EmailOutput {
  subject: string;
  body: string;
}

/** Format a percent-12 super suffix as "+ 12% super" (no trailing dot). */
const SUPER_SUFFIX = `+ ${Math.round(SUPER_RATE_PAID * 100)}% super`;

function formatRateBlock(rates: CrewEmailInput['rates']): string[] {
  const { dayFee, dayFeeSuperBearing, travel, overtime } = rates;
  if (dayFee == null) return [];

  const dayFeeFmt = formatCurrency(dayFee, 'AUD');
  const hasExtras = travel != null || overtime != null;

  // Plain booking — single rate row using the user-facing "Rate" label.
  if (!hasExtras) {
    const suffix = dayFeeSuperBearing ? ` ${SUPER_SUFFIX}` : '';
    return [`＄ Rate: ${dayFeeFmt}${suffix}`];
  }

  // Booking with extras — switch to explicit per-component labels.
  // Day-fee row is the only one that ever carries the super suffix.
  const rows: string[] = [];
  rows.push(`＄ Day fee: ${dayFeeFmt}${dayFeeSuperBearing ? ` ${SUPER_SUFFIX}` : ''}`);
  if (travel != null) rows.push(`＄ Travel: ${formatCurrency(travel, 'AUD')}`);
  if (overtime != null) {
    rows.push(`＄ Overtime: ${formatCurrency(overtime.amount, 'AUD')} (${overtime.hours}h)`);
  }
  return rows;
}

function buildBlock(input: CrewEmailInput): string[] {
  const artistsLine = input.artists.length > 0
    ? `🎤 Assisting: ${input.artists.join(' + ')}`
    : null;

  const rows: Array<string | null> = [
    artistsLine,
    input.clientLabel ? `🎬 Client: ${input.clientLabel}` : null,
    input.role ? `🧑‍💻 Role: ${input.role}` : null,
    ...formatRateBlock(input.rates),
    input.dates ? `📅 Date: ${input.dates}` : null,
    input.timing ? `⏱️ Timing: ${input.timing}` : null,
    input.location ? `📍 Location: ${input.location}` : null,
  ];

  return rows.filter((r): r is string => r !== null);
}

function buildSubject(input: CrewEmailInput): string {
  const prefix = input.mode === 'hold' ? 'Hold' : 'Confirmed';
  const parts = [input.clientLabel, input.dates].filter((p): p is string => !!p);
  if (parts.length === 0) return `${prefix} — TBD`;
  return `${prefix} — ${parts.join(' · ')}`;
}

const INTRO_BY_MODE: Record<CrewEmailMode, string> = {
  hold: "I'm putting together a crew for an upcoming shoot and would love to have you on board.",
  confirm: "You're confirmed for the following booking:",
};

const OUTRO_BY_MODE: Record<CrewEmailMode, string> = {
  hold: 'Could you let me know your availability?',
  confirm: 'Please confirm receipt of this message.',
};

export function composeCrewEmail(input: CrewEmailInput): EmailOutput {
  const firstName = input.recipientFirstName.trim() || 'there';
  const block = buildBlock(input);
  const intro = INTRO_BY_MODE[input.mode];
  const outro = OUTRO_BY_MODE[input.mode];

  // Body lines. Blank lines between sections matter — keep them explicit
  // rather than relying on join semantics.
  const lines: string[] = [
    `Hi ${firstName},`,
    '',
    intro,
    '',
    ...block,
    '',
    outro,
    '',
    'Thanks,',
    `— ${input.agencyOwnerName}`,
  ];

  return {
    subject: buildSubject(input),
    body: lines.join('\n'),
  };
}
