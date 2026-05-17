-- 0063_consolidate_line_types.sql
--
-- Phase 3/3 of the Jasper-approved fee-line simplification — part 2 of 2.
--
-- Collapses 12 line types into 2:
--
--   retouching → post_production
--     (Identical fee-engine treatment; retouching = stills post-prod,
--     post_production = video post-prod. Both commissionable artist work.
--     The line's `description` carries the specific kind.)
--
--   equipment_rental, crew_equipment, studio_hire, catering, wardrobe,
--   props, casting, location_fee, permits, insurance, other_expense →
--   expense
--     (All 11 had identical fee treatment: not commissionable, ASF on,
--     follows linked-person GST status, no super. They were pure labels.
--     `description` carries the specific kind. Person link drives any
--     reimbursement semantic.)
--
-- The `expense` enum value was added in migration 0062 (separate
-- transaction — ALTER TYPE ADD VALUE can't commit and be referenced in
-- the same session).
--
-- Pre-flight verification 2026-05-18: 0 rows of retouching, 4 rows of
-- crew_equipment, 4 rows of equipment_rental, 0 rows of every other
-- merged type. 8 rows total touched. No behavioural change — every
-- remapped row keeps its existing commission/ASF/GST/super values
-- (those are stored at line level, not derived from line_type).
--
-- The dropped enum values STAY in the type definition (don't drop —
-- recreating the enum locks the table). App code uses only the new
-- 10-value set going forward.

UPDATE public.atelier_fee_lines
SET line_type = 'post_production'
WHERE line_type = 'retouching';

UPDATE public.atelier_fee_lines
SET line_type = 'expense'
WHERE line_type IN (
  'equipment_rental', 'crew_equipment', 'studio_hire',
  'catering', 'wardrobe', 'props', 'casting',
  'location_fee', 'permits', 'insurance', 'other_expense'
);
