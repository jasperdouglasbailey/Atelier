// =============================================================
// Atelier — Auto-generated-style types matching Supabase schema
// =============================================================

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

// Enum types matching Postgres enums
export type BookingState =
  | 'brief_received' | 'brief_parsed' | 'quote_drafted' | 'quote_sent'
  | 'artists_crew_held' | 'quote_confirmed' | 'pre_production'
  | 'shoot_live' | 'morning_after_check' | 'post_production'
  | 'final_delivery' | 'invoice_issued' | 'paid'
  | 'released' | 'cancelled';

export type ShootTier =
  | 'campaign' | 'content' | 'lookbook_ecomm' | 'arty_commission' | 'editorial'
  | 'pr_press' | 'corporate' | 'event' | 'still_life' | 'fashion_film' | 'pre_production_only';

export type CrewTier = 'preferred_core' | 'regular_freelance' | 'never_again';

/**
 * Artist disciplines — what kind of creative this person is.
 * Saunders & Co represents creatives, not models. Locked in
 * supabase/migrations/0002_artist_disciplines.sql.
 */
export type ArtistDiscipline =
  | 'photographer'
  | 'videographer'
  | 'wardrobe_stylist'
  | 'hair'
  | 'makeup'
  | 'hair_and_makeup'
  | 'manicurist';

/** How this person prefers to be contacted. */
export type PreferredComms = 'email' | 'sms' | 'imessage' | 'phone' | 'whatsapp';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type AgentName = 'orchestrator' | 'brief_intake' | 'booking' | 'comms' | 'finance' | 'client' | 'marketing' | 'security_audit';
export type UsageMedia =
  | 'all_media' | 'all_print' | 'all_digital'
  | 'ooh' | 'press' | 'brochures' | 'packaging' | 'pos' | 'direct_mail' | 'posters' | 'collateral' | 'pr_print'
  | 'social_media' | 'company_website' | 'regional_website' | 'internet_advertising' | 'digital_posters'
  | 'digital_direct_mail' | 'mobile' | 'intranet' | 'pr_digital' | 'tv'
  | 'ambient' | 'marketing_aids';

export type UsageTerritory =
  | 'worldwide' | 'australia' | 'oceania'
  | 'usa' | 'north_america' | 'europe_all' | 'europe_eu' | 'europe_non_eu'
  | 'uk' | 'asia_incl_japan' | 'asia_excl_japan' | 'middle_east' | 'africa'
  | 'south_america' | 'central_america' | 'caribbean' | 'nordics' | 'latin_america'
  | 'cee' | 'mea' | 'emea' | 'uae' | 'gcc' | 'amet';

export type FeeLineType =
  | 'artist_fee' | 'usage_licence' | 'file_management' | 'retouching'
  | 'crew_labour' | 'crew_equipment' | 'equipment_rental'
  | 'studio_hire' | 'travel' | 'catering' | 'wardrobe' | 'props'
  | 'casting' | 'location_fee' | 'permits' | 'insurance'
  | 'post_production' | 'overtime' | 'other_expense';

export type PostProductionOwnership = 'us_via_artist' | 'us_via_post_team' | 'client_in_house' | 'client_outsourced';

// =============================================================
// Row types
// =============================================================

export interface Client {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  abn: string | null;
  is_creative_agency: boolean;
  parent_company_id: string | null;
  payment_terms_days: number | null;
  notes: string | null;
  avg_doi_days: number | null;
  /** How this client prefers to be contacted. */
  preferred_comms: string | null;
}

export interface Brand {
  id: string;
  created_at: string;
  name: string;
  industry: string | null;
  notes: string | null;
}

export interface Talent {
  id: string;
  created_at: string;
  updated_at: string;
  legal_name: string;
  working_name: string;
  /** What this artist does. Required after migration 0002. */
  discipline: ArtistDiscipline;
  /** Free-text sub-niche, e.g. "fashion editorial", "product still life", "swimwear". */
  specialty: string | null;
  /** How this artist prefers to be contacted. Free-text but UI uses PreferredComms enum. */
  preferred_comms: string | null;
  pronouns: string | null;
  dob: string | null;
  mobile: string | null;
  email: string | null;
  home_address: string | null;
  emergency_name: string | null;
  emergency_relationship: string | null;
  emergency_mobile: string | null;
  emergency_email: string | null;
  abn: string | null;
  gst_registered: boolean;
  entity_type: string | null;
  representation_status: string | null;
  work_rights: string | null;
  visa_expiry: string | null;
  xero_contact_id: string | null;
  bank_setup_in_xero: boolean;
  super_fund_name: string | null;
  super_member_number: string | null;
  super_usi: string | null;
  passport_expiry: string | null;
  drivers_licence_expiry: string | null;
  wwcc_number: string | null;
  wwcc_expiry: string | null;
  instagram: string | null;
  website: string | null;
  is_active: boolean;
  notes: string | null;
  onboarding_completed: boolean;
  onboarding_token: string | null;
}

export interface Crew {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  email: string | null;
  mobile: string | null;
  /** How this crew member prefers to be contacted. */
  preferred_comms: string | null;
  abn: string | null;
  gst_registered: boolean;
  primary_role: string | null;
  secondary_roles: string[] | null;
  tier: CrewTier;
  xero_contact_id: string | null;
  bank_setup_in_xero: boolean;
  super_fund_name: string | null;
  super_member_number: string | null;
  super_usi: string | null;
  kit_list: string | null;
  certifications: string[] | null;
  default_day_rate: number | null;
  is_active: boolean;
  notes: string | null;
  onboarding_completed: boolean;
  onboarding_token: string | null;
}

export interface Campaign {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  client_id: string | null;
  brand_id: string | null;
  year: number | null;
  season: string | null;
  notes: string | null;
}

export interface BriefContact {
  name: string;
  email: string;
  phone?: string;
  role?: string;
}

export interface SplitInvoiceEntry {
  payer_client_id: string;
  amount_or_pct: number;
  type: '$' | '%';
}

export interface Booking {
  id: string;
  created_at: string;
  updated_at: string;
  booking_ref: string | null;
  state: BookingState;
  campaign_id: string | null;
  client_id: string | null;
  brand_id: string | null;
  creative_agency_id: string | null;
  contacts: BriefContact[];
  title: string;
  shoot_location: string | null;
  shoot_dates: string | null; // daterange as string
  shoot_date_notes: string | null;
  talent_count: number | null;
  talent_spec: string | null;
  deliverables_type: string | null;
  deliverables_count: number | null;
  usage_media: UsageMedia[] | null;
  usage_territory: UsageTerritory[] | null;
  usage_duration_months: number | null;
  usage_notes: string | null;
  tier: ShootTier;
  post_production_ownership: PostProductionOwnership | null;
  budget_indication: number | null;
  budget_currency: string;
  retouch_note_format: string | null;
  video_references: string | null;
  wardrobe_responsibility: string | null;
  looks_per_talent: number | null;
  subtotal: number;
  total_gst: number;
  total_asf: number;
  grand_total: number;
  ot_expenses_window_end: string | null;
  ot_expenses_locked: boolean;
  split_invoicing: SplitInvoiceEntry[] | null;
  cancellation_reason: string | null;
  cancellation_fee: number | null;
  release_reason: string | null;
  released_to: string | null;
  agency_notes: string | null;
  brief_raw_text: string | null;
  selects_cadence: string | null;
  client_delivery_date: string | null;
  created_by: string | null;
}

export interface BookingTalent {
  id: string;
  booking_id: string;
  talent_id: string;
  role_on_booking: string;
  day_rate: number | null;
  half_day_rate: number | null;
  usage_fee: number | null;
  confirmed: boolean;
  notes: string | null;
  // Joined
  talent?: Talent;
}

export interface BookingCrew {
  id: string;
  booking_id: string;
  crew_id: string;
  talent_id: string | null;
  role_on_booking: string | null;
  day_rate: number | null;
  status: string;
  confirmed_at: string | null;
  notes: string | null;
  // Joined
  crew?: Crew;
}

export interface QuoteVersion {
  id: string;
  created_at: string;
  booking_id: string;
  version: number;
  status: string;
  subtotal: number;
  total_asf: number;
  total_gst: number;
  total_super: number;
  grand_total: number;
  currency: string;
  notes: string | null;
  diff_from_previous: Json | null;
  sent_at: string | null;
  accepted_at: string | null;
}

export interface FeeLine {
  id: string;
  created_at: string;
  quote_version_id: string;
  booking_id: string;
  line_type: FeeLineType;
  description: string;
  talent_id: string | null;
  crew_id: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  asf_rate: number;
  asf_amount: number;
  is_gst_exempt: boolean;
  is_super_bearing: boolean;
  super_rate_charged: number;
  super_rate_paid: number;
  is_commissionable: boolean;
  commission_rate: number;
  sort_order: number;
  notes: string | null;
}

export interface UsageLicence {
  id: string;
  created_at: string;
  booking_id: string;
  talent_id: string | null;
  media: UsageMedia[];
  territory: UsageTerritory[];
  duration_months: number;
  start_date: string | null;
  end_date: string | null;
  bur_multiplier: number | null;
  fee: number;
  notes: string | null;
}

export interface AtelierEvent {
  id: string;
  created_at: string;
  event_type: string;
  booking_id: string | null;
  actor: string | null;
  payload: Json;
  idempotency_key: string | null;
}

export interface Approval {
  id: string;
  created_at: string;
  updated_at: string;
  agent: AgentName;
  action_type: string;
  booking_id: string | null;
  summary: string;
  draft_content: Json;
  status: ApprovalStatus;
  decided_at: string | null;
  decided_by: string | null;
  rejection_reason: string | null;
  confidence: number | null;
  uncertainty_sources: string[] | null;
  precedent_refs: string[] | null;
  idempotency_key: string | null;
  // Joined
  booking?: Booking;
}

export interface KillSwitchState {
  id: string;
  is_active: boolean;
  pause_outbound: boolean;
  updated_at: string;
  updated_by: string | null;
}

export interface AuditLogRow {
  id: string;
  created_at: string;
  user_id: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  old_value: Json | null;
  new_value: Json | null;
  ip_address: string | null;
}

export interface LLMCallRow {
  id: string;
  created_at: string;
  agent_name: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  booking_id: string | null;
  duration_ms: number | null;
}
