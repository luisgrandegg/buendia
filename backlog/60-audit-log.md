# 60 — Audit log

**Phase:** Cross-cutting
**Depends on:** 01
**Constitution refs:** §3, Architecture Invariants §The platform never holds app data (audit is _control-plane_ state, not app data)

## Goal

Every write-side action on the control plane emits a row to `audit_log` with
actor, action, target(s), and metadata. Used for incident response and the
"who removed me" question collaborators eventually ask.

## Scope

- Schema: as defined in MVP.md §Data model.
- Helper in `packages/db` so all writes go through one logging path.
- Documented action vocabulary in this ticket's body (kept in sync as we add
  new actions). Initial set:
  - `app.created`, `app.renamed`, `app.deleted`, `app.version.uploaded`
  - `share.invited`, `share.role_changed`, `share.removed`
  - `backend.connected`, `backend.disconnected`, `backend.credentials_refreshed`
  - `auth.signed_up`, `auth.signed_in`
- Never log secrets in `metadata`. Lint rule enforces this.

## Out of scope

- UI to browse the audit log (post-MVP).
- Streaming to an external SIEM (post-MVP).

## Acceptance criteria

- [ ] Every covered action creates one row, no duplicates.
- [ ] No `metadata` value contains a credential, JWT, or password (verified by
      automated scan against test fixtures).
