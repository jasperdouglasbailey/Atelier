-- Migration 0031: missing operational fields
--
-- Talent + Crew: bank account details for RCTI/payroll payments, and a
--   day rate range (min/max) to give context when quoting.
--
-- Bookings: confirmation deadline (when the quote expires without client
--   sign-off), quote validity window override (days from issue), and a
--   primary producer contact (name/email/phone) separate from the JSONB
--   contacts array.
--
-- Bank fields are owner/partner only in the application layer; the RLS
-- policies on atelier_talent and atelier_crew already restrict read/write
-- to is_owner_or_partner() for non-portal access.

-- ─── Talent ──────────────────────────────────────────────────────────────
ALTER TABLE atelier_talent
  ADD COLUMN IF NOT EXISTS bank_bsb          text,
  ADD COLUMN IF NOT EXISTS bank_account_number text,
  ADD COLUMN IF NOT EXISTS bank_account_name text,
  ADD COLUMN IF NOT EXISTS min_day_rate      numeric(10,2),
  ADD COLUMN IF NOT EXISTS max_day_rate      numeric(10,2);

-- ─── Crew ─────────────────────────────────────────────────────────────────
ALTER TABLE atelier_crew
  ADD COLUMN IF NOT EXISTS bank_bsb          text,
  ADD COLUMN IF NOT EXISTS bank_account_number text,
  ADD COLUMN IF NOT EXISTS bank_account_name text,
  ADD COLUMN IF NOT EXISTS min_day_rate      numeric(10,2),
  ADD COLUMN IF NOT EXISTS max_day_rate      numeric(10,2);

-- ─── Bookings ─────────────────────────────────────────────────────────────
ALTER TABLE atelier_bookings
  ADD COLUMN IF NOT EXISTS confirmation_deadline date,
  ADD COLUMN IF NOT EXISTS quote_validity_days   integer,
  ADD COLUMN IF NOT EXISTS producer_name         text,
  ADD COLUMN IF NOT EXISTS producer_email        text,
  ADD COLUMN IF NOT EXISTS producer_phone        text;
