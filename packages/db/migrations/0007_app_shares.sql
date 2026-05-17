-- 0007_app_shares.sql
-- Per-user grants on an app. The owner row is implicit through
-- public.apps.owner_id; this table stores collaborator grants only.
-- Ticket 30 lights up the UI; ticket 32 (this PR) just needs the table
-- and the membership view so the JWT mint endpoint can answer
-- "is this user allowed to mint a JWT for this app?".
--
-- See backlog/done/32-jwt-mint-and-refresh.md and
-- backlog/30-share-invite-ui.md.

create table public.app_shares (
  app_id uuid not null references public.apps(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('viewer', 'editor')),
  invited_by uuid references public.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (app_id, user_id)
);

create index app_shares_user_id_idx on public.app_shares (user_id);

alter table public.app_shares enable row level security;

-- The owner of the app manages share rows.
create policy "owner reads own shares"
  on public.app_shares for select
  using (
    exists (
      select 1 from public.apps a
      where a.id = app_shares.app_id and a.owner_id = auth.uid()
    )
  );

create policy "shared user sees own grant"
  on public.app_shares for select
  using (auth.uid() = user_id);

create policy "owner inserts own shares"
  on public.app_shares for insert
  with check (
    exists (
      select 1 from public.apps a
      where a.id = app_shares.app_id and a.owner_id = auth.uid()
    )
  );

create policy "owner updates own shares"
  on public.app_shares for update
  using (
    exists (
      select 1 from public.apps a
      where a.id = app_shares.app_id and a.owner_id = auth.uid()
    )
  );

create policy "owner deletes own shares"
  on public.app_shares for delete
  using (
    exists (
      select 1 from public.apps a
      where a.id = app_shares.app_id and a.owner_id = auth.uid()
    )
  );

-- Union of owner + collaborator rows. The single source of truth the JWT
-- mint endpoint consults: if (app_id, user_id) is in this view, the user
-- may receive a JWT for that app.
create or replace view public.app_members as
  select
    a.id as app_id,
    a.owner_id as user_id,
    'owner'::text as role,
    a.team_id,
    a.schema_name
  from public.apps a
  union all
  select
    s.app_id,
    s.user_id,
    s.role,
    a.team_id,
    a.schema_name
  from public.app_shares s
  join public.apps a on a.id = s.app_id;
