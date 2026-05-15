# 10 — Supabase OAuth for the user's backend

**Phase:** 1
**Depends on:** 01, 12 (credential storage must land in the same release)
**Constitution refs:** §3 (the user owns the database)

## Goal

The user connects their Supabase account once via OAuth (PKCE flow), and
Buendia receives access + refresh tokens scoped to managing projects in their
organization.

## Scope

- "Connect Supabase" CTA shown after first signin if `owner_backends` row is
  missing.
- OAuth initiation with PKCE; redirect URI in `apps/web`.
- Callback handler: exchange code for tokens, persist refresh token (encrypted
  per ticket 12).
- Failure paths: user denies grant, callback errors, expired state → clear
  messages, retry CTA.

## Out of scope

- Project creation itself (ticket 11).
- Reconnect-after-revocation flow (ticket 61).
- Picking among multiple organizations (use the first for MVP; document the
  limitation).

## Acceptance criteria

- [ ] A new user can complete the OAuth flow end to end.
- [ ] Refresh token reaches storage encrypted; plaintext never logged.
- [ ] Denying the grant returns the user to a clear retry screen.
