-- 0011_personal_access_tokens.sql
-- Personal access tokens authenticate non-browser clients (the MCP server,
-- the upcoming HTTP API, ad-hoc curl) against Buendia. A PAT proves
-- "this is user X talking to Buendia" — it is NOT a JWT for the user's
-- Supabase project. App-data JWTs still go through the per-app mint flow.
--
-- See decisions/0011-personal-access-tokens.md and backlog/done/70.

create table public.personal_access_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  -- First 12 chars of the plaintext token (after the buendia_pat_ prefix).
  -- Shown in the settings list so users can identify which token is which
  -- without exposing the secret.
  token_prefix text not null,
  -- SHA-256 of the plaintext. The plaintext is shown to the user exactly
  -- once at creation time and never persisted.
  token_hash bytea not null unique,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (length(name) between 1 and 80)
);

create index personal_access_tokens_user_id_idx
  on public.personal_access_tokens (user_id);

alter table public.personal_access_tokens enable row level security;

-- Users see + manage their own tokens. Lookup by token_hash from the
-- HTTP API auth helper goes through the control-plane admin client, which
-- bypasses RLS, so we don't need a service-role-side policy here.
create policy "users read own pats"
  on public.personal_access_tokens for select
  using (auth.uid() = user_id);

create policy "users insert own pats"
  on public.personal_access_tokens for insert
  with check (auth.uid() = user_id);

create policy "users update own pats"
  on public.personal_access_tokens for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users delete own pats"
  on public.personal_access_tokens for delete
  using (auth.uid() = user_id);
