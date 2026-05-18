-- 0066_edms_drop_created_by.sql
--
-- atelier_edms.created_by was typed `uuid REFERENCES auth.users(id)`,
-- but the rest of the codebase uses `getCurrentActor()` which returns an
-- email string (the Supabase user's email, not their auth UUID). Trying
-- to insert that email into a uuid column 500s every create.
--
-- The audit log (atelier_audit_log) already records who created an EDM
-- via `action='create_edm'` rows — we don't need a redundant column on
-- the table itself. Dropping rather than retyping keeps the schema lean.

ALTER TABLE public.atelier_edms DROP COLUMN IF EXISTS created_by;
