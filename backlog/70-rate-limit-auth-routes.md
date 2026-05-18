# 70 — Rate-limit auth-adjacent routes + cache decrypted JWT secrets

**Phase:** 6
**Severity:** Medium / High (H6 is amplification-flavoured)
**Audit ref:** SECURITY_AUDIT.md §M2, §H6
**Constitution refs:** Principle 4 (real auth).

## Goal

Add a small rate-limit helper and apply it to every auth-adjacent route. Separately, cache the decrypted owner JWT secret so refresh isn't a CPU amplification path.

## Scope

- `apps/web/lib/rate-limit.ts`:
  - Sliding-window helper backed by Vercel KV (or in-memory fallback in dev).
  - Signature: `enforceRateLimit({ key, limit, windowMs }): Promise<RateLimitResult>`.
  - Keys derived from `(authenticated user id) ?? (IP from x-forwarded-for, first hop)`.
- Apply to:
  - `app/api/jwt/refresh/route.ts` — 60 req/min per (user, app).
  - `app/actions/auth.ts` signup — 10/hour per IP.
  - `app/actions/shares.ts` invite — 20/hour per user, 5/hour per app.
  - `app/actions/personal-access-tokens.ts` mint — 10/hour per user.
  - `app/invite/route.ts` acceptance — 30/hour per IP.
- In `app/api/jwt/refresh/route.ts`:
  - Add an in-process LRU keyed by `owner_id` holding `{ jwtSecret, expiresAt }` with a 60s TTL. Decrypt only on miss.
  - Unit test: two refreshes within the TTL trigger one decrypt.
- Failure mode: rate-limit helper failures (KV down) fail _open_ with a logged warning. Don't lock users out on infra hiccups.

## Out of scope

- Global per-IP DDoS protection — that's Vercel/edge config.
- Backoff UI on the dashboard (separate UX ticket).

## Acceptance criteria

- [ ] Every route listed has a documented limit.
- [ ] Helper has unit tests for window boundaries and key derivation.
- [ ] JWT refresh decrypts at most once per `owner_id` per minute under load.
