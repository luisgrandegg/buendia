-- 0014_invitations_token_hash.sql
-- Store invitations as a SHA-256 hash of the token (mirrors the PAT
-- pattern from 0011). Plaintext now lives only inside the invitation
-- URL the inviter shares — a DB read no longer yields a live link.
--
-- Audit: SECURITY_AUDIT.md §L3 / backlog/74-rls-validation-cron-and-nits.md.
--
-- Migration cost: existing outstanding invitations stop resolving. They
-- have a 14-day TTL and "re-send invitation" is a one-button action in
-- the share panel, so the disruption is bounded.
--
-- Rollout order:
--   1. Run this migration.
--   2. Deploy the matching app code that writes `token_hash` and looks
--      up by it. Between (1) and (2) the existing app code will fail to
--      insert into `invitations` (no `token` column to fill), so put
--      them in the same window.

-- Drop pending invitations — they relied on the plaintext column that
-- this migration is about to remove.
delete from public.invitations;

-- Replace the plaintext column with its hash.
alter table public.invitations add column token_hash bytea not null;
create unique index invitations_token_hash_uidx on public.invitations (token_hash);

drop index if exists invitations_token_idx;
alter table public.invitations drop column token;
