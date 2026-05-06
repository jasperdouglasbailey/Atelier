-- Migration 0023: agency-side business renewals (insurance, BAS, ASIC, etc.)
-- ----------------------------------------------------------
-- Pairs with /settings/compliance (which tracks talent + crew document
-- expiries). This table tracks agency-level renewals Jasper has to
-- handle himself: public liability insurance, professional indemnity,
-- BAS quarterly lodgement, ASIC company review, domain renewal,
-- ABN/GST registration review, etc.
--
-- Schema is deliberately minimal — `type` is free text rather than an
-- enum so Jasper can add new categories without a migration. UI groups
-- by a known type list (see RENEWAL_TYPES in
-- src/lib/utils/business-renewals.ts) but accepts custom types too.
-- ----------------------------------------------------------

create table if not exists atelier_business_renewals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  /** Free-text category. Common values: insurance_public_liability,
   *  insurance_professional_indemnity, bas_quarterly, asic_review,
   *  abn_gst_review, domain_renewal, accountant_engagement. */
  type text not null,

  /** Human-readable label shown in the UI. */
  label text not null,

  /** When this thing expires / is next due. */
  expires_at date not null,

  /** Free-text notes — provider, cost, last action, etc. */
  notes text,

  /** Set when a reminder has been queued for this expiry — drives the
   *  cron's idempotency so we don't re-queue the same reminder weekly. */
  reminder_queued_at timestamptz,

  /** When set, the row is hidden from the dashboard but kept for history. */
  is_archived boolean not null default false
);

-- Index used by the dashboard ORDER BY expires_at and the cron's
-- WHERE expires_at <= now() + 30 days clause.
create index if not exists idx_business_renewals_expires_at
  on atelier_business_renewals (expires_at)
  where is_archived = false;

-- Owner-only access. Talent + crew never see this table.
alter table atelier_business_renewals enable row level security;

create policy owner_partner_full
  on atelier_business_renewals
  for all
  to authenticated
  using (is_owner_or_partner())
  with check (is_owner_or_partner());

comment on table atelier_business_renewals is
  'Agency-side renewals (insurance, BAS, ASIC). Owner/partner only. '
  'Pairs with atelier_talent compliance fields, which track artist-side '
  'expiries. See migration 0023 for rationale.';
