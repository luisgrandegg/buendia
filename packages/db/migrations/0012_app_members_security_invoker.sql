-- 0012_app_members_security_invoker.sql
-- Close the `app_members` view's RLS bypass. The view was created in 0007
-- and extended in 0008 without `with (security_invoker = true)`, so in
-- PostgreSQL >= 15 it ran with the view owner's privileges and ignored
-- RLS on the underlying tables. Any authenticated user could
-- `select * from public.app_members` and enumerate every app's slug,
-- schema_name, owner_id, team_id and html_storage_path.
--
-- Two changes are needed together:
--
--   1. Flip the view to security_invoker so policies on the base tables
--      apply when authenticated users (publishable-key path) read it.
--   2. Add SELECT policies on `apps` and `app_versions` that let
--      collaborators read the rows their `app_shares` row grants them.
--      Without these, sharees would lose access through the view (the
--      previous bypass was masking the missing policy from 0005, whose
--      comment promised "Sharing (ticket 30) will widen reads via a new
--      policy keyed off app_shares; that lands separately.").
--
-- Audit trail: backlog/63-app-members-rls-bypass.md, SECURITY_AUDIT.md
-- §C1 / §M7. Principle 7 (sharing is access, not ownership transfer):
-- only sharees of a given app may read its row, not every authenticated
-- user.

alter view public.app_members set (security_invoker = true);

create policy "shared user reads shared apps"
  on public.apps for select
  using (
    exists (
      select 1 from public.app_shares s
      where s.app_id = apps.id and s.user_id = auth.uid()
    )
  );

create policy "shared user reads shared app versions"
  on public.app_versions for select
  using (
    exists (
      select 1 from public.app_shares s
      where s.app_id = app_versions.app_id and s.user_id = auth.uid()
    )
  );
