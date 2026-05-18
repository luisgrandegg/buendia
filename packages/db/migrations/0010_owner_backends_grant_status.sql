-- 0010_owner_backends_grant_status.sql
-- Track whether Buendia's OAuth grant against the user's Supabase
-- organization still works. A daily cron (ticket 61) calls the
-- Management API for each row; if Supabase refuses the refresh token,
-- we flip grant_status to 'revoked' and the dashboard surfaces a
-- Reconnect banner.
--
-- See backlog/done/61-oauth-grant-revocation.md.

alter table public.owner_backends
  add column if not exists grant_status text not null default 'ok'
  check (grant_status in ('ok', 'revoked', 'unknown'));
