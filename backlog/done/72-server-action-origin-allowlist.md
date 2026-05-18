# 72 — Server-action Origin allowlist

**Phase:** 6
**Severity:** Medium
**Audit ref:** SECURITY_AUDIT.md §M1

## Goal

Make sure destructive Next server actions can't be invoked from a cross-origin page that piggy-backs on the user's session cookies.

## Background

Next 15 supports `experimental.serverActions.allowedOrigins` for Origin/Host check on form POSTs. If it isn't configured, an attacker page can submit a multipart form to a server action endpoint with the session cookie attached and trigger destructive flows.

## Scope

- Set `experimental.serverActions.allowedOrigins` in `apps/web/next.config.ts` to the dashboard host(s) — pull from `env.siteUrl`, include preview/branch hosts as needed.
- Add a manual `headers().get("origin")` guard at the top of every server action in:
  - `app/actions/apps.ts` (rename, delete, upload)
  - `app/actions/shares.ts` (invite, remove)
  - `app/actions/personal-access-tokens.ts` (mint, revoke)
  - `app/actions/owner-backend.ts` (disconnect)
  - `app/actions/auth.ts` (signin, signup, signout)
  ```ts
  const origin = (await headers()).get("origin");
  if (origin && origin !== env.siteUrl) throw new Error("forbidden");
  ```
- Single helper `lib/assert-origin.ts` to avoid copy-paste.
- Unit test: a server action called with a different `Origin` header rejects.

## Out of scope

- Building a more granular CSRF token system.

## Acceptance criteria

- [ ] All destructive actions go through `assertOrigin()`.
- [ ] `next.config.ts` has `allowedOrigins` set.
- [ ] Tests cover at least one action in each file.
