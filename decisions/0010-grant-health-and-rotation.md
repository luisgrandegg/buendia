# 0010 — Grant health-check + manual credential refresh

**Status:** Accepted
**Date:** 2026-05-17

## Context

Two failure modes can leave Buendia holding stale credentials for a
user's Supabase project, with no way to recover automatically:

1. **OAuth grant revocation.** The user revokes Buendia from their
   Supabase dashboard. Buendia's refresh token starts getting 401s; every
   server-side call we do on the user's behalf fails.
2. **JWT secret rotation.** The user manually rotates their project's
   JWT secret (Supabase Settings → API → Rotate). Our stored copy
   becomes invalid; every JWT we mint gets rejected by their PostgREST.

Tickets 61 and 62 each address one of these. The mechanics overlap —
both want to talk to the Management API on the user's behalf and
update the encrypted columns — so they ship together.

## Decision

**Daily cron** (`GET /api/cron/validate-backends`) walks every
`owner_backends` row, exchanges the stored refresh token for an access
token, and probes `GET /v1/organizations`. Result writes:

- Success → `grant_status='ok'`, `last_validated_at=now()`. Refresh
  token is rotated through if Supabase issued a new one.
- 401/403/`invalid_grant` → `grant_status='revoked'`. Audit row
  emitted when the status flips.
- Anything else (5xx, network) → `grant_status='unknown'` so we don't
  false-alarm on transient failures.

Schedule: `0 4 * * *` (daily at 04:00 UTC). Vercel Hobby allows daily
crons; that's enough latency for this signal.

Auth: `Authorization: Bearer ${CRON_SECRET}`. Vercel injects this
when the cron is configured; non-cron callers see 401.

**Manual "Refresh credentials" button** on `/settings`. Re-runs the
ticket-11 fetch pipeline (token → `/v1/projects/<ref>/api-keys` →
`/v1/projects/<ref>/config/auth`) and replaces the encrypted columns +
rotated refresh token. Used when the user knows they rotated keys, or
when the cron just flagged the row.

**UI**:

- `grant_status='revoked'` shows a persistent **Supabase connection
  broken** alert at the top of `/settings` with a Reconnect button
  (re-runs the OAuth flow from ticket 10).
- The Connected backend block gains a Last checked timestamp +
  Refresh credentials button.

## Why not an SDK-side fix

The grant lives between Buendia and Supabase. The SDK in the browser
can't know the grant was revoked — that's a server concern.
Re-OAuthing is fundamentally interactive; we surface it where the user
can act (Settings).

## Consequences

**Enables**

- Operators see grant breakage within 24 hours instead of "next time
  the user opens their app".
- Users who rotated keys aren't stuck; one button repairs.
- The audit log records every grant transition + every manual refresh,
  so incident response has a paper trail.

**Costs**

- Daily cron means up to 24h between revocation and the banner. For
  shorter latency we'd need to either trigger validation when the
  user opens the dashboard (cheap) or stream from Supabase (impossible
  — Supabase doesn't notify us when a user revokes our OAuth grant).
  Cheaper trigger is a worthwhile follow-up; the cron is the floor.
- One more env var (`CRON_SECRET`).

**Forecloses**

- Nothing material. If we later want per-request validation or a
  webhook from Supabase, the schema already has `grant_status` and
  `last_validated_at` to drive the UI.

## Operator setup

1. Apply `packages/db/migrations/0010_owner_backends_grant_status.sql`.
2. Add `CRON_SECRET` to Vercel env (any random string; Vercel
   auto-injects this when crons are configured but it must exist).
3. The daily cron schedule is in `vercel.json`; Vercel picks it up on
   deploy.
4. For self-hosted operators: replace the Vercel cron with a regular
   `cron` job that curls `/api/cron/validate-backends` with the same
   bearer auth.

## Alternatives considered

- **On-demand validation only** (probe on every Settings page load).
  Cheaper infra but no signal when the user isn't looking. Cron +
  on-demand-trigger-on-load (future improvement) is the path.
- **Cache the latest access token and reuse it.** Saves an OAuth
  exchange per request, but the access token only has ~1h TTL, so the
  win is small and the cache surface is its own thing to maintain.
  Skip.
- **Combine cron + Refresh credentials into one server action** so the
  cron route just forwards. Cleaner code, but means the cron route
  needs admin access on behalf of arbitrary users — wider trust
  surface for no gain. Keep them separate.
