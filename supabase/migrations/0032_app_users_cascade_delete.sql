-- When a crew or talent record is deleted, their portal login row in
-- atelier_app_users must also be removed. The previous ON DELETE SET NULL
-- conflicted with the app_user_role_linkage check constraint (which requires
-- crew-role rows to have a non-null crew_id), causing a constraint violation
-- whenever a crew or talent member was deleted.

ALTER TABLE atelier_app_users
  DROP CONSTRAINT atelier_app_users_crew_id_fkey,
  ADD CONSTRAINT atelier_app_users_crew_id_fkey
    FOREIGN KEY (crew_id) REFERENCES atelier_crew(id) ON DELETE CASCADE;

ALTER TABLE atelier_app_users
  DROP CONSTRAINT atelier_app_users_talent_id_fkey,
  ADD CONSTRAINT atelier_app_users_talent_id_fkey
    FOREIGN KEY (talent_id) REFERENCES atelier_talent(id) ON DELETE CASCADE;
