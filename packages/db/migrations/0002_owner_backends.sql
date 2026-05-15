-- 0002_owner_backends.sql
-- Per-user credentials for the user-owned Supabase project. One row per
-- Buendia user. All sensitive values are envelope-encrypted by the
-- application before being written here (see packages/db/src/credentials.ts
-- and decisions/0002-credential-envelope-encryption.md).
--
-- See backlog/done/12-credential-storage.md.

create table if not exists public.owner_backends (
  user_id uuid primary key references public.users(id) on delete cascade,

  -- Project metadata. URL and project ref are not secret on their own; they
  -- live in the JWT we mint anyway, so storing them in plaintext keeps the
  -- error surface small without weakening security.
  supabase_project_ref text not null,
  supabase_url text not null,

  -- Envelope-encrypted credentials. The application encrypts each value with
  -- a fresh per-call data key, which is itself wrapped by the master key
  -- (BUENDIA_MASTER_KEY). KMS-backed wrapping is the next step; see the ADR.
  supabase_publishable_key_encrypted bytea not null,
  supabase_secret_key_encrypted bytea not null,
  supabase_jwt_secret_encrypted bytea not null,
  supabase_oauth_refresh_token_encrypted bytea not null,

  connected_at timestamptz not null default now(),
  last_validated_at timestamptz
);

alter table public.owner_backends enable row level security;

-- A user can see whether their own row exists and a few non-sensitive bits
-- (URL, project ref, connection timestamps). The encrypted columns are
-- never selected by browser-side code — they're only touched server-side
-- when minting JWTs or running the schema provisioner — but RLS provides a
-- belt-and-suspenders barrier against accidental exposure.
create policy "owner reads own backend"
  on public.owner_backends for select
  using (auth.uid() = user_id);

-- Writes always go through server code holding the service-role-equivalent
-- secret. We deliberately omit insert/update/delete policies so the table
-- is read-only via the anon/publishable key.
