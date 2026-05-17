-- 0008_app_members_with_app_fields.sql
-- Extend the app_members view to surface the fields the edge serve route
-- (ticket 22) needs in a single membership lookup: owner_id, slug,
-- html_storage_path, name. Lets us avoid a follow-up apps query (and the
-- RLS dance that would entail for collaborators).
--
-- See backlog/done/22-edge-serve-route.md.

create or replace view public.app_members as
  select
    a.id as app_id,
    a.owner_id,
    a.slug,
    a.name,
    a.schema_name,
    a.team_id,
    a.html_storage_path,
    a.owner_id as user_id,
    'owner'::text as role
  from public.apps a
  union all
  select
    a.id as app_id,
    a.owner_id,
    a.slug,
    a.name,
    a.schema_name,
    a.team_id,
    a.html_storage_path,
    s.user_id,
    s.role
  from public.app_shares s
  join public.apps a on a.id = s.app_id;
