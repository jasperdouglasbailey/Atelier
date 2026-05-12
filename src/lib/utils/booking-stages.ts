/**
 * Booking stage grouping — translates the 13 fine-grained booking states
 * into 5 high-level workflow groups for the detail-page header stepper.
 *
 * The fine state machine still drives transitions and audit (see
 * `STATE_TRANSITIONS` in constants.ts). This file is presentation-only:
 * it tells the UI which group a state belongs to, so the stepper can
 * highlight the current group and the checklist can show stage-relevant
 * tasks rather than dumping everything onto the page at once.
 */

import type {
  BookingState, Booking, BookingTalent, BookingCrew, UsageLicence,
  QuoteVersion, FeeLine,
} from '@/lib/types/database';

export type BookingStageGroup =
  | 'brief'
  | 'quote'
  | 'production'
  | 'delivery'
  | 'closed';

/**
 * Ordered groups — the stepper renders them left-to-right in this order.
 * "Closed" is an exit lane (released / cancelled); it's shown but greyed
 * unless the booking is actually in it.
 */
export const STAGE_GROUPS: readonly BookingStageGroup[] = [
  'brief', 'quote', 'production', 'delivery', 'closed',
] as const;

export const STAGE_GROUP_LABELS: Record<BookingStageGroup, string> = {
  brief:      'Brief',
  quote:      'Quote',
  production: 'Production',
  delivery:   'Delivery',
  closed:     'Closed',
};

/**
 * One-line summary of what happens in each stage — shown under the group
 * label in the stepper for context.
 */
export const STAGE_GROUP_BLURBS: Record<BookingStageGroup, string> = {
  brief:      'Receive & parse the client request',
  quote:      'Build, send, and confirm the quote',
  production: 'Pre-pro, shoot day, morning-after',
  delivery:   'Post, deliver, invoice, get paid',
  closed:     'Released, cancelled, or written off',
};

/**
 * Maps each fine-grained state to its stage group. Single source of truth
 * — anywhere we need "which group is this state in?", read from here.
 */
export const STATE_TO_STAGE: Record<BookingState, BookingStageGroup> = {
  brief_received:      'brief',
  brief_parsed:        'brief',
  quote_drafted:       'quote',
  quote_sent:          'quote',
  artists_crew_held:   'quote',
  quote_confirmed:     'quote',
  pre_production:      'production',
  shoot_live:          'production',
  morning_after_check: 'production',
  post_production:     'delivery',
  final_delivery:      'delivery',
  invoice_issued:      'delivery',
  paid:                'delivery',
  released:            'closed',
  cancelled:           'closed',
  written_off:         'closed',
};

/** Returns the stage group for a booking state. */
export function stageOf(state: BookingState): BookingStageGroup {
  return STATE_TO_STAGE[state];
}

/**
 * Returns the index of a stage in `STAGE_GROUPS`. Used by the stepper to
 * decide which groups have been "passed" (rendered as completed).
 */
export function stageIndex(group: BookingStageGroup): number {
  return STAGE_GROUPS.indexOf(group);
}

// ============================================================
// Stage checklists — what's left to do at each stage.
// ============================================================

export type ChecklistStatus = 'done' | 'pending' | 'optional' | 'blocked';

export type ChecklistItem = {
  label: string;
  status: ChecklistStatus;
  /** Optional explanation shown on hover or beneath the label. */
  hint?: string;
};

export type StageChecklist = {
  /** Headline summary of where this booking stands at this stage. */
  summary: string;
  /** What Jasper should do next. Drives the primary CTA. */
  nextAction: { label: string; intent: 'primary' | 'wait' | 'danger' } | null;
  items: ChecklistItem[];
};

type ChecklistInput = {
  booking: Booking;
  bookingTalent: BookingTalent[];
  bookingCrew: BookingCrew[];
  usageLicences: UsageLicence[];
  latestQuote: QuoteVersion | null;
  feeLines: FeeLine[];
};

/**
 * Builds the stage-aware "what's left" panel shown beneath the stepper.
 *
 * The summary line is one sentence. The items are micro-tasks with a
 * status colour. The `nextAction` drives the single big-button CTA (Send
 * quote, Mark shoot live, etc.) — keep it to ONE primary CTA per stage so
 * Jasper isn't overwhelmed with choices.
 */
export function getStageChecklist(input: ChecklistInput): StageChecklist {
  const { booking } = input;
  const stage = stageOf(booking.state);
  switch (stage) {
    case 'brief':      return briefChecklist(input);
    case 'quote':      return quoteChecklist(input);
    case 'production': return productionChecklist(input);
    case 'delivery':   return deliveryChecklist(input);
    case 'closed':     return closedChecklist(input);
  }
}

function briefChecklist({ booking }: ChecklistInput): StageChecklist {
  const items: ChecklistItem[] = [
    { label: 'Brief text received',
      status: booking.brief_raw_text ? 'done' : 'pending',
      hint: 'Raw email or PDF copy of the client request' },
    { label: 'Client identified',
      status: booking.client_id ? 'done' : 'pending' },
    { label: 'Shoot dates clarified',
      status: (booking.shoot_dates || booking.shoot_date_notes) ? 'done' : 'pending',
      hint: 'Either a confirmed range or notes (e.g. "TBC mid-May")' },
    { label: 'Deliverables understood',
      status: booking.deliverables_type ? 'done' : 'pending' },
  ];

  const isParsed = booking.state === 'brief_parsed';
  return {
    summary: isParsed
      ? 'Brief parsed. Ready to draft the quote.'
      : 'Read the brief and parse it into structured fields.',
    nextAction: isParsed
      ? { label: 'Draft quote', intent: 'primary' }
      : { label: 'Parse brief', intent: 'primary' },
    items,
  };
}

function quoteChecklist(input: ChecklistInput): StageChecklist {
  const { booking, bookingTalent, bookingCrew, usageLicences, latestQuote, feeLines } = input;
  const items: ChecklistItem[] = [
    { label: 'Talent attached',
      status: bookingTalent.length > 0 ? 'done' : 'pending' },
    { label: 'Day rates set',
      status: bookingTalent.length === 0
        ? 'pending'
        : bookingTalent.every((t) => (t.day_rate ?? 0) > 0) ? 'done' : 'pending' },
    { label: 'Crew identified',
      status: bookingCrew.length > 0 ? 'done' : 'optional',
      hint: 'Crew is optional for some shoots (e.g. simple stills)' },
    { label: 'Crew holds sent',
      status: bookingCrew.length === 0
        ? 'optional'
        : bookingCrew.every((c) => c.status === 'sent' || c.status === 'confirmed') ? 'done' : 'pending' },
    { label: 'Usage licence attached',
      status: usageLicences.length > 0 ? 'done' : 'optional',
      hint: 'Required for licensable usage; skip for content shoots' },
    { label: 'Quote v1 drafted',
      status: latestQuote ? 'done' : 'pending' },
    { label: 'Fee lines added',
      status: feeLines.length > 0 ? 'done' : 'pending' },
  ];

  // Sub-state branching — what the next action looks like depends on
  // exactly where in the quote lane we are.
  if (booking.state === 'quote_drafted') {
    return {
      summary: 'Quote drafted. Send it to the client when ready.',
      nextAction: { label: 'Send quote to client', intent: 'primary' },
      items,
    };
  }
  if (booking.state === 'quote_sent') {
    items.push({
      label: 'Quote sent to client',
      status: 'done',
      hint: booking.quote_sent_at ? `Sent ${booking.quote_sent_at.slice(0, 10)}` : undefined,
    });
    return {
      summary: 'Quote sent. Waiting on client confirmation.',
      nextAction: { label: 'Awaiting client reply', intent: 'wait' },
      items,
    };
  }
  if (booking.state === 'artists_crew_held') {
    const allTalentConfirmed = bookingTalent.every((t) => t.confirmed);
    const allCrewConfirmed = bookingCrew.length === 0
      ? true
      : bookingCrew.every((c) => c.status === 'confirmed');
    items.push(
      { label: 'All talent confirmed',
        status: bookingTalent.length === 0 ? 'pending' : allTalentConfirmed ? 'done' : 'pending' },
      { label: 'All crew confirmed',
        status: bookingCrew.length === 0 ? 'optional' : allCrewConfirmed ? 'done' : 'pending' },
    );
    const ready = allTalentConfirmed && allCrewConfirmed;
    return {
      summary: ready
        ? 'Everyone’s locked. Mark the quote confirmed.'
        : 'Holds out. Chase the stragglers.',
      nextAction: ready
        ? { label: 'Mark quote confirmed', intent: 'primary' }
        : { label: 'Waiting on holds', intent: 'wait' },
      items,
    };
  }
  // quote_confirmed
  return {
    summary: 'Quote confirmed. Ready to move into pre-production.',
    nextAction: { label: 'Start pre-production', intent: 'primary' },
    items,
  };
}

function productionChecklist(input: ChecklistInput): StageChecklist {
  const { booking } = input;
  const items: ChecklistItem[] = [
    { label: 'Shoot location confirmed',
      status: booking.shoot_location ? 'done' : 'pending' },
    { label: 'Call time set',
      status: booking.call_time ? 'done' : 'pending',
      hint: 'When the crew is needed on set' },
    { label: 'Wrap time set',
      status: booking.wrap_time ? 'done' : 'optional',
      hint: 'Planned finish — drives the overtime threshold' },
    { label: 'Looks per talent set',
      status: booking.looks_per_talent != null ? 'done' : 'optional' },
    { label: 'Selects due captured',
      status: booking.selects_cadence ? 'done' : 'optional' },
    { label: 'Drive folder ready',
      status: booking.drive_folder_ids ? 'done' : 'pending',
      hint: 'Sub-folders for briefs / selects / retouched / finals / admin' },
  ];

  if (booking.state === 'pre_production') {
    return {
      summary: 'Pre-production. Lock logistics, send call sheet.',
      nextAction: { label: 'Send call sheet & start shoot', intent: 'primary' },
      items,
    };
  }
  if (booking.state === 'shoot_live') {
    return {
      summary: 'Shoot is live. Track OT and expenses on the day.',
      nextAction: { label: 'Mark morning-after check', intent: 'primary' },
      items,
    };
  }
  // morning_after_check
  return {
    summary: 'Shoot wrapped. Run the morning-after check.',
    nextAction: { label: 'Complete morning-after check', intent: 'primary' },
    items,
  };
}

function deliveryChecklist(input: ChecklistInput): StageChecklist {
  const { booking, bookingTalent, bookingCrew } = input;
  const items: ChecklistItem[] = [
    { label: 'Final delivery sent',
      status: booking.final_delivery_at ? 'done' : 'pending' },
    { label: 'Invoice issued',
      status: booking.invoice_issued_at ? 'done' : 'pending' },
    { label: 'Client paid',
      status: booking.paid_at ? 'done' : 'pending' },
    { label: 'Talent paid out',
      status: bookingTalent.length === 0
        ? 'optional'
        : bookingTalent.every((t) => t.artist_paid_at) ? 'done'
        : booking.paid_at ? 'pending' : 'blocked',
      hint: 'Pay-on-paid — only after the client invoice clears' },
    { label: 'Crew paid out',
      status: bookingCrew.length === 0
        ? 'optional'
        : bookingCrew.every((c) => c.artist_paid_at) ? 'done'
        : booking.paid_at ? 'pending' : 'blocked',
      hint: 'Pay-on-paid — only after the client invoice clears' },
  ];

  if (booking.state === 'post_production') {
    return {
      summary: 'Post is rolling. Share selects, push retouches.',
      nextAction: { label: 'Mark final delivery', intent: 'primary' },
      items,
    };
  }
  if (booking.state === 'final_delivery') {
    return {
      summary: 'Delivered. Issue the invoice.',
      nextAction: { label: 'Issue invoice', intent: 'primary' },
      items,
    };
  }
  if (booking.state === 'invoice_issued') {
    return {
      summary: booking.paid_at
        ? 'Paid. Settle the talent and crew.'
        : 'Invoice out. Chase if payment lapses.',
      nextAction: booking.paid_at
        ? { label: 'Pay talent & crew', intent: 'primary' }
        : { label: 'Awaiting client payment', intent: 'wait' },
      items,
    };
  }
  // paid
  const allPaidOut = bookingTalent.every((t) => t.artist_paid_at)
    && bookingCrew.every((c) => c.artist_paid_at);
  return {
    summary: allPaidOut
      ? 'Everyone’s paid. Job done — you can close this out.'
      : 'Client paid. Settle the talent and crew.',
    nextAction: allPaidOut
      ? { label: 'Close booking', intent: 'primary' }
      : { label: 'Pay talent & crew', intent: 'primary' },
    items,
  };
}

function closedChecklist({ booking }: ChecklistInput): StageChecklist {
  const isCancelled = booking.state === 'cancelled';
  const isWrittenOff = booking.state === 'written_off';
  const isReleased = booking.state === 'released';

  if (isWrittenOff) {
    return {
      summary: 'Written off. Invoice unrecoverable — recorded for the corpus.',
      nextAction: null,
      items: [
        { label: 'Write-off reason captured',
          status: booking.cancellation_reason ? 'done' : 'optional' },
      ],
    };
  }

  const items: ChecklistItem[] = [
    { label: isCancelled ? 'Cancellation reason captured' : 'Release reason captured',
      status: (isCancelled ? booking.cancellation_reason : booking.release_reason)
        ? 'done' : 'optional' },
  ];
  if (isReleased) {
    items.push({ label: 'Won by (which agency)',
      status: booking.released_to ? 'done' : 'optional' });
  }
  if (isCancelled) {
    items.push({ label: 'Cancellation fee logged',
      status: booking.cancellation_fee != null && booking.cancellation_fee > 0 ? 'done' : 'optional' });
  }
  return {
    summary: isCancelled
      ? 'Booking cancelled. Recorded for the corpus.'
      : 'Booking released. Recorded for win-rate analytics.',
    nextAction: null,
    items,
  };
}
