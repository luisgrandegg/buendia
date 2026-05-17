-- 0009_invitations.sql
-- Pending invitations to apps for users who don't yet have a Buendia
-- account. Resolved into public.app_shares on signup (matched by email).
--
-- See backlog/done/31-invitation-email.md.

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps(id) on delete cascade,
  email text not null,
  role text not null check (role in ('viewer', 'editor')),
  invited_by uuid references public.users(id) on delete set null,
  token text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (app_id, email)
);

create index invitations_email_idx on public.invitations (lower(email));
create index invitations_token_idx on public.invitations (token);

alter table public.invitations enable row level security;

-- Owners manage invitations for their own apps. Acceptance on signup
-- goes through the admin client (bypasses RLS), so we don't need a
-- recipient-side policy.
create policy "owner reads own invitations"
  on public.invitations for select
  using (
    exists (
      select 1 from public.apps a
      where a.id = invitations.app_id and a.owner_id = auth.uid()
    )
  );

create policy "owner inserts own invitations"
  on public.invitations for insert
  with check (
    exists (
      select 1 from public.apps a
      where a.id = invitations.app_id and a.owner_id = auth.uid()
    )
  );

create policy "owner deletes own invitations"
  on public.invitations for delete
  using (
    exists (
      select 1 from public.apps a
      where a.id = invitations.app_id and a.owner_id = auth.uid()
    )
  );
