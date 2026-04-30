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
