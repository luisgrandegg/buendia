# 74 — `validate-backends` cron: check RLS stays enabled; misc audit nits

**Phase:** 6
**Severity:** Medium (M8) + Low (cleanup nits)
**Audit ref:** SECURITY_AUDIT.md §M8, §M9, §L1–§L5

## Goal

Detect drift in user-side RLS configuration, and clean up the small hygiene items left over from the audit.

## Scope

### M8 — RLS drift detection
- Extend `apps/web/app/api/cron/validate-backends/route.ts` to, for each connected backend:
  - Query the owner Supabase project (read-only) for `pg_tables` × `pg_policies` in every `app_*` schema.
  - If any table has `rowsecurity = false`, flip the backend's `grant_status` to `degraded` and emit a `backend.rls_disabled` audit event.
- Surface "RLS disabled on table X" on the app detail page banner (same component used for "backend disconnected").

### M9 — standalone publishable key
- `packages/sdk/src/index.ts:209-217`: stop persisting `publishableKey` to `localStorage` in standalone mode. Keep `{ supabaseUrl, schema }`. Re-prompt on reload.
- Note in README that the publishable key is per-session in standalone.

### L1 — `loadMasterKey` base64 prevalidation
- `packages/db/src/credentials.ts:41`: validate base64 format before decode, with a clear error.

### L2 — AAD on envelope encryption
- Bind the version byte as AAD to GCM so a format upgrade can't be downgraded.

### L3 — invitation token at rest
- `lib/invitations.ts`: store SHA-256(token) in the DB; compare against incoming token at acceptance. Mirrors the PAT pattern.

### L4 — PAT lookup test
- Add a test asserting the DB lookup is over the hashed prefix, not the secret.

### L5 — slug length bound
- Server-side `slug.length <= 64` assertion at `/a/[slug]/route.ts` entry and any API v1 slug param parsing.

## Out of scope

- L6 (middleware matcher) — current matcher is fine.
- L7–L9 — informational only.

## Acceptance criteria

- [ ] Cron flips `grant_status` on RLS-disabled tables and writes an audit row.
- [ ] Dashboard surfaces the degraded state.
- [ ] Standalone SDK no longer writes the publishable key to `localStorage`.
- [ ] L1–L5 patches each have a 1-line test or assertion.
