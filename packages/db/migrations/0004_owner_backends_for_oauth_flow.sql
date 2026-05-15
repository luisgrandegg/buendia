-- 0004_owner_backends_for_oauth_flow.sql
-- Two changes that prepare owner_backends for ticket 10:
--   1. Relax NOT NULL on project columns so the OAuth flow can persist
--      just the refresh token; ticket 11's project provisioner fills the
--      rest a moment later.
--   2. Allow authenticated users to upsert their own row. Encrypted
--      columns stay opaque to the publishable-key path (no decryption
--      possible without BUENDIA_MASTER_KEY), so letting users write
--      doesn't widen the attack surface — and the row is theirs anyway.
--
-- See backlog/done/10-supabase-oauth.md.

alter table public.owner_backends
  alter column supabase_project_ref drop not null,
  alter column supabase_url drop not null,
  alter column supabase_publishable_key_encrypted drop not null,
  alter column supabase_secret_key_encrypted drop not null,
  alter column supabase_jwt_secret_encrypted drop not null;

create policy "owner inserts own backend"
  on public.owner_backends for insert
  with check (auth.uid() = user_id);

create policy "owner updates own backend"
  on public.owner_backends for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
