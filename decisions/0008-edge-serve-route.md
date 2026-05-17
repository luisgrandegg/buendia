# 0008 — Edge serve route

**Status:** Accepted
**Date:** 2026-05-17

## Context

Tickets 20 (upload) and 32 (JWT mint) added the pieces; ticket 22 is
the route that finally lets the user **open** their app in a browser.

Two open architectural choices going in:

1. **Where does serving live?** `MVP.md` describes `apps/edge` as a
   separate Hono process. The same doc allows: _"could be collapsed
   into Next.js API routes; revisit if scaling profiles diverge."_
2. **Who reads the owner's JWT secret + HTML blob server-side?**
   Collaborators can't see the owner's `owner_backends` row or HTML
   storage objects through publishable-key RLS (ADR 0007's deferred
   gap).

## Decision

**Serve from `apps/web` as a Next.js route handler.** A single
`/a/[slug]` route in `app/a/[slug]/route.ts` returns HTML directly,
injects `window.__APP_CONFIG__` before `</head>`, and mints a fresh
15-minute JWT per request. The standalone `apps/edge` Hono service in
the monorepo remains for future use; collapsing into `apps/web` now
means one deployment, one auth boundary, and one set of env vars to
wire up.

**Introduce a control-plane admin client.** `SUPABASE_SECRET_KEY` is
added as a server-only env var. `lib/supabase/admin.ts` exposes
`createAdminClient()` that uses it. The serve route uses the admin
client for two operations only:

- Reading the owner's `owner_backends` row (decrypt JWT secret +
  publishable key).
- Downloading the HTML blob from `app-html` storage.

Membership lookup still goes through the requester's session
(RLS-bound via `app_members`). The admin client never reads or writes
app data; that always flows through the per-user Supabase project
with a scoped JWT, per the JWT-scope architecture invariant.

The same refactor cleans up the JWT mint endpoint (`/api/jwt/refresh`)
to use the admin client for its `owner_backends` lookup. Closes
ADR 0007's deferred gap — collaborators can now mint and serve.

## Request flow

```
GET /a/<slug>
  ↓
  middleware                          (redirects to /signin if not auth'd)
  ↓
  route handler
    ↓
    session client → app_members lookup       (RLS: member-only)
    ↓
    admin client  → owner_backends            (decrypts JWT secret + key)
    ↓
    mint JWT (15-min TTL, owner's secret)     (lib/jwt-mint.ts)
    ↓
    admin client  → download app-html blob    (bypasses object RLS)
    ↓
    inject window.__APP_CONFIG__ before </head>
    ↓
    respond 200, Cache-Control: no-store
```

Error pages (forbidden, not-ready, not-found) ship as minimal inline
HTML so the user always sees a clear message rather than a JSON blob
or a Next.js error page.

## `__APP_CONFIG__` shape

Lives in `packages/shared` as `BuendiaAppConfig` so the edge route and
the SDK (ticket 23) consume the same type:

```ts
interface BuendiaAppConfig {
  hosted: true;
  supabaseUrl: string;
  publishableKey: string;
  jwt: string;
  jwtExp: number;
  user: { id: string; email: string; role: AppRole };
  app: { id: string; name: string; slug: string; schema: string; teamId: string };
  refreshUrl: string;
}
```

The SDK can construct a `SupabaseClient` from these three top-level
fields, can identify the signed-in user, and knows where to POST for
silent refresh.

## Consequences

**Enables**

- The Open ↗ button on the dashboard finally works.
- Realtime (ticket 25) and the SDK (ticket 23) have a real
  `__APP_CONFIG__` to consume.
- Revocation (ticket 33) becomes a real thing: deleting an
  `app_shares` row blocks the next render within the JWT TTL window.

**Costs**

- A new high-stakes env var (`SUPABASE_SECRET_KEY`). Documented in
  `.env.example` and the operator setup; never logged; never imported
  outside `lib/supabase/admin.ts`.
- HTML is fetched from Supabase Storage on every request (no caching
  layer between Buendia and the client). For MVP that's fine —
  Vercel's edge cache + Supabase's CDN absorb the load — but a future
  ticket might want an explicit CDN-friendly layer.

**Forecloses**

- Nothing material. If `apps/web` ever needs to scale serving
  separately from the dashboard, `apps/edge` can take over with the
  same route logic copied over; the contract is the HTTP surface,
  not the binary.

## Alternatives considered

- **Separate `apps/edge` Hono service.** Cleaner separation but
  doubles deployments, duplicates auth wiring, and introduces a new
  set of env vars. The MVP doc explicitly allows collapsing; we do.
- **Sign URLs to Supabase Storage and let the browser fetch HTML
  directly.** The HTML never has `__APP_CONFIG__` injected without a
  server roundtrip, so this saves nothing for the hosted path. It
  could help with standalone bundles (ticket 51 export) but that's
  a separate flow.
- **Use the JWT mint endpoint inside the route handler.** Same
  code path either way; calling `mintAppJwt()` directly avoids an
  extra HTTP hop without changing semantics.

## Operator setup

1. Apply `packages/db/migrations/0008_app_members_with_app_fields.sql`.
2. Add `SUPABASE_SECRET_KEY` to Vercel env (Production + Preview).
   It's the **control-plane** project's secret key (Project Settings
   → API Keys → `sb_secret_...`), not the user's per-app secret.
