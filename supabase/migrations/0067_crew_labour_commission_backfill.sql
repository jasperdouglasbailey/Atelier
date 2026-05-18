-- 0067_crew_labour_commission_backfill.sql
--
-- Bug fix backfill: crew_labour fee lines were incorrectly flagged
-- is_commissionable=true with commission_rate=0.20 by the quote
-- templates (src/lib/utils/quote-templates.ts pre-fix). Per CLAUDE.md
-- doctrine and the live truth table, crew_labour is NOT commissionable.
--
-- The bug silently re-allocated $1,450 across 11 rows on 6 bookings
-- away from crew and toward "agency keeps". The most material was
-- BOOK-0006 ($280, status final_delivery) where crew was likely
-- already paid — Jasper to verify and back-pay if so.
--
-- This migration corrects the flag on every existing crew_labour row
-- so future re-quotes / payment calculations use the right numbers.
-- It does NOT compensate already-paid crew — that's a per-booking
-- reconciliation Jasper has to perform manually.

UPDATE public.atelier_fee_lines
   SET is_commissionable = false,
       commission_rate   = 0
 WHERE line_type = 'crew_labour'
   AND (is_commissionable = true OR commission_rate <> 0);

-- One audit row per affected booking, attributed to the system actor
-- so the reconciliation is traceable from the booking detail page.
INSERT INTO public.atelier_audit_log (user_id, action, table_name, record_id, new_value, created_at)
SELECT
  'system',
  'backfill_crew_labour_commission',
  'atelier_fee_lines',
  fl.booking_id,
  jsonb_build_object(
    'reason', 'crew_labour was wrongly flagged is_commissionable=true by templates',
    'fix',    'set is_commissionable=false, commission_rate=0 on crew_labour rows',
    'doctrine_ref', 'CLAUDE.md fee model truth table 2026-05-18'
  ),
  now()
FROM (
  SELECT DISTINCT booking_id
    FROM public.atelier_fee_lines
   WHERE line_type = 'crew_labour'
) fl;
