# 0004 — User-project provisioning

**Status:** Accepted
**Date:** 2026-05-15

## Context

After ticket 10's OAuth handshake, Buendia has a refresh token but no
project. Ticket 11 (`backlog/done/11-project-provisioner.md`) fills the
gap: create one Supabase project per Buendia user, fetch its URL and
keys, and persist them encrypted on `owner_backends`.

The challenge is the wait. Supabase's `POST /v1/projects` returns
immediately with a project ref but `status = "INACTIVE"`; the project
takes 30–60 seconds to reach `ACTIVE_HEALTHY`. The MVP UX absorbs the
wait inline.

## Decision

A **single synchronous endpoint** at `POST /api/owner-backend/provision`
that:

1. Reads the user's encrypted refresh token, decrypts it with
   `BUENDIA_MASTER_KEY`.
2. Trades the refresh token for a fresh access token (`refreshAccessToken`).
3. Lists the user's organizations and picks the first. Multi-org
   selection is post-MVP.
4. Generates a random DB password (24 bytes base64) and calls
   `POST /v1/projects` with `plan: "free"`, `region: "us-east-1"`,
   `name: "Buendia Apps"`. The DB password is not stored — the user can
   reset it from Supabase any time.
5. Polls `GET /v1/projects/<ref>` every 4 seconds for up to
   **50 seconds** (under Vercel Hobby's 60-second function timeout) until
   `status` is `ACTIVE_HEALTHY`.
6. Once ready, fetches the project's API keys and JWT secret in parallel.
7. Calls `completeProvisioning()` to encrypt everything and write it to
   `owner_backends`. The new refresh token (Supabase rotates them on
   exchange) is persisted in the same write.
8. Emits a `backend.project_provisioned` audit row.

If the project hasn't reached active in 50s, the endpoint returns
`202 Accepted` with `{ error: "still_provisioning", projectRef }`. The
UI tells the user to refresh in a moment — a follow-up that polls in
the background can claim the project and finish writing its credentials.

`@supabase/management-js` is **not** used. Four raw `fetch` calls are
all we need and they keep the dependency surface tight.

## Free tier limit (402)

If the user's organization is at the 2-project free-tier cap, the
Management API returns `402 Payment Required`. The endpoint surfaces a
specific error (`free_tier_limit`) so the UI can tell the user to free a
slot or upgrade. We don't auto-upgrade plans on the user's behalf.

## Consequences

**Enables**

- One click on `/settings` (after Connect Supabase) produces a fully
  provisioned, ready-to-use Supabase project, owned by the user, with
  every sensitive credential encrypted at rest.
- The `owner_backends` row is now "complete" in the sense ticket 12's
  schema described — ticket 20 (HTML upload) and ticket 21 (schema
  provisioner) can rely on every column being present.

**Costs**

- The endpoint blocks for up to 50 seconds. If the provisioning takes
  longer (rare), the user sees a "still working — refresh" message
  rather than auto-completion. A background-completion follow-up would
  fix this; for MVP, manual refresh is acceptable.
- Single-organization assumption: we pick the first org returned. Users
  with multiple Supabase organizations cannot direct Buendia to a
  specific one without code changes. Post-MVP.
- We don't store the database password. Users who need direct DB access
  can reset it from Supabase's project settings.

**Forecloses**

- Nothing material. A future async-provisioning ticket can replace the
  blocking poll with a background job; the schema and call sites stay.

## Alternatives considered

- **`@supabase/management-js`.** Adds a dependency for four calls. The
  raw `fetch` approach is ~150 lines of TypeScript with no extra runtime
  weight.
- **Background-only provisioning** (kick off, never block). Better UX
  on slow networks but adds infrastructure (a worker / cron) that we
  don't otherwise need yet. We can layer it on top of the current
  blocking flow when the manual-refresh UX becomes annoying.
- **Auto-trigger provisioning from the OAuth callback.** Considered;
  rejected because the OAuth callback should redirect quickly and a
  provisioning failure shouldn't poison the connect step. With a
  separate endpoint, the user can retry provisioning without
  re-OAuthing.

## Operator setup

No new operator step beyond ticket 10's. Make sure
`BUENDIA_MASTER_KEY` is set and the OAuth app has
`projects.write secrets.read organizations.read` scopes (already
documented in ADR 0003).
