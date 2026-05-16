// =============================================================
// Atelier — Hand-curated database types
// =============================================================
//
// This file defines the application-facing shape of each table.
// It is HAND-MAINTAINED so we can express joins, narrow optional fields,
// and add JSDoc. To verify it stays in sync with the live schema, the
// canonical machine-generated types live next to it as
// `database.generated.ts` (regenerate with `npm run db:types`).
//
// `database.compat.test.ts` cross-checks the hand types against the
// generated ones — if Supabase adds/renames a column, the next CI run
// flags it instead of letting a runtime PostgREST error slip through
// (the working_name → name mismatch on listBookings was that exact bug).

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

// Enum types matching Postgres enums
export type BookingState =
  | 'brief_received' | 'brief_parsed' | 'quote_drafted' | 'quote_sent'
  | 'artists_crew_held' | 'quote_confirmed' | 'pre_production'
  | 'shoot_live' | 'morning_after_check' | 'post_production'
  | 'final_delivery' | 'invoice_issued' | 'paid'
  | 'released' | 'cancelled' | 'written_off';

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

/**
 * Tone / register to use in outbound emails to this client.
 * Separate from preferred_comms (channel).
 * null → defaults to 'casual' (Jasper's base voice).
 */
export type CommunicationStyle = 'formal' | 'casual' | 'terse';

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
  | 'studio_hire' | 'travel' | 'artist_travel' | 'catering' | 'wardrobe' | 'props'
  | 'casting' | 'location_fee' | 'permits' | 'insurance'
  | 'post_production' | 'overtime' | 'artist_overtime' | 'other_expense';

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
  /** Tone / register to use in outbound emails. null = casual (Jasper's base voice). */
  communication_style: CommunicationStyle | null;
  /** Physical/mailing address. */
  address: string | null;
  /** Additional contacts at this client (in-house producers, brand managers, etc.). */
  contacts: ClientContact[];
  /** Auto-created Drive folder for client material (signed letters, invoices). */
  drive_folder_id: string | null;
  drive_folder_link: string | null;
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
  /** Home base — used by talent list city filter. */
  city: string | null;
  /** Free text. Surfaced on call sheets. */
  dietary: string | null;
  /** Free text. Surfaced on call sheets. */
  drink_order: string | null;
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
  /** Suggested day rate — pre-fills the booking-team add form. */
  default_day_rate: number | null;
  /** Lower end of typical day rate range — for quoting context. */
  min_day_rate: number | null;
  /** Upper end of typical day rate range — for quoting context. */
  max_day_rate: number | null;
  /** Bank account name (as it appears on RCTI / remittance). */
  bank_account_name: string | null;
  /** BSB (6-digit sort code). */
  bank_bsb: string | null;
  /** Bank account number. */
  bank_account_number: string | null;
  is_active: boolean;
  notes: string | null;
  onboarding_completed: boolean;
  onboarding_token: string | null;
  /** Auto-created Drive folder for portfolio + non-PII material. */
  drive_folder_id: string | null;
  drive_folder_link: string | null;
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
  /** Home base — used by the crew list city filter (Sydney, Melbourne, ...). */
  city: string | null;
  /** Free text. "NIL", "VEGAN", "GF & DF", "No chicken". Surfaced on call sheets. */
  dietary: string | null;
  /** Free text. "Long black", "Strong oat cap". Surfaced on call sheets. */
  drink_order: string | null;
  home_address: string | null;
  dob: string | null;
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
  min_day_rate: number | null;
  max_day_rate: number | null;
  bank_account_name: string | null;
  bank_bsb: string | null;
  bank_account_number: string | null;
  is_active: boolean;
  notes: string | null;
  onboarding_completed: boolean;
  onboarding_token: string | null;
  onboarding_token_expires_at: string | null;
  /** Auto-created Drive folder for portfolio + non-PII material. */
  drive_folder_id: string | null;
  drive_folder_link: string | null;
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

export interface ClientContact {
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  /** Which brands/accounts this contact handles — useful at creative agencies. */
  brands?: string[];
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
  /** Planned crew start time on shoot day (HH:MM, local agency TZ). */
  call_time: string | null;
  /** Planned crew finish time on shoot day (HH:MM, local agency TZ). */
  wrap_time: string | null;
  talent_count: number | null;
  /** @deprecated UI removed 2026-05-12; column kept for brief parser write target. */
  talent_spec: string | null;
  deliverables_type: string | null;
  deliverables_count: number | null;
  /** @deprecated UI removed; UsageLicenceBuilder is the canonical usage source. */
  usage_media: UsageMedia[] | null;
  /** @deprecated UI removed; UsageLicenceBuilder is the canonical usage source. */
  usage_territory: UsageTerritory[] | null;
  /** @deprecated UI removed; UsageLicenceBuilder is the canonical usage source. */
  usage_duration_months: number | null;
  /** @deprecated UI removed; UsageLicenceBuilder is the canonical usage source. */
  usage_notes: string | null;
  tier: ShootTier;
  post_production_ownership: PostProductionOwnership | null;
  grade_retouch_scope: 'grade_and_retouch' | 'grade_only' | null;
  budget_indication: number | null;
  budget_currency: string;
  /** @deprecated UI removed 2026-05-12. */
  retouch_note_format: string | null;
  /** @deprecated UI removed 2026-05-12. */
  video_references: string | null;
  /** @deprecated UI removed 2026-05-12. */
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
  final_delivery_at: string | null;
  drive_root_id: string | null;
  drive_folder_ids: {
    briefs: string;
    selects: string;
    retouched: string;
    finals: string;
    admin: string;
  } | null;
  drive_root_link: string | null;
  calendar_event_id: string | null;
  /** Opaque UUID for the /q/[token] public quote link sent to clients. */
  quote_token: string;
  /** Public /q/<token> link returns 410 Gone after this timestamp. */
  quote_token_expires_at: string | null;
  /** Set automatically when the booking transitions to quote_sent. */
  quote_sent_at: string | null;
  /** Set automatically when the booking transitions to invoice_issued. */
  invoice_issued_at: string | null;
  /** Set automatically when the booking transitions to paid. */
  paid_at: string | null;
  /** Date by which the client must confirm or the booking is released. */
  confirmation_deadline: string | null;
  /** Days the quote is valid from issue — overrides agency default if set. */
  quote_validity_days: number | null;
  /** Primary production contact at the client/agency for this booking. */
  producer_name: string | null;
  producer_email: string | null;
  producer_phone: string | null;
  /** Client's purchase order number — appears on invoice. */
  po_number: string | null;
  /** Client or internal job/project number — appears on invoice. */
  job_number: string | null;
  /** Gmail message ID this booking was auto-converted from via /inbox.
   *  NULL for manually-created bookings. Drives the "Undo conversion"
   *  affordance on the booking detail page within 24h of creation. */
  source_gmail_message_id: string | null;
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
  /** Set when Atelier pays this artist. Null = not yet paid. */
  artist_paid_at: string | null;
  /** Mirrors booking_crew.status — talent can confirm/decline holds from their portal. */
  status: string;
  rate_accepted: boolean;
  rate_accepted_at: string | null;
  brief_acknowledged_at: string | null;
  confirmed_at: string | null;
  /** When the unconfirmed hold lapses. NULL once confirmed or for legacy rows. */
  hold_expires_at: string | null;
  // Joined
  talent?: Talent;
}

export interface BookingCrew {
  id: string;
  /** When the crew member was added to the booking. Used to order the team strip left→right. */
  created_at: string;
  booking_id: string;
  crew_id: string;
  talent_id: string | null;
  role_on_booking: string | null;
  day_rate: number | null;
  status: string;
  confirmed_at: string | null;
  notes: string | null;
  /** Set when Atelier pays this crew member. Null = not yet paid. */
  artist_paid_at: string | null;
  /** Per-day assignment for multi-day shoots. NULL/empty = all days. */
  assigned_dates: string[] | null;
  /** When the unconfirmed hold lapses. NULL once confirmed or for legacy rows. */
  hold_expires_at: string | null;
  /** Per-day rate override. Shape: { "YYYY-MM-DD": amount }. Falls back to day_rate. */
  assigned_dates_rate_overrides: Record<string, number>;
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
  /** What the client is billed for this line. Drives line_total / ASF / GST / super charged. */
  subtotal: number;
  /**
   * Optional: actual amount paid to the payee, when different from billed `subtotal`.
   * NULL = same as subtotal (paid = billed). When set, drives the paid-out side of
   * the engine (commission, super to fund, input credits) while `subtotal` continues
   * to drive the client-invoice side. Captured spread flows into agency margin.
   */
  cost_subtotal: number | null;
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
  /** Expense the artist fronted; passed through to client and reimbursed at payment. No commission. */
  is_artist_reimbursement: boolean;
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

export type StudioType =
  | 'photo_studio' | 'film_studio' | 'outdoor' | 'retail'
  | 'residential' | 'venue' | 'other';

/** Individual room within a multi-room studio location. */
export interface StudioRoom {
  id: string;
  name: string;
  half_day_rate: number | null;
  full_day_rate: number | null;
  weekend_surcharge_pct: number | null;
  square_metres: number | null;
  max_capacity: number | null;
  features: string[];
  notes: string | null;
}

export interface Location {
  id: string;
  created_at: string;
  updated_at: string;

  name: string;
  alias: string | null;
  studio_type: StudioType;

  address: string | null;
  suburb: string | null;
  state: string;
  postcode: string | null;

  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;

  half_day_rate: number | null;
  full_day_rate: number | null;
  weekend_surcharge_pct: number | null;
  rate_notes: string | null;

  facilities: string[] | null;
  parking_notes: string | null;
  access_notes: string | null;
  square_metres: number | null;
  max_capacity: number | null;

  notes: string | null;
  is_active: boolean;
  /** Individual room specs for multi-room studios (photo_studio / film_studio). */
  studio_rooms: StudioRoom[] | null;
  /** Google Drive folder ID for this location (auto-created on save). */
  drive_folder_id: string | null;
  /** Shareable Drive link shown in the location detail view. */
  drive_folder_link: string | null;
  /** Decimal degrees, geocoded from address. NULL when not yet geocoded. */
  latitude: number | null;
  longitude: number | null;
  /** The address string we last geocoded against — used to detect changes. */
  geocoded_address: string | null;
  /** User-defined free-form tags. Reused via getAllLocationTags() for autocomplete. */
  tags: string[] | null;
}

export interface BusinessRenewal {
  id: string;
  created_at: string;
  updated_at: string;
  type: string;
  label: string;
  expires_at: string;
  notes: string | null;
  reminder_queued_at: string | null;
  is_archived: boolean;
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

export interface CrewUnavailability {
  id: string;
  created_at: string;
  crew_id: string;
  date_from: string;
  date_to: string;
  reason: string | null;
}

export interface TalentUnavailability {
  id: string;
  created_at: string;
  talent_id: string;
  date_from: string;
  date_to: string;
  reason: string | null;
}

export interface Task {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  assigned_to: string | null;
  title: string;
  description: string | null;
  due_at: string | null;
  completed_at: string | null;
  booking_id: string | null;
  talent_id: string | null;
  crew_id: string | null;
}

export interface BookingSchedule {
  id: string;
  created_at: string;
  booking_id: string;
  schedule_date: string;
  call_time: string | null;
  wrap_time: string | null;
  location: string | null;
  notes: string | null;
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
