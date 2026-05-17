# 22 — Edge serve route

**Phase:** 2
**Depends on:** 12, 20, 32 (JWT mint)
**Constitution refs:** §4 (real auth), Architecture Invariants §JWT scope is the security boundary

## Goal

`apps/edge` serves user app HTML at `/a/<slug>` with `__APP_CONFIG__` injected,
gated by membership.

## Scope

- Hono server in `apps/edge` (or Next.js route handler if we collapse for MVP;
  decide in `decisions/0003-edge-deployment.md`).
- Resolve slug → app + owner_id.
- Verify the request carries a valid Buendia session cookie and the user
  appears in `app_members` for this app.
- Decrypt the owner's JWT secret, mint a short-lived JWT (≤15 min) via the
  same code path as ticket 32.
- Fetch the HTML blob (aggressively cached at the edge).
- Inject `<script>window.__APP_CONFIG__ = {...}</script>` immediately before
  `</head>`. Stream the response.
- Non-members get a 403 with a clean error page, not a redirect to signin.

## Out of scope

- Subdomain routing (Phase 5 polish).
- Custom domains (post-MVP).

## Acceptance criteria

- [ ] Owner hitting `/a/<slug>` gets the HTML with a valid `__APP_CONFIG__`.
- [ ] Non-member request returns 403.
- [ ] Unauthenticated request redirects to signin then back to the app URL.
- [ ] JWT TTL is ≤15 minutes and signed with the owner's project secret.
