-- 0003_audit_log.sql
-- Control-plane audit log. Every write-side action on Buendia's metadata
-- emits a row here. Useful for incident response and the "who removed me"
-- question collaborators eventually ask.
--
-- See backlog/done/60-audit-log.md.

create table if not exists public.audit_log (
  id bigserial primary key,
  actor_id uuid references public.users(id) on delete set null,
  action text not null,
  -- target_app_id will reference public.apps(id) once that table exists
  -- (ticket 20). Until then we keep it as a plain uuid so this migration
  -- can land independently.
  target_app_id uuid,
  target_user_id uuid references public.users(id) on delete set null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_actor_id_idx
  on public.audit_log (actor_id);
create index if not exists audit_log_created_at_idx
  on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;

-- Authenticated users insert their own entries; actor_id must equal their
-- own uid, which prevents attribution forgery. Reads are blocked entirely
-- from the publishable-key path — only service-role-equivalent code can
-- query the log. A browsable audit UI is post-MVP.
create policy "users insert own audit"
  on public.audit_log for insert
  with check (auth.uid() = actor_id);
