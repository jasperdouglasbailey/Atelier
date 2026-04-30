-- =============================================================
-- Atelier — initial schema (idempotent, safe to re-run)
-- Recreated from the canonical Cowork schema (Apr 2026).
--
-- Apply via: Supabase Dashboard → SQL Editor → paste this whole
-- file → Run. Project: tokngeuenmfkemrnrqsc (Atelier / Free).
-- =============================================================

-- ---------- Enums ---------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.atelier_agent_name AS ENUM
    ('orchestrator','brief_intake','booking','comms','finance','client','marketing','security_audit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.atelier_approval_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.atelier_booking_state AS ENUM
    ('brief_received','brief_parsed','quote_drafted','quote_sent',
     'artists_crew_held','quote_confirmed','pre_production','shoot_live',
     'morning_after_check','post_production','final_delivery','invoice_issued',
     'paid','released','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.atelier_crew_tier AS ENUM ('preferred_core','regular_freelance','never_again');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.atelier_fee_line_type AS ENUM
    ('artist_fee','usage_licence','file_management','retouching','crew_labour',
     'crew_equipment','equipment_rental','studio_hire','travel','catering',
     'wardrobe','props','casting','location_fee','permits','insurance',
     'post_production','overtime','other_expense');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.atelier_post_production_ownership AS ENUM
    ('us_via_artist','us_via_post_team','client_in_house','client_outsourced');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.atelier_shoot_tier AS ENUM
    ('campaign','content','lookbook_ecomm','arty_commission','editorial',
     'pr_press','corporate','event','still_life','fashion_film','pre_production_only');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.atelier_usage_media AS ENUM
    ('all_media','all_print','all_digital','ooh','press','brochures','packaging',
     'pos','direct_mail','posters','collateral','pr_print','social_media',
     'company_website','regional_website','internet_advertising','digital_posters',
     'digital_direct_mail','mobile','intranet','pr_digital','tv','ambient','marketing_aids');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.atelier_usage_territory AS ENUM
    ('worldwide','australia','oceania','usa','north_america','europe_all',
     'europe_eu','europe_non_eu','uk','asia_incl_japan','asia_excl_japan',
     'middle_east','africa','south_america','central_america','caribbean',
     'nordics','latin_america','cee','mea','emea','uae','gcc','amet');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ---------- Helper functions ---------------------------------
CREATE OR REPLACE FUNCTION public.atelier_set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.atelier_generate_booking_ref() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE next_num integer;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(booking_ref FROM 6) AS integer)), 0) + 1
    INTO next_num FROM atelier_bookings WHERE booking_ref IS NOT NULL;
  NEW.booking_ref := 'BOOK-' || LPAD(next_num::text, 4, '0');
  RETURN NEW;
END; $$;


-- ---------- Tables (FK-safe order) ---------------------------

CREATE TABLE IF NOT EXISTS public.atelier_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  email text, phone text, company text, abn text,
  is_creative_agency boolean NOT NULL DEFAULT false,
  parent_company_id uuid REFERENCES public.atelier_clients(id),
  payment_terms_days integer DEFAULT 30,
  notes text, avg_doi_days numeric,
  UNIQUE (name, company)
);

CREATE TABLE IF NOT EXISTS public.atelier_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL UNIQUE,
  industry text, notes text
);

CREATE TABLE IF NOT EXISTS public.atelier_client_brands (
  client_id uuid NOT NULL REFERENCES public.atelier_clients(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.atelier_brands(id) ON DELETE CASCADE,
  PRIMARY KEY (client_id, brand_id)
);

CREATE TABLE IF NOT EXISTS public.atelier_talent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  legal_name text NOT NULL,
  working_name text NOT NULL,
  pronouns text, dob date, mobile text, email text,
  home_address text,
  emergency_name text, emergency_relationship text,
  emergency_mobile text, emergency_email text,
  abn text, gst_registered boolean DEFAULT false,
  entity_type text,
  representation_status text DEFAULT 'exclusive',
  work_rights text, visa_expiry date,
  xero_contact_id text, bank_setup_in_xero boolean DEFAULT false,
  super_fund_name text, super_member_number text, super_usi text,
  passport_expiry date, drivers_licence_expiry date,
  wwcc_number text, wwcc_expiry date,
  instagram text, website text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  onboarding_completed boolean DEFAULT false,
  onboarding_token text UNIQUE
);

CREATE TABLE IF NOT EXISTS public.atelier_crew (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  email text, mobile text, abn text,
  gst_registered boolean DEFAULT false,
  primary_role text, secondary_roles text[],
  tier public.atelier_crew_tier NOT NULL DEFAULT 'regular_freelance',
  xero_contact_id text, bank_setup_in_xero boolean DEFAULT false,
  super_fund_name text, super_member_number text, super_usi text,
  kit_list text, certifications text[],
  default_day_rate numeric,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  onboarding_completed boolean DEFAULT false,
  onboarding_token text UNIQUE
);

CREATE TABLE IF NOT EXISTS public.atelier_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  client_id uuid REFERENCES public.atelier_clients(id),
  brand_id uuid REFERENCES public.atelier_brands(id),
  year integer, season text, notes text
);

CREATE TABLE IF NOT EXISTS public.atelier_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  booking_ref text UNIQUE,
  state public.atelier_booking_state NOT NULL DEFAULT 'brief_received',
  campaign_id uuid REFERENCES public.atelier_campaigns(id),
  client_id uuid REFERENCES public.atelier_clients(id),
  brand_id uuid REFERENCES public.atelier_brands(id),
  creative_agency_id uuid REFERENCES public.atelier_clients(id),
  contacts jsonb DEFAULT '[]'::jsonb,
  title text NOT NULL,
  shoot_location text,
  shoot_dates daterange,
  shoot_date_notes text,
  talent_count integer, talent_spec text,
  deliverables_type text, deliverables_count integer,
  usage_media public.atelier_usage_media[],
  usage_territory public.atelier_usage_territory[],
  usage_duration_months integer, usage_notes text,
  tier public.atelier_shoot_tier NOT NULL DEFAULT 'content',
  post_production_ownership public.atelier_post_production_ownership,
  budget_indication numeric, budget_currency text DEFAULT 'AUD',
  retouch_note_format text, video_references text,
  wardrobe_responsibility text, looks_per_talent integer,
  subtotal numeric DEFAULT 0,
  total_gst numeric DEFAULT 0,
  total_asf numeric DEFAULT 0,
  grand_total numeric DEFAULT 0,
  ot_expenses_window_end timestamptz,
  ot_expenses_locked boolean DEFAULT false,
  split_invoicing jsonb,
  cancellation_reason text, cancellation_fee numeric,
  release_reason text, released_to text,
  agency_notes text, brief_raw_text text,
  selects_cadence text, client_delivery_date date,
  created_by text
);

CREATE TABLE IF NOT EXISTS public.atelier_booking_talent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.atelier_bookings(id) ON DELETE CASCADE,
  talent_id uuid NOT NULL REFERENCES public.atelier_talent(id),
  role_on_booking text DEFAULT 'photographer',
  day_rate numeric, half_day_rate numeric, usage_fee numeric,
  confirmed boolean DEFAULT false,
  notes text,
  UNIQUE (booking_id, talent_id)
);

CREATE TABLE IF NOT EXISTS public.atelier_booking_crew (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.atelier_bookings(id) ON DELETE CASCADE,
  crew_id uuid NOT NULL REFERENCES public.atelier_crew(id),
  talent_id uuid REFERENCES public.atelier_talent(id),
  role_on_booking text, day_rate numeric,
  status text DEFAULT 'hold_requested',
  confirmed_at timestamptz, notes text,
  UNIQUE (booking_id, crew_id)
);

CREATE TABLE IF NOT EXISTS public.atelier_quote_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  booking_id uuid NOT NULL REFERENCES public.atelier_bookings(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  subtotal numeric NOT NULL DEFAULT 0,
  total_asf numeric NOT NULL DEFAULT 0,
  total_gst numeric NOT NULL DEFAULT 0,
  total_super numeric NOT NULL DEFAULT 0,
  grand_total numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'AUD',
  notes text,
  diff_from_previous jsonb,
  sent_at timestamptz, accepted_at timestamptz,
  UNIQUE (booking_id, version)
);

CREATE TABLE IF NOT EXISTS public.atelier_fee_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  quote_version_id uuid NOT NULL REFERENCES public.atelier_quote_versions(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.atelier_bookings(id) ON DELETE CASCADE,
  line_type public.atelier_fee_line_type NOT NULL,
  description text NOT NULL,
  talent_id uuid REFERENCES public.atelier_talent(id),
  crew_id uuid REFERENCES public.atelier_crew(id),
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  asf_rate numeric NOT NULL DEFAULT 0.15,
  is_gst_exempt boolean NOT NULL DEFAULT false,
  is_super_bearing boolean NOT NULL DEFAULT false,
  super_rate_charged numeric DEFAULT 0.15,
  super_rate_paid numeric DEFAULT 0.12,
  is_commissionable boolean NOT NULL DEFAULT false,
  commission_rate numeric DEFAULT 0.20,
  sort_order integer DEFAULT 0,
  notes text,
  asf_amount numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.atelier_usage_licences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  booking_id uuid NOT NULL REFERENCES public.atelier_bookings(id) ON DELETE CASCADE,
  talent_id uuid REFERENCES public.atelier_talent(id),
  media public.atelier_usage_media[] NOT NULL,
  territory public.atelier_usage_territory[] NOT NULL,
  duration_months integer NOT NULL,
  start_date date, end_date date,
  bur_multiplier numeric,
  fee numeric NOT NULL DEFAULT 0,
  notes text
);

CREATE TABLE IF NOT EXISTS public.atelier_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  booking_id uuid REFERENCES public.atelier_bookings(id),
  actor text,
  payload jsonb DEFAULT '{}'::jsonb,
  idempotency_key text UNIQUE
);

CREATE TABLE IF NOT EXISTS public.atelier_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  agent public.atelier_agent_name NOT NULL,
  action_type text NOT NULL,
  booking_id uuid REFERENCES public.atelier_bookings(id),
  summary text NOT NULL,
  draft_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.atelier_approval_status NOT NULL DEFAULT 'pending',
  decided_at timestamptz, decided_by text,
  rejection_reason text,
  confidence integer,
  uncertainty_sources text[],
  precedent_refs text[],
  idempotency_key text UNIQUE
);

CREATE TABLE IF NOT EXISTS public.atelier_kill_switch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active boolean NOT NULL DEFAULT false,
  pause_outbound boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE TABLE IF NOT EXISTS public.atelier_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id text,
  action text NOT NULL,
  table_name text NOT NULL,
  record_id text,
  old_value jsonb, new_value jsonb,
  ip_address text
);

CREATE TABLE IF NOT EXISTS public.atelier_llm_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  agent_name text NOT NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  estimated_cost_usd numeric NOT NULL DEFAULT 0,
  booking_id uuid REFERENCES public.atelier_bookings(id),
  duration_ms integer
);

CREATE TABLE IF NOT EXISTS public.atelier_idempotency_keys (
  key text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'processing',
  booking_id uuid REFERENCES public.atelier_bookings(id),
  action_type text
);


-- ---------- Indexes ------------------------------------------
CREATE INDEX IF NOT EXISTS idx_atelier_approvals_booking ON public.atelier_approvals (booking_id);
CREATE INDEX IF NOT EXISTS idx_atelier_approvals_status ON public.atelier_approvals (status);
CREATE INDEX IF NOT EXISTS idx_atelier_audit_created ON public.atelier_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_atelier_bookings_client ON public.atelier_bookings (client_id);
CREATE INDEX IF NOT EXISTS idx_atelier_bookings_state ON public.atelier_bookings (state);
CREATE INDEX IF NOT EXISTS idx_atelier_bookings_tier ON public.atelier_bookings (tier);
CREATE INDEX IF NOT EXISTS idx_atelier_bookings_shoot_dates ON public.atelier_bookings USING gist (shoot_dates);
CREATE INDEX IF NOT EXISTS idx_atelier_crew_tier ON public.atelier_crew (tier);
CREATE INDEX IF NOT EXISTS idx_atelier_events_booking ON public.atelier_events (booking_id);
CREATE INDEX IF NOT EXISTS idx_atelier_events_created ON public.atelier_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_atelier_events_type ON public.atelier_events (event_type);
CREATE INDEX IF NOT EXISTS idx_atelier_fee_lines_booking ON public.atelier_fee_lines (booking_id);
CREATE INDEX IF NOT EXISTS idx_atelier_fee_lines_quote ON public.atelier_fee_lines (quote_version_id);
CREATE INDEX IF NOT EXISTS idx_atelier_llm_calls_created ON public.atelier_llm_calls (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_atelier_talent_working_name ON public.atelier_talent (working_name);


-- ---------- Triggers -----------------------------------------
DROP TRIGGER IF EXISTS trg_atelier_clients_updated ON public.atelier_clients;
CREATE TRIGGER trg_atelier_clients_updated BEFORE UPDATE ON public.atelier_clients
FOR EACH ROW EXECUTE FUNCTION public.atelier_set_updated_at();

DROP TRIGGER IF EXISTS trg_atelier_talent_updated ON public.atelier_talent;
CREATE TRIGGER trg_atelier_talent_updated BEFORE UPDATE ON public.atelier_talent
FOR EACH ROW EXECUTE FUNCTION public.atelier_set_updated_at();

DROP TRIGGER IF EXISTS trg_atelier_crew_updated ON public.atelier_crew;
CREATE TRIGGER trg_atelier_crew_updated BEFORE UPDATE ON public.atelier_crew
FOR EACH ROW EXECUTE FUNCTION public.atelier_set_updated_at();

DROP TRIGGER IF EXISTS trg_atelier_campaigns_updated ON public.atelier_campaigns;
CREATE TRIGGER trg_atelier_campaigns_updated BEFORE UPDATE ON public.atelier_campaigns
FOR EACH ROW EXECUTE FUNCTION public.atelier_set_updated_at();

DROP TRIGGER IF EXISTS trg_atelier_bookings_updated ON public.atelier_bookings;
CREATE TRIGGER trg_atelier_bookings_updated BEFORE UPDATE ON public.atelier_bookings
FOR EACH ROW EXECUTE FUNCTION public.atelier_set_updated_at();

DROP TRIGGER IF EXISTS trg_atelier_booking_ref ON public.atelier_bookings;
CREATE TRIGGER trg_atelier_booking_ref BEFORE INSERT ON public.atelier_bookings
FOR EACH ROW WHEN (NEW.booking_ref IS NULL) EXECUTE FUNCTION public.atelier_generate_booking_ref();

DROP TRIGGER IF EXISTS trg_atelier_approvals_updated ON public.atelier_approvals;
CREATE TRIGGER trg_atelier_approvals_updated BEFORE UPDATE ON public.atelier_approvals
FOR EACH ROW EXECUTE FUNCTION public.atelier_set_updated_at();


-- ---------- RLS + Phase 1 permissive policies ----------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'atelier_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I;',
      r.tablename || '_anon_all', r.tablename
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (true) WITH CHECK (true);',
      r.tablename || '_anon_all', r.tablename
    );
  END LOOP;
END $$;


-- ---------- Singleton kill_switch row ------------------------
INSERT INTO public.atelier_kill_switch (is_active, pause_outbound)
SELECT false, false
WHERE NOT EXISTS (SELECT 1 FROM public.atelier_kill_switch);


-- ---------- Done ---------------------------------------------
SELECT 'atelier schema ready — ' || count(*) || ' tables'
FROM information_schema.tables
WHERE table_schema='public' AND table_name LIKE 'atelier_%';
