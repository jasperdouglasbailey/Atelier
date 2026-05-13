-- Add is_artist_reimbursement flag to fee lines.
-- When true, the line is an expense the artist fronted that the agency
-- passes through to the client and reimburses to the artist at payment time.
-- These lines are NOT subject to commission, and they count toward
-- the artist payout total in P&L reporting.
ALTER TABLE atelier_fee_lines
  ADD COLUMN IF NOT EXISTS is_artist_reimbursement boolean NOT NULL DEFAULT false;
