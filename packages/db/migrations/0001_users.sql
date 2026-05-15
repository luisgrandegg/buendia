-- 0001_users.sql
-- Control-plane users table. Mirrors auth.users on insert via a trigger so
-- the application code can join against a stable schema instead of the
-- auth schema (which Supabase reserves the right to evolve).
--
-- See backlog/01-control-plane-auth.md and
-- decisions/0001-control-plane-supabase.md.

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;

-- A user can read and update only their own row. There is no insert policy:
-- inserts come from the auth.users trigger below, not from the client.
create policy "users read own"
  on public.users for select
  using (auth.uid() = id);

create policy "users update own"
  on public.users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- On signup, populate public.users from auth.users.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
