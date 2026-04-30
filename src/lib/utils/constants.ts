import type { BookingState, ShootTier, CrewTier, AgentName, FeeLineType } from '@/lib/types/database';

// Ordered booking states for the state machine
export const BOOKING_STATES: readonly BookingState[] = [
  'brief_received', 'brief_parsed', 'quote_drafted', 'quote_sent',
  'artists_crew_held', 'quote_confirmed', 'pre_production',
  'shoot_live', 'morning_after_check', 'post_production',
  'final_delivery', 'invoice_issued', 'paid',
  'released', 'cancelled',
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
};

// Valid state transitions (from → allowed next states)
export const STATE_TRANSITIONS: Record<BookingState, BookingState[]> = {
  brief_received: ['brief_parsed', 'released'],
  brief_parsed: ['quote_drafted', 'released'],
  quote_drafted: ['quote_sent', 'released'],
  quote_sent: ['artists_crew_held', 'released'],
  artists_crew_held: ['quote_confirmed', 'released'],
  quote_confirmed: ['pre_production', 'cancelled'],
  pre_production: ['shoot_live', 'cancelled'],
  shoot_live: ['morning_after_check', 'cancelled'],
  morning_after_check: ['post_production'],
  post_production: ['final_delivery'],
  final_delivery: ['invoice_issued'],
  invoice_issued: ['paid'],
  paid: [],
  released: [],
  cancelled: [],
};

// State categories for filtering
export const ACTIVE_STATES: BookingState[] = [
  'brief_received', 'brief_parsed', 'quote_drafted', 'quote_sent',
  'artists_crew_held', 'quote_confirmed', 'pre_production',
  'shoot_live', 'morning_after_check', 'post_production',
  'final_delivery', 'invoice_issued',
];

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

// UI palette
export const PALETTE = {
  bg: '#0f1117',
  surface: '#1a1d27',
  border: '#2e3347',
  accent: '#6c8aff',
  text: '#e8eaed',
  muted: '#9aa0b4',
  danger: '#f87171',
  warning: '#fbbf24',
  success: '#4ade80',
} as const;

// State colours for badges
export const STATE_COLORS: Record<BookingState, string> = {
  brief_received: '#6c8aff',
  brief_parsed: '#818cf8',
  quote_drafted: '#a78bfa',
  quote_sent: '#c084fc',
  artists_crew_held: '#e879f9',
  quote_confirmed: '#4ade80',
  pre_production: '#34d399',
  shoot_live: '#fbbf24',
  morning_after_check: '#fb923c',
  post_production: '#f97316',
  final_delivery: '#38bdf8',
  invoice_issued: '#22d3ee',
  paid: '#4ade80',
  released: '#9aa0b4',
  cancelled: '#f87171',
};
