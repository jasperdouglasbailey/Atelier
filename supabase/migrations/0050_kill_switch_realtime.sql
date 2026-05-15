-- Kill switch Realtime publication.
--
-- The kill-switch banner (src/components/layout/KillSwitchBanner.tsx) subscribes
-- to postgres_changes on atelier_kill_switch via Supabase Realtime so the banner
-- appears/disappears instantly when an operator toggles state in /settings.
--
-- Without the table being added to the supabase_realtime publication, the
-- subscription is silent. Operators reported "I toggle, nothing happens, I
-- have to refresh" — the toggle does write, but the banner never gets the
-- change event.
--
-- ALTER PUBLICATION ... ADD TABLE errors if the table is already a member,
-- so we guard with a DO block.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'atelier_kill_switch'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.atelier_kill_switch;
  END IF;
END $$;

-- REPLICA IDENTITY FULL lets Realtime emit the full OLD row on UPDATE/DELETE
-- so subscribers can compute diffs. Without this, only PK fields are sent.
ALTER TABLE public.atelier_kill_switch REPLICA IDENTITY FULL;
