-- 0016_audit_log_backend_rls_disabled.sql
-- Widen the audit_log.action CHECK constraint (added in 0013) to
-- include 'backend.rls_disabled'. The daily cron emits one of these
-- the first time it observes RLS turned off on a provisioned app
-- table; pair with the 'degraded' grant_status from 0015.
--
-- Sync rule (from 0013): when AUDIT_ACTIONS in packages/db/src/audit.ts
-- grows, the CHECK list grows in lockstep via a migration like this
-- one.

alter table public.audit_log
  drop constraint if exists audit_log_action_known;

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
      'backend.rls_disabled',
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
