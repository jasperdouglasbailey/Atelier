-- Split overtime into artist vs crew so the commissionable flag can be
-- set correctly. Artist OT is commissionable like every other artist
-- labour line; crew OT is not (matches the original `overtime` semantics,
-- which we keep as the crew-overtime value).
--
-- Postgres requires ADD VALUE to run outside a transaction block, so we
-- guard it idempotently. Existing `overtime` rows stay as-is (they were
-- always crew OT in practice — the OT-entry form is crew-only).
ALTER TYPE atelier_fee_line_type ADD VALUE IF NOT EXISTS 'artist_overtime';
