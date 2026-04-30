export const BOOKING_STATES = [
  'brief_received', 'brief_parsed', 'quote_drafted', 'quote_sent',
  'artists_crew_held', 'quote_confirmed', 'pre_production',
  'shoot_live', 'morning_after_check', 'post_production',
  'final_delivery', 'invoice_issued', 'paid', 'released', 'cancelled'
] as const;

export const SHOOT_TIERS = [
  'campaign', 'content', 'lookbook_ecomm', 'arty_commission', 'editorial'
] as const;

export const CREW_TIERS = [
  'preferred_core', 'regular_freelance', 'never_again'
] as const;

export type BookingState = typeof BOOKING_STATES[number];
export type ShootTier = typeof SHOOT_TIERS[number];
export type CrewTier = typeof CREW_TIERS[number];

// AI agents tracked in cost dashboard
export const AGENTS = [
  { id: 'brief_intake', label: 'Brief Intake' },
  { id: 'booking', label: 'Booking' },
  { id: 'comms', label: 'Comms' },
  { id: 'finance', label: 'Finance' },
  { id: 'security_audit', label: 'Security/Audit' },
  { id: 'orchestrator', label: 'Orchestrator' },
] as const;

export type AgentId = typeof AGENTS[number]['id'];

// AI spend cap — hard ceiling expressed in AUD; cost rows are stored in USD.
export const MONTHLY_COST_CAP_AUD = 100;
// Indicative FX rate. Replace with a live rate fetch when budget tracking goes live.
export const USD_TO_AUD = 1.52;
export const MONTHLY_COST_CAP_USD = MONTHLY_COST_CAP_AUD / USD_TO_AUD;

// UI palette — keep in sync with globals.css
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
