-- 0013_audit_log_hardening.sql
-- Two-part hardening for the control-plane audit log:
--
--   1. Document the deny semantics. Today public.audit_log enables RLS
--      with only an INSERT policy bound to actor_id = auth.uid().
--      Without SELECT / UPDATE / DELETE policies, Postgres correctly
--      denies those verbs, but the migration doesn't *say so* — every
--      auditor (Supabase advisor included) flags the omission. Add
--      explicit `using (false)` policies so the intent is committed.
--
--   2. Constrain `action` to the enum. The column was free-text, so an
--      authenticated user could `insert into audit_log (action, actor_id)
--      values ('admin.factory_reset', auth.uid())` and pollute the
--      trail before an attack lands elsewhere. CHECK pins the column to
--      the known actions in packages/db/src/audit.ts (AUDIT_ACTIONS).
--
-- Audit refs: SECURITY_AUDIT.md §M4 (§M5 — the missing audit action —
-- was already fixed in code).
-- See backlog/done/69-audit-log-hardening.md.
--
-- Sync rule: when AUDIT_ACTIONS in packages/db/src/audit.ts grows, add
-- the new value to the CHECK list below (and ship a follow-up
-- migration). Both lists are intentionally hand-mirrored — Supabase
-- doesn't give us a clean way to derive a runtime CHECK from a TS
-- constant, and the explicit duplication is cheap.

create policy "audit deny all reads"
  on public.audit_log for select
  using (false);

create policy "audit deny all updates"
  on public.audit_log for update
  using (false);

create policy "audit deny all deletes"
  on public.audit_log for delete
  using (false);

alter table public.audit_log
  add constraint audit_log_action_known
  check (
    action in (
      'auth.signed_up',
      'auth.signed_in',
      'backend.connected',
      'backend.project_provisioned',
      'backend.disconnected',
      'backend.credentials_refreshed',
      'app.created',
      'app.renamed',
      'app.deleted',
      'app.version.uploaded',
      'share.invited',
      'share.role_changed',
      'share.removed',
      'pat.created',
      'pat.revoked',
      'pat.used'
    )
  );
