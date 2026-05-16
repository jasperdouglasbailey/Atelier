-- 0056_llm_calls_cache_and_preview.sql
--
-- Two changes to atelier_llm_calls:
--
-- 1. Add prompt-caching token tracking. Anthropic returns
--    `cache_creation_input_tokens` and `cache_read_input_tokens` alongside
--    the regular input_tokens count when prompt caching is in use. These
--    are billed at different rates (1.25× and 0.10× of base input) so we
--    track them separately for accurate monthly cost-cap enforcement.
--
-- 2. Backfill latent columns that anthropic.ts has been inserting against
--    since day one but were never defined in the schema. Symptomatic only
--    when ANTHROPIC_API_KEY is set (it isn't in prod yet), at which point
--    the insert would have silently failed on every LLM call. Caught by
--    the 2026-05-16 audit while reviewing for caching hooks.
--
--      - response_preview  — first 500 chars of the LLM reply for audit
--      - success           — boolean flag for ok-vs-error path tracking

ALTER TABLE public.atelier_llm_calls
  ADD COLUMN IF NOT EXISTS cache_creation_input_tokens integer NOT NULL DEFAULT 0;

ALTER TABLE public.atelier_llm_calls
  ADD COLUMN IF NOT EXISTS cache_read_input_tokens integer NOT NULL DEFAULT 0;

ALTER TABLE public.atelier_llm_calls
  ADD COLUMN IF NOT EXISTS response_preview text;

ALTER TABLE public.atelier_llm_calls
  ADD COLUMN IF NOT EXISTS success boolean NOT NULL DEFAULT true;

-- Index the cache-read column so a future "cache hit rate" dashboard
-- can compute it without a sequential scan.
CREATE INDEX IF NOT EXISTS idx_atelier_llm_calls_cache_read
  ON public.atelier_llm_calls (cache_read_input_tokens)
  WHERE cache_read_input_tokens > 0;
