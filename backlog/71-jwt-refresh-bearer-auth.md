# 71 — Bearer-auth on `/api/jwt/refresh`; SDK drops `credentials: "include"`

**Phase:** 6
**Severity:** High (gates ticket 75)
**Audit ref:** SECURITY_AUDIT.md §H4, §M6
**Constitution refs:** Principle 4 (real auth, not URL obscurity), Principle 6 (SDK is a library).

## Goal

Decouple the SDK refresh flow from dashboard session cookies. Today `packages/sdk/src/index.ts:405-407` calls `fetch(refreshUrl, { credentials: "include" })`, making the cookie the de facto auth boundary. Once apps move to a cookieless origin (ticket 75), `include` stops working — fix the auth model first.

## Scope

- Server: `apps/web/app/api/jwt/refresh/route.ts`
  - Read the current JWT from `Authorization: Bearer <jwt>`.
  - Verify the JWT against the owner's stored signing secret (cache via ticket 70).
  - Look up membership from the JWT's `sub` and the `app_id` query param; mint a fresh JWT only if the sub still has access.
  - Reject if the JWT signature is invalid, expired beyond the refresh window, or membership is gone (403).
- SDK: `packages/sdk/src/index.ts`
  - Hold `currentJwt` as today.
  - Pass it as `Authorization: Bearer ${currentJwt}` on the refresh fetch.
  - `credentials: "omit"`, `redirect: "error"`.
  - On 401/403, mount the revocation overlay (existing path).
- Validate `__APP_CONFIG__` shape on bootstrap (covers M6):
  - Zod schema for `BuendiaAppConfig`.
  - Refuse to start if `supabaseUrl` doesn't match a server-pinned host (write expected host into a `<meta name="buendia-host" content="…">` from the edge route).
  - `Object.freeze(window.__APP_CONFIG__)` after read.
- Tests:
  - Integration: refresh with valid expiring JWT returns a new JWT and `exp`; refresh with revoked membership returns 403.
  - SDK unit: refresh path uses `Authorization` header, not cookies.
  - SDK unit: poisoned `__APP_CONFIG__` (mismatched host) refuses to bootstrap.

## Out of scope

- The app-origin migration itself (ticket 75) — this ticket is the prerequisite.
- Persisting refresh tokens on the client (we don't; refresh is symmetric with the current JWT).

## Acceptance criteria

- [ ] `/api/jwt/refresh` works with no cookies attached.
- [ ] SDK no longer sends `credentials: "include"` anywhere.
- [ ] Config validation has unit tests for poisoned inputs.
