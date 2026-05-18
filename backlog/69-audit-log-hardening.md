# 69 — `audit_log`: explicit deny policies, action CHECK, AuditAction sync

**Phase:** 6
**Severity:** Medium
**Audit ref:** SECURITY_AUDIT.md §M4, §M5

## Goal

Tighten the control-plane audit log against (a) authenticated clients inserting bogus action strings, and (b) silent drift between `AUDIT_ACTIONS` and call sites.

## Background

`packages/db/migrations/0003_audit_log.sql` enables RLS with only an `INSERT` policy. Read/update/delete are correctly denied (RLS + no policy = deny), but the migration doesn't _say so_ — auditors and Supabase advisor both flag it. Separately, `action` is a free-text column, so an authenticated user can `insert into audit_log (action, actor_id) values ('admin.factory_reset', auth.uid())` and pollute the trail. Lastly, `validate-backends/route.ts:94` emits `backend.credentials_refreshed`, which isn't in `AUDIT_ACTIONS` in `packages/db/src/audit.ts` — TypeScript should have rejected it; either the union is loose or the type-check is being skipped.

## Scope

- New migration `0012_audit_log_hardening.sql`:
  - Explicit `using (false)` policies for select / update / delete on `audit_log`.
  - `CHECK (action in (…enumerated list…))` on the `action` column.
- Update `packages/db/src/audit.ts`:
  - Add every missing action (`backend.credentials_refreshed` and any siblings).
  - Re-derive the CHECK list from `AUDIT_ACTIONS` (single source). Generate the migration with the enum committed, but keep the SQL in sync via a comment pointing to the constant.
- Tests:
  - Insert with an unknown action fails the CHECK.
  - Insert with the wrong `actor_id` still fails RLS.
  - Read / update / delete from a normal user returns 0 / fails.

## Out of scope

- A browsable audit UI (post-MVP per ticket 60).

## Acceptance criteria

- [ ] Migration lands and integration tests cover all four DML verbs.
- [ ] No call site uses an action string that isn't in `AUDIT_ACTIONS`.
- [ ] CI fails if the union drifts (typecheck on every call site).
