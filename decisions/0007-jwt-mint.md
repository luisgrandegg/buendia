# 0007 — JWT mint endpoint

**Status:** Accepted
**Date:** 2026-05-17

## Context

Constitution §4 (real auth) and the JWT-scope architecture invariant
say every request hitting an owner's Supabase project must carry a JWT
that **Supabase signed itself accepts** and that pins the four claims
the RLS policies key off (`sub`, `app_id`, `app_schema`, `team_id`,
`buendia_role`). Ticket 32 builds that minter; ticket 22 (edge serve)
and ticket 26 (SDK refresh) consume it.

## Decision

A single control-plane endpoint at `POST /api/jwt/refresh?app=<id>`:

1. Reads the requester from the Buendia session cookie. No session → 401.
2. Looks up `public.app_members` for `(app_id, user_id)`. Misses → 403.
   The view unions the owner row from `public.apps` with collaborator
   rows from `public.app_shares` (added in this PR's migration).
3. Fetches the owner's backend row from `public.owner_backends` and
   decrypts the `supabase_jwt_secret_encrypted` column with
   `BUENDIA_MASTER_KEY`.
4. **Hand-signs an HS256 JWT** with `lib/jwt-mint.ts`. 15-minute TTL,
   hard-capped, no knob. Claims: `sub`, `aud=authenticated`,
   `role=authenticated`, `iss=buendia`, `app_id`, `app_schema`,
   `team_id`, `buendia_role`, `iat`, `exp`.
5. Returns `{ jwt, exp }` as JSON.

No `jsonwebtoken` dependency. HS256 is one HMAC + two base64-url
encodings — pulling in a sprawling JWT library for that surface is
unwarranted.

## Why these claims

The Supabase project on the receiving end is an off-the-shelf Supabase
project. Its PostgREST + Realtime + GoTrue stack validates JWTs using
the project's JWT secret and reads:

- `role` → sets the Postgres role for the request (we always send
  `authenticated`, never `service_role` — those operations live on the
  server).
- `aud` → must be `authenticated` for the GoTrue path to accept it.
- `sub` → becomes `auth.uid()` inside SQL.
- everything else → reachable via `auth.jwt() ->> 'name'` from RLS
  policies and from the SDK.

`team_id` and `buendia_role` are how the schema provisioner's
(ticket 21) default policies separate apps and gate writes by role.
`app_id` and `app_schema` are convenience claims for the SDK to
configure the PostgREST `Accept-Profile` header to the right schema
without an extra round-trip.

## Membership lookup

A new view `public.app_members` unions:

- The owner row from `public.apps` (role = `'owner'`).
- Collaborator rows from `public.app_shares` (role = `'viewer'` or
  `'editor'`).

The view also surfaces `team_id` and `schema_name` so the mint endpoint
needs a single read instead of two. RLS on the underlying tables means
the view returns only rows the requester is allowed to see — so a
non-member doesn't even reveal the app's existence.

## Known gap (intentional, deferred)

The endpoint fetches `owner_backends.supabase_jwt_secret_encrypted`
through the requester's Supabase session. When the requester is a
_collaborator_ (not the owner), RLS on `owner_backends` denies the
read, and they'll get a `502 backend_not_ready` instead of a JWT.

The MVP correct fix is to perform the read server-side with a route
that bypasses publishable-key RLS — either via the management API or
by giving Buendia's server code a control-plane service-role key. We
choose to land that with the **edge serve route (ticket 22)** because
it owns the same trust boundary and avoids introducing the
control-plane service-role key as a new env var in this PR.

For now: owners can mint for themselves (the dashboard's only
consumer), and the share/edge flow gets wired in ticket 22+30.

## Consequences

**Enables**

- The edge serve route (ticket 22) gets a clean function to inject
  `__APP_CONFIG__.jwt` with.
- The SDK's silent refresh (ticket 26) has an endpoint to hit.
- A revoked share fails the next refresh (within the 15-minute TTL
  window) without us needing any "expire over time" model.

**Costs**

- The owner-only limitation above. Documented and ticketed.
- Hand-signed JWT means we're responsible for getting HS256 right
  forever. The minter is short; we can swap in a library if a CVE
  ever lands.

**Forecloses**

- Nothing material. Algorithm choice is HS256 to match Supabase's
  default; swapping to RS256 would require a coordinated change on
  the owner's project, which Supabase doesn't currently expose a
  knob for.

## Operator setup

Apply `packages/db/migrations/0007_app_shares.sql` in the control
plane. No new env vars.
