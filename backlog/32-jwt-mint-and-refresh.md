# 32 — JWT mint + refresh endpoint

**Phase:** 3
**Depends on:** 12, 22
**Constitution refs:** §4 (real auth), Architecture Invariants §JWT scope is the security boundary

## Goal

Single control-plane endpoint that mints JWTs scoped to a single app, signed
with the _owner's_ project JWT secret, with the claim shape the constitution
prescribes.

## Scope

- `POST /api/jwt/refresh?app=<id>`:
  - Authenticate the request via Buendia session cookie.
  - Look up `app_members` for `(app_id, user_id)`. If missing → 403.
  - Decrypt the owner's JWT secret (12), sign a token with claims:
    `sub`, `role: "authenticated"`, `app_id`, `app_schema`, `team_id`,
    `buendia_role`, `exp` (now + 15 min).
  - Return `{ jwt, exp }`.
- Same code path is used by the edge serve route (22) and the SDK
  refresh timer (26).
- Hard cap TTL to 15 minutes; no override.

## Out of scope

- Long-lived API tokens for non-browser clients (post-MVP, would need its own
  ADR).

## Acceptance criteria

- [ ] Members receive valid JWTs accepted by the owner's Supabase.
- [ ] Removed members get 403 on the next call (no silent stale-share window
      beyond the existing JWT's `exp`).
- [ ] No JWT exceeds 15-minute TTL.
- [ ] JWT secret is never logged or returned.
