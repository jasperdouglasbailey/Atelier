-- Migration 0055: cost_subtotal split on fee lines
--
-- Until now, `atelier_fee_lines.subtotal` was used for BOTH the client-invoice
-- math AND the payee-paid math. When the actual cost diverges from the billed
-- amount (e.g. digital op quoted at $600, but only invoices $550), the agency
-- captures windfall margin that the system couldn't represent — there was no
-- way to keep the client side at quoted while logging actual cost separately.
--
-- This adds an OPTIONAL `cost_subtotal numeric` column. When NULL (the default
-- and the historical case), the engine reads `cost_subtotal ?? subtotal` —
-- existing data and existing behaviour are completely untouched. When SET, it
-- overrides what's paid out to the payee while leaving the client invoice at
-- `subtotal`.
--
-- Confirmed with Jasper 2026-05-15: this is for cases like a crew member's
-- actual invoice coming in under the quoted day rate. The agency keeps the
-- spread as margin (after super/GST adjustments).

ALTER TABLE public.atelier_fee_lines
  ADD COLUMN IF NOT EXISTS cost_subtotal numeric;

COMMENT ON COLUMN public.atelier_fee_lines.cost_subtotal IS
  'Optional: actual amount paid to the payee, when different from billed `subtotal`. '
  'NULL = same as subtotal (paid = billed). When set, drives the paid-out side of '
  'the engine (commission, super to fund, input credits) while `subtotal` continues '
  'to drive the client-invoice side. Captured spread (subtotal - cost_subtotal) '
  'flows into agency margin.';
