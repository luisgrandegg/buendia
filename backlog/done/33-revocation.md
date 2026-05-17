# 33 — Revocation path

**Phase:** 3
**Depends on:** 30, 32, 60
**Constitution refs:** §7 (sharing is access, owner revokes any time)

## Goal

Removing a collaborator deletes the `app_shares` row, writes an audit entry,
and guarantees the next JWT mint fails. Document the up-to-15-minute window
where their existing JWT still works.

## Scope

- Atomic transaction: delete `app_shares` row, insert `audit_log` row.
- Verify ticket 32 returns 403 immediately after deletion (the read path is
  the source of truth, not a cache).
- E2E test: invite → open as collaborator → owner revokes → SDK refresh
  triggers overlay (ties to 26).
- Public-facing doc page that states the TTL window plainly. No marketing
  weasel words.

## Out of scope

- Forced session kill (would require global state we deliberately don't keep).

## Acceptance criteria

- [ ] After revocation, the next `/api/jwt/refresh` returns 403.
- [ ] After revocation, an existing JWT keeps working until `exp` only.
- [ ] `audit_log` records actor, app, target user, and action.
- [ ] Doc page lives at `/docs/access-removal` (or similar).
