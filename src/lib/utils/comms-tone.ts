/**
 * Tone-aware email builders for all automated client comms.
 *
 * Three registers keyed on Client.communication_style:
 *
 *   formal  — full prose, professional salutation/close, whole sentences
 *   casual  — Jasper's base voice (direct, concise, no exclamation marks)
 *   terse   — very short, numbered bullets, absolute minimum words
 *   null    — treated as 'casual'
 *
 * Every exported function returns { subject, body }. The caller passes
 * the result directly into the draft_content of an atelier_approval row.
 */

import type { CommunicationStyle } from '@/lib/types/database';
import { getAgencyConfig } from '@/lib/utils/agency-config';

type Style = CommunicationStyle | null;
type Register = NonNullable<Style>;

// ─── shared helpers ───────────────────────────────────────────────────────────

function salutation(style: Style, name: string): string {
  if (style === 'formal') return `Dear ${name},`;
  return `Hi ${name},`;
}

function close(style: Style): string {
  if (style === 'formal') {
    const agency = getAgencyConfig();
    const emailLine = agency.email ? `\n${agency.email}` : '';
    return `Kind regards,\nJasper Bailey\n${agency.name}${emailLine}`;
  }
  return 'Best,\nJasper';
}

type ChaseTemplate = {
  bodies: Record<number, Record<Register, string>>;
  fallbackDayMark: number;
  subject: (ref: string, title?: string) => string;
  placeholder: string;
};

function buildChaseEmail(
  template: ChaseTemplate,
  opts: { style: Style; dayMark: number; bookingRef: string; bookingTitle?: string; clientName: string },
): { subject: string; body: string } {
  const { style, dayMark, bookingRef, bookingTitle, clientName } = opts;
  const s = style ?? 'casual';
  const bodyTemplate = template.bodies[dayMark]?.[s] ?? template.bodies[template.fallbackDayMark][s];
  const bodyText = bodyTemplate.replace(new RegExp(`\\{${template.placeholder}\\}`, 'g'), bookingTitle ?? bookingRef);
  return {
    subject: template.subject(bookingRef, bookingTitle),
    body: `${salutation(style, clientName)}\n\n${bodyText}\n\n${close(style)}`,
  };
}

// ─── quote-chase ──────────────────────────────────────────────────────────────

const QUOTE_CHASE: ChaseTemplate = {
  placeholder: 'title',
  fallbackDayMark: 21,
  subject: (ref, title) => `RE: ${title ?? ref} — ${ref}`,
  bodies: {
    3: {
      formal: `I wanted to follow up on the quote we forwarded for {title}. Please do not hesitate to get in touch if you would like to discuss any aspect of the proposal or if anything requires clarification.`,
      casual: `Wanted to check the quote we sent through for {title} landed OK. Happy to walk through any line items or talk pricing if that would help.\n\nWhat's the timeline looking like on your end?`,
      terse:  `Quick follow-up on the {title} quote. Any questions?`,
    },
    7: {
      formal: `I am writing to follow up on the outstanding quote for {title}. If it would be helpful, I am available for a call this week to discuss the proposal in detail or to make any adjustments that would assist with your decision.`,
      casual: `Following up on the {title} quote — happy to hop on a quick call this week if it would help unblock anything. Otherwise let me know if there's a tweak that would get this over the line.`,
      terse:  `{title} quote — still on your radar? Happy to adjust if needed.`,
    },
    14: {
      formal: `I wanted to check in on {title}. We have held options for crew and dates on your behalf — please let us know if the project is still proceeding or if priorities have changed, so we can manage our schedule accordingly.`,
      casual: `Just checking in on {title}. We've held a few options for crew and dates — let me know if the project is still moving forward or if priorities have shifted.`,
      terse:  `{title} — still going ahead? Crew holds in place. Let me know.`,
    },
    21: {
      formal: `This is my final follow-up regarding {title}. If the timing has been revised or the project is on hold, please let us know so we can release the holds. We would be happy to revisit the proposal when you are ready to proceed.`,
      casual: `This is my last follow-up on {title}. If the timing has slipped or the project is on hold, no problem — just let me know and we'll release the holds. Always happy to revisit when you're ready.`,
      terse:  `Final note on {title}. Going ahead? If not, just say — we'll release holds.`,
    },
  },
};

export function buildQuoteChaseEmail(opts: {
  style: Style;
  dayMark: number;
  bookingRef: string;
  bookingTitle: string;
  clientName: string;
}): { subject: string; body: string } {
  return buildChaseEmail(QUOTE_CHASE, { ...opts, bookingTitle: opts.bookingTitle });
}

// ─── post-shoot chase ─────────────────────────────────────────────────────────

const POST_SHOOT_CHASE: ChaseTemplate = {
  placeholder: 'ref',
  fallbackDayMark: 30,
  subject: (ref) => `RE: ${ref} — Final deliverables`,
  bodies: {
    7: {
      formal: `I am following up on the final deliverables for {ref}. Please let us know if everything arrived to your satisfaction or if there is anything outstanding on our end.`,
      casual: `Following up on the final deliverables for {ref}. Please let me know if you have any questions or if there's anything you need from our side.`,
      terse:  `{ref} finals — did everything arrive OK? Anything outstanding?`,
    },
    14: {
      formal: `I wanted to ensure the deliverables for {ref} have met your expectations. If there are any outstanding questions or if anything requires attention, please do not hesitate to reach out.`,
      casual: `Just checking in on {ref} — wanted to make sure the finals landed OK and that you have everything you need.\n\nIf there's anything outstanding, happy to chat.`,
      terse:  `{ref} — finals all good? Any retouching notes outstanding?`,
    },
    22: {
      formal: `I am following up again regarding {ref}. If there are outstanding retouching notes or unresolved delivery questions, I would appreciate the opportunity to address them promptly.`,
      casual: `Following up again on {ref}. If there are any outstanding retouching notes or delivery questions, let's get them resolved.`,
      terse:  `{ref} — any outstanding retouch notes? Let's close these out.`,
    },
    30: {
      formal: `This is my final follow-up concerning {ref}. If you have any outstanding feedback or concerns regarding the deliverables, please contact us directly at your earliest convenience.`,
      casual: `This is my final follow-up on {ref}. If you have any outstanding feedback or issues with the deliverables, please reach out directly.`,
      terse:  `Final note on {ref}. Any issues? Please reach out.`,
    },
  },
};

export function buildPostShootChaseEmail(opts: {
  style: Style;
  dayMark: number;
  bookingRef: string;
  clientName: string;
}): { subject: string; body: string } {
  return buildChaseEmail(POST_SHOOT_CHASE, { ...opts, bookingTitle: opts.bookingRef });
}

// ─── brief-clarify ────────────────────────────────────────────────────────────

export function buildBriefClarifyEmail(opts: {
  style: Style;
  clientName: string;
  bookingTitle: string;
  bookingRef: string | null;
  questions: string[];
}): { subject: string; body: string } {
  const { style, clientName, bookingTitle, bookingRef, questions } = opts;
  const s = style ?? 'casual';
  const subject = `[${bookingRef ?? 'Brief'}] Quick clarifications — ${bookingTitle}`;

  const titleRef = `${bookingTitle}${bookingRef ? ` (${bookingRef})` : ''}`;
  const COPY: Record<Register, { intro: string; outro: string }> = {
    formal: {
      intro: `Thank you for forwarding the brief for ${titleRef}. Before I am able to prepare a quote, I have a few points I would like to clarify:`,
      outro: `Once I have these details I will be able to turn a quote around within a day or two.`,
    },
    terse: {
      intro: `${titleRef} — a few quick questions before I quote:`,
      outro: `Quote to follow once confirmed.`,
    },
    casual: {
      intro: `Thanks for the brief on ${titleRef}. Before I get a quote together, a few quick clarifications:`,
      outro: `Once we have these I can have a quote across to you within a day or two.`,
    },
  };

  const { intro, outro } = COPY[s];
  const numberedQuestions = questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
  return {
    subject,
    body: `${salutation(style, clientName)}\n\n${intro}\n\n${numberedQuestions}\n\n${outro}\n\n${close(style)}`,
  };
}
