import type { BookingState, ShootTier, CrewTier, AgentName, FeeLineType, ArtistDiscipline, PreferredComms, CommunicationStyle } from '@/lib/types/database';

// Ordered booking states for the state machine
export const BOOKING_STATES: readonly BookingState[] = [
  'brief_received', 'brief_parsed', 'quote_drafted', 'quote_sent',
  'artists_crew_held', 'quote_confirmed', 'pre_production',
  'shoot_live', 'morning_after_check', 'post_production',
  'final_delivery', 'invoice_issued', 'paid',
  'released', 'cancelled', 'written_off',
] as const;

// Human-readable labels
export const BOOKING_STATE_LABELS: Record<BookingState, string> = {
  brief_received: 'Brief Received',
  brief_parsed: 'Brief Parsed',
  quote_drafted: 'Quote Drafted',
  quote_sent: 'Quote Sent',
  artists_crew_held: 'Artists & Crew Held',
  quote_confirmed: 'Quote Confirmed',
  pre_production: 'Pre-Production',
  shoot_live: 'Shoot Live',
  morning_after_check: 'Morning-After Check',
  post_production: 'Post-Production',
  final_delivery: 'Final Delivery',
  invoice_issued: 'Invoice Issued',
  paid: 'Paid',
  released: 'Released',
  cancelled: 'Cancelled',
  written_off: 'Written Off',
};

// Valid state transitions (from → allowed next states)
export const STATE_TRANSITIONS: Record<BookingState, BookingState[]> = {
  brief_received: ['brief_parsed', 'released'],
  brief_parsed: ['quote_drafted', 'released'],
  quote_drafted: ['quote_sent', 'released'],
  quote_sent: ['artists_crew_held', 'quote_confirmed', 'released', 'quote_drafted'],
  artists_crew_held: ['quote_confirmed', 'released'],
  quote_confirmed: ['pre_production', 'cancelled'],
  pre_production: ['shoot_live', 'cancelled'],
  shoot_live: ['morning_after_check', 'cancelled'],
  morning_after_check: ['post_production'],
  post_production: ['final_delivery'],
  final_delivery: ['invoice_issued'],
  invoice_issued: ['paid', 'written_off'],
  paid: [],
  released: [],
  cancelled: [],
  written_off: [],
};

// State categories for filtering
export const ACTIVE_STATES: BookingState[] = [
  'brief_received', 'brief_parsed', 'quote_drafted', 'quote_sent',
  'artists_crew_held', 'quote_confirmed', 'pre_production',
  'shoot_live', 'morning_after_check', 'post_production',
  'final_delivery', 'invoice_issued',
];

export const TERMINAL_STATES: BookingState[] = ['paid', 'released', 'cancelled', 'written_off'];

export const SHOOT_TIERS: readonly ShootTier[] = [
  'campaign', 'content', 'lookbook_ecomm', 'arty_commission', 'editorial',
  'pr_press', 'corporate', 'event', 'still_life', 'fashion_film', 'pre_production_only',
] as const;

export const SHOOT_TIER_LABELS: Record<ShootTier, string> = {
  campaign: 'Campaign',
  content: 'Content',
  lookbook_ecomm: 'Lookbook / eComm',
  arty_commission: 'Arty Commission',
  editorial: 'Editorial',
  pr_press: 'PR / Press',
  corporate: 'Corporate',
  event: 'Event',
  still_life: 'Still Life',
  fashion_film: 'Fashion Film',
  pre_production_only: 'Pre-Production Only',
};

export const CREW_TIERS: readonly CrewTier[] = [
  'preferred_core', 'regular_freelance', 'never_again',
] as const;

export const CREW_TIER_LABELS: Record<CrewTier, string> = {
  preferred_core: 'Preferred Core',
  regular_freelance: 'Regular Freelance',
  never_again: 'Never Again',
};

// ============================================================
// Artist disciplines — what kind of creative this person is.
// Saunders & Co represents creatives, not models. Locked in
// supabase/migrations/0002_artist_disciplines.sql.
// ============================================================

export const ARTIST_DISCIPLINES: ArtistDiscipline[] = [
  'photographer',
  'videographer',
  'wardrobe_stylist',
  'hair',
  'makeup',
  'hair_and_makeup',
  'manicurist',
];

export const ARTIST_DISCIPLINE_LABELS: Record<ArtistDiscipline, string> = {
  photographer: 'Photographer',
  videographer: 'Videographer',
  wardrobe_stylist: 'Wardrobe Stylist',
  hair: 'Hair',
  makeup: 'Makeup',
  hair_and_makeup: 'Hair & Makeup',
  manicurist: 'Manicurist',
};

// ============================================================
// Preferred comms — how each person likes to be contacted
// ============================================================

export const PREFERRED_COMMS_OPTIONS: PreferredComms[] = [
  'email', 'sms', 'imessage', 'phone', 'whatsapp',
];

export const PREFERRED_COMMS_LABELS: Record<PreferredComms, string> = {
  email: 'Email',
  sms: 'SMS',
  imessage: 'iMessage',
  phone: 'Phone call',
  whatsapp: 'WhatsApp',
};

export const COMMUNICATION_STYLE_OPTIONS: CommunicationStyle[] = ['formal', 'casual', 'terse'];

export const COMMUNICATION_STYLE_LABELS: Record<CommunicationStyle, string> = {
  formal:  'Formal — full prose, professional register',
  casual:  'Casual — direct, concise (Jasper\'s base voice)',
  terse:   'Terse — very brief, minimum words',
};

export const AGENTS: { id: AgentName; label: string }[] = [
  { id: 'orchestrator', label: 'Orchestrator' },
  { id: 'brief_intake', label: 'Brief Intake' },
  { id: 'booking', label: 'Booking' },
  { id: 'comms', label: 'Comms' },
  { id: 'finance', label: 'Finance' },
  { id: 'client', label: 'Client' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'security_audit', label: 'Security/Audit' },
];

export const FEE_LINE_TYPE_LABELS: Record<FeeLineType, string> = {
  artist_fee: 'Artist Fee',
  usage_licence: 'Usage Licence',
  file_management: 'File Management',
  retouching: 'Retouching',
  crew_labour: 'Crew Labour',
  crew_equipment: 'Crew Equipment',
  equipment_rental: 'Equipment Rental',
  studio_hire: 'Studio Hire',
  travel: 'Travel',
  catering: 'Catering',
  wardrobe: 'Wardrobe',
  props: 'Props',
  casting: 'Casting',
  location_fee: 'Location Fee',
  permits: 'Permits',
  insurance: 'Insurance',
  post_production: 'Post-Production',
  overtime: 'Overtime',
  other_expense: 'Other Expense',
};

// Budget
export const MONTHLY_COST_CAP_AUD = 100;
export const USD_TO_AUD = 1.52;
export const MONTHLY_COST_CAP_USD = MONTHLY_COST_CAP_AUD / USD_TO_AUD;

// Fee engine constants
export const DEFAULT_COMMISSION_RATE = 0.20;
export const DEFAULT_ASF_RATE = 0.15;
export const GST_RATE = 0.10;
export const SUPER_RATE_CHARGED = 0.15;
export const SUPER_RATE_PAID = 0.12;
export const OT_EXPENSES_WINDOW_DAYS = 7;

// Day rate structure
export const FULL_DAY_HOURS = 10;
export const HALF_DAY_HOURS = 5;
export const OT_GRACE_MINUTES = 30;
export const ARTIST_OT_MULTIPLIER = 1.0;
export const CREW_OT_MULTIPLIER = 1.5;
export const OT_INCREMENT_MINUTES = 15;

// Crew roles
export const CREW_ROLES = [
  'digital_operator', 'assistant', 'stylist', 'hmua',
  'producer', 'art_director', 'set_designer', 'prop_stylist',
  'retoucher', 'video_operator', 'gaffer', 'grip',
] as const;

// Crew booking status (atelier_booking_crew.status)
export const CREW_STATUS_OPTIONS = [
  'hold_requested',
  'sent',
  'confirmed',
  'declined',
  'released',
] as const;
export type CrewStatus = typeof CREW_STATUS_OPTIONS[number];

export const CREW_STATUS_LABELS: Record<CrewStatus, string> = {
  hold_requested: 'Hold requested',
  sent: 'Hold sent',
  confirmed: 'Confirmed',
  declined: 'Declined',
  released: 'Released',
};

// UI palette — editorial warm-cream system from spec §3.
// Sand (#C4A882) is the only accent. No blues. No purples.
export const PALETTE = {
  // Themed via CSS vars (dark/light toggle swaps :root values)
  bg:       'var(--p-bg)',
  surface:  'var(--p-surface)',
  border:   'var(--p-border)',
  text:     'var(--p-text)',
  muted:    'var(--p-muted)',
  mid2:     'var(--p-mid-2)',
  // Opacity variants — pre-computed in CSS, always up-to-date with theme
  bgSoft:   'var(--p-bg-soft)',
  bgHigh:   'var(--p-bg-high)',
  // Accent — sand only
  accent:   '#C4A882',
  accentDk: '#B09470',
  // Status semantics
  ok:       'var(--p-ok)',
  okBg:     'var(--p-ok-bg)',
  warn:     'var(--p-warn)',
  warnBg:   'var(--p-warn-bg)',
  danger:   'var(--p-danger)',
  dangerBg: 'var(--p-danger-bg)',
  // Legacy aliases — kept for code written before the redesign
  warning: 'var(--p-warn)',
  success: 'var(--p-ok)',
  // Dim opaque fills for kill-switch banners — always dark regardless of theme
  dangerFill:        '#7f1d1d',
  dangerFillDim:     '#3d1a1a',
  dangerFillBorder:  '#5c2626',
  warningFill:       '#854d0e',
  warningFillDim:    '#3d2e0f',
  warningFillBorder: '#6b4f1a',
} as const;

// State colours for badges — semantic only, no blues or purples (spec §3.3)
export const STATE_COLORS: Record<BookingState, string> = {
  // Enquiry — neutral ink tones
  brief_received:      '#9A9590',
  brief_parsed:        '#6B6862',
  // Quote — sand accent signals active deal-making
  quote_drafted:       '#C4A882',
  quote_sent:          '#B09470',
  artists_crew_held:   '#B09470',
  quote_confirmed:     '#3D7A5A',
  // Production — green for prep, amber for live shoot
  pre_production:      '#3D7A5A',
  shoot_live:          '#B06A00',
  morning_after_check: '#B06A00',
  // Delivery — muted ink for post work, sand for invoicing
  post_production:     '#6B6862',
  final_delivery:      '#6B6862',
  invoice_issued:      '#C4A882',
  paid:                '#3D7A5A',
  // Closed states
  released:            '#9A9590',
  cancelled:           '#C0392B',
  written_off:         '#C0392B',
};

// ============================================================
// Query limits — central place to tune list-page sizes and
// auto-complete result caps. Was previously sprinkled as magic
// numbers (50, 8) across data layer files.
// ============================================================

export const QUERY_LIMITS = {
  /** Max approval rows fetched for an inbox view. */
  approvals_inbox: 50,
  /** Max client matches when searching by name/company on the bookings list. */
  bookings_client_search: 50,
  /** Max events surfaced on a booking detail page. */
  booking_events: 50,
  /** Default size for "top N" report sections (top clients, top talent). */
  reports_top_n: 8,
  /** Max items returned by a generic typeahead. */
  typeahead: 20,
} as const;

// ============================================================
// Confidence buckets — sample-size doctrine for corpus signals.
// n < low → 'low', low-1 to strong-1 → 'ok', ≥ strong → 'strong'.
// Master CLAUDE.md: "<3 = low confidence" — this codifies it.
// ============================================================

export const CONFIDENCE_THRESHOLDS = {
  ok: 3,      // n >= 3 graduates from 'low' to 'ok'
  strong: 10, // n >= 10 graduates from 'ok' to 'strong'
} as const;

export function bucketConfidence(n: number): 'low' | 'ok' | 'strong' {
  if (n >= CONFIDENCE_THRESHOLDS.strong) return 'strong';
  if (n >= CONFIDENCE_THRESHOLDS.ok) return 'ok';
  return 'low';
}
