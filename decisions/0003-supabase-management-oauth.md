# 0003 — Supabase Management OAuth

**Status:** Accepted
**Date:** 2026-05-15

## Context

Ticket 10 (`backlog/done/10-supabase-oauth.md`) connects each Buendia user's
Supabase organization to Buendia. The user clicks **Connect Supabase** once;
Buendia thereafter has tokens scoped to managing projects, secrets, and
organizations on their behalf. Ticket 11 will use those tokens to create
the user's "Buendia Apps" project.

## Decision

Use **Supabase's Management OAuth flow** (PKCE) registered as a Supabase
integration. The operator (Buendia) registers one OAuth app per
environment; users grant once.

Endpoints:

- Authorize: `https://api.supabase.com/v1/oauth/authorize`
- Token: `https://api.supabase.com/v1/oauth/token` (HTTP Basic auth with
  `client_id:client_secret`)

Scopes requested:

- `organizations.read` — list the user's organizations.
- `projects.read`, `projects.write` — fetch and create the "Buendia Apps"
  project (ticket 11).
- `secrets.read` — read the project's API keys and JWT secret after creation
  (ticket 11).

The refresh token returned by the exchange is **envelope-encrypted** by
`@buendia/db.encrypt` and stored in
`public.owner_backends.supabase_oauth_refresh_token_encrypted`. The project
URL, keys, and JWT secret are left NULL by this flow — ticket 11 fills them
in after creating the project.

State and PKCE verifier survive the round-trip via a short-lived,
`httpOnly`, `sameSite=lax` cookie (`buendia_supabase_oauth`, 10-minute
TTL). The cookie is deleted on callback regardless of outcome.

## Consequences

**Enables**

- One-click connect from `/settings`.
- Server-side token exchange (client secret never ships to the browser).
- The OAuth refresh token is durable and re-fetchable; if a user's project
  JWT secret rotates, ticket 62 can replay through the management API
  without re-prompting the user.

**Costs**

- The OAuth app must be registered manually per environment (dev preview,
  production, self-hosted instance). Supabase doesn't allow wildcard
  redirect URIs, so Vercel preview deploys can't complete the flow against
  the production OAuth app. Document this; the workaround is to register
  a separate OAuth app for `localhost` and skip OAuth verification on
  preview deploys, or test only against production once an environment
  exists.
- We're coupled to Supabase's specific OAuth endpoints. That's expected
  in MVP (the constitution names Supabase as the launch backend); the
  abstraction layer for swapping vendors is a post-MVP concern.

**Forecloses**

- Nothing material. If we ever need to support multiple backends, the
  OAuth flow would be one of several per-vendor adapters; this code is
  small and replaceable.

## Operator setup

1. In the Supabase dashboard, open **your organization** (not a project),
   then the **Apps** tab. Direct URL:
   `https://supabase.com/dashboard/org/<your-org-slug>/apps`.
   This is distinct from the project-level **Authentication → OAuth Server**
   screen, which is for using a Supabase project as an identity provider —
   not what we want.
2. Click **Add application**. Set the redirect URI to
   `https://<your-production-host>/api/auth/supabase/callback`.
3. Request scopes: `organizations.read projects.read projects.write secrets.read`.
4. Click **Confirm**. Copy the client ID + client secret into Vercel env:
   - `SUPABASE_OAUTH_CLIENT_ID`
   - `SUPABASE_OAUTH_CLIENT_SECRET`
5. Apply `packages/db/migrations/0004_owner_backends_for_oauth_flow.sql`
   so the constraint relaxation and user-write policies are in place.

Reference: [Build a Supabase Integration](https://supabase.com/docs/guides/integrations/build-a-supabase-oauth-integration).

## Alternatives considered

- **Service-role key prompt instead of OAuth.** The user pastes their
  project keys directly into Buendia. Faster for the first user; doesn't
  scale, no project-creation capability, and no revocation path. Rejected.
- **Use Supabase Auth's social OAuth providers (Google, GitHub) for both
  Buendia signin and project management.** They're different flows;
  Supabase Auth signs into Buendia, Management OAuth grants project
  management. They don't substitute.
