-- 0015_owner_backends_grant_status_degraded.sql
-- Extend the owner_backends.grant_status enum with 'degraded' so the
-- daily cron (ticket 61) can flag projects where RLS has been turned
-- off on a Buendia-provisioned table.
--
-- See backlog/74-rls-validation-cron-and-nits.md (the M8 item) and
-- SECURITY_AUDIT.md §M8.
--
-- The dashboard's Settings page banner can read this value alongside
-- 'revoked' to surface the matching "RLS disabled on …" hint.

alter table public.owner_backends
  drop constraint if exists owner_backends_grant_status_check;

alter table public.owner_backends
  add constraint owner_backends_grant_status_check
  check (grant_status in ('ok', 'revoked', 'unknown', 'degraded'));
