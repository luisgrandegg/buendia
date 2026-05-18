# 0014 — App-origin isolation

**Status:** Proposed
**Date:** 2026-05-18

## Context

Today user-uploaded HTML at `/a/<slug>` is served on the **same origin
as the Buendia dashboard**. PR #42 ([ticket 64][b64]) added a sandbox
CSP that forces the document into a unique opaque origin via
`Content-Security-Policy: sandbox …` — a real mitigation, but a single
header. Browser parsing bugs, future Next middleware changes, or one
forgotten branch in the edge route's error path could undo it. The
security audit ([§C2][audit]) flagged it as Critical and the
remediation ticket [75][b75] called for the durable fix: serve apps
from a different origin entirely, so even if the CSP slips, the
browser's own same-origin policy still keeps dashboard cookies,
`localStorage`, and `IndexedDB` out of reach of app HTML.

This ADR records the structural change. Implementation lands in
follow-up PRs gated on this decision.

### Why now, and not at the start

The MVP shipped serving on the dashboard origin because (a) it was
free in Vercel routing terms and (b) the SDK still used
`credentials: include` to refresh JWTs. PR #49 ([ticket 71][b71])
moved the SDK to bearer auth, so the cookie tether is gone — switching
origins is now a routing-and-CORS exercise rather than an
authentication redesign.

The trigger to land this is the canary user from [backlog/40][b40]:
the first real "owner invites a collaborator" round-trip. Until apps
are shared, the threat is "a user attacking themselves," which is not
a threat worth a major-version uplift.

[audit]: ../SECURITY_AUDIT.md
[b64]: ../backlog/done/64-sandbox-csp-edge-serve.md
[b71]: ../backlog/done/71-jwt-refresh-bearer-auth.md
[b75]: ../backlog/75-app-origin-isolation.md
[b40]: ../backlog/40-project-tracker-canary.md

## Decision

Apps are served from a **separate cookieless origin** distinct from the
dashboard. The dashboard origin (e.g. `buendia.app`) keeps session
cookies; the app origin (`*.apps.buendia.app`) has no ambient
authority and only sees the short-lived JWT the edge route injects
into `window.__APP_CONFIG__`.

### App origin shape: per-slug subdomain on a wildcard

`https://<slug>.apps.buendia.app/`

- `<slug>` is the existing app slug (`^[a-z0-9-]{1,64}$`).
- Wildcard cert provisioned for `*.apps.buendia.app`.
- Dashboard cookies are scoped to `Domain=buendia.app; Path=/` and
  explicitly **not** `*.buendia.app` (i.e. `Domain` either omitted or
  pinned to the dashboard host). The browser will not send them to
  `apps.buendia.app` or any subdomain of it.
- The dashboard host is configured with `Cross-Origin-Opener-Policy:
same-origin`, so an app cannot `window.opener` back into a
  dashboard tab.

Why per-slug, not flat `apps.buendia.app/<slug>`:

- **Cookie isolation by accident:** even if a future code change set
  `Domain=.apps.buendia.app` on something, two different apps still
  live on different origins and can't read each other's storage.
- **`Set-Cookie` from one user's app can't affect another's** — each
  app gets its own cookie jar keyed by origin.
- **CDN cache keys differ naturally**, removing one class of cache-
  poisoning concern.
- **The slug is the canonical identifier already** — we don't have to
  invent new path semantics.

The cost is one wildcard cert (every CDN we'd consider supports them)
and a routing rule that maps subdomain → handler. Both are one-time.

### Routing

A Next middleware (or Vercel rewrite) at the **app-origin host**
forwards `https://<slug>.apps.buendia.app/` to the same handler that
backs `/a/<slug>` today, with `slug` resolved from the host's leading
label. The dashboard host continues to serve everything else; a request
hitting `https://buendia.app/<slug>.apps...` doesn't exist.

The dashboard's old `/a/<slug>` URL becomes a 301 to
`https://<slug>.apps.buendia.app/` for a deprecation window (3 months
suggested) so any link a user shared keeps working. After the window,
`/a/<slug>` is removed.

### Auth model on the app origin

- The edge route still mints a per-user JWT signed with the owner's
  Supabase project JWT secret and injects it into
  `window.__APP_CONFIG__`. Unchanged.
- The SDK refresh fetch from PR #49 calls
  `https://buendia.app/api/jwt/refresh?app=<id>` cross-origin with
  `Authorization: Bearer <currentJwt>` and `credentials: "omit"`. The
  control plane responds with the appropriate CORS preflight allowing
  `Origin: https://<slug>.apps.buendia.app` (matched by a wildcard
  pattern, not echoed verbatim).
- Realtime / WebSocket subscriptions stay on the owner's Supabase URL
  (unchanged); the app origin's role is only to host the document.

### CORS allowlist scope

The dashboard origin's `/api/jwt/refresh` and any other endpoint the
SDK reaches accept cross-origin requests only when:

1. `Origin` matches `^https://[a-z0-9-]{1,64}\.apps\.<root>$` where
   `<root>` is the configured `BUENDIA_APP_ROOT` (e.g. `buendia.app`).
2. Method is `POST`.
3. Headers requested are limited to `Authorization, Content-Type`.

No other dashboard route accepts cross-origin requests. The Origin
allowlist already added in PR #45 ([ticket 72][b72]) for server actions
stays in place — those routes remain same-origin only.

[b72]: ../backlog/done/72-server-action-origin-allowlist.md

### Self-hosted parity (Principle 5)

Self-hosters get a config knob `BUENDIA_APP_ROOT`. Two modes:

- **Default — same root as the dashboard:** dashboard at
  `buendia.example`, apps at `*.apps.buendia.example`. Single wildcard
  cert, one DNS record. The compose recipe documents this.
- **Single-origin fallback** (for laptops, dev tunnels): if
  `BUENDIA_APP_ROOT` is unset, the platform serves apps at
  `/a/<slug>` on the dashboard origin and applies the sandbox CSP
  from PR #42 as the only line of defence. Loud warning on the
  settings page so an operator knows they're running in degraded
  isolation. Suitable for solo use; not recommended for hosting
  third-party collaborators.

This preserves Principle 5 (single codebase, two deployments) without
forcing every self-hoster to provision a wildcard cert.

### What this lets us walk back

PR #42's sandbox CSP becomes **belt-and-braces**. We keep it on the
app origin because cheap defence-in-depth costs nothing, but the
load-bearing isolation is now the origin itself. If a future CSP rule
breaks an app, we can relax it without re-opening the §C2 hole.

## Out of scope

- **Custom domains** for apps (e.g. `todo.example.com`). Possible
  future ticket; needs ACME automation per-app and is orthogonal to
  isolation.
- **Service Workers.** The current SDK doesn't register one; if a
  future change does, the origin migration makes per-app SW scopes
  the right shape automatically.
- **Cross-origin SharedArrayBuffer / `crossOriginIsolated`.** Not
  needed by anything we ship; if it ever is, the app origin will need
  COOP+COEP and the dashboard remains untouched.
- **Cookie scoping for apps.** Apps cannot set first-party cookies
  the dashboard can read, by construction. Per-app cookies stay
  inside the app's origin and survive page reloads, which is fine.

## Consequences

**Risks**

- One more cert and DNS record per deployment. Mitigated by the
  fallback mode for self-hosters.
- The 301 deprecation window means any link a user emailed to a
  collaborator before the cutover keeps working — that's intended,
  but it also keeps the same-origin path warm for three months. Don't
  remove `/a/<slug>` until the deprecation window has passed and the
  bookmarklet (if any) is gone.
- Browsers that pre-flight every cross-origin fetch will add ~100ms to
  the first SDK refresh. Subsequent calls are preflight-cached for the
  duration the browser permits. Not a regression in the steady state.

**Things that get easier**

- We can finally drop `credentials: "include"` everywhere in the SDK
  without losing functionality, and stop reasoning about Next's
  Origin/Host implicit guards as the sole defence.
- The dashboard's `Cross-Origin-Opener-Policy: same-origin` becomes
  enforceable without breaking app HTML (which used to share the
  opener).
- Cache-Control rules on the app HTML and the dashboard divide cleanly:
  no-store on apps, longer caches on dashboard static assets, no risk
  of crossfeeding.

## Migration plan

Sequenced so users always have a working surface.

1. **DNS + cert.** Provision `*.apps.buendia.app` (or the configured
   root). Verify TLS handshake from an arbitrary subdomain returns the
   expected cert.
2. **Routing.** Land a handler / rewrite that maps
   `https://<slug>.apps.<root>/` to the existing `/a/[slug]` logic.
   Both URLs serve identical responses during the transition.
3. **CORS on `/api/jwt/refresh`.** Add the `*.apps.<root>` regex
   allowlist for `Origin`. Confirm SDK refresh from the new origin
   succeeds end-to-end (the canary covers this).
4. **Dashboard cookie scope check.** Audit every cookie set by
   `apps/web` for an over-broad `Domain` attribute. Pin to the
   dashboard host explicitly.
5. **Switch the canary.** Move
   `luisgrandegg/project-tracker` ([backlog/40][b40]) onto the new
   origin. Walk through the full owner-shares-with-collaborator round
   trip from both Chrome and Safari.
6. **Switch new shares.** New invitation URLs point at
   `https://<slug>.apps.<root>/`. Old `/a/<slug>` links 301 to the new
   URL.
7. **Deprecate.** After 3 months of telemetry showing no traffic to
   `/a/<slug>` that isn't redirected, remove the handler.

Each step is its own PR. None of them require coordinated rollout
across multiple repos; the SDK already does the right thing on either
origin because PR #49 dropped the cookie dependency.

## Acceptance criteria for the implementation tickets

Tickets that close ticket 75:

- [ ] Playwright test: a malicious HTML at `<slug>.apps.<root>` running
      `await fetch("https://buendia.app/api/v1/me", { credentials: "include" })`
      cannot read the dashboard user's data (no cookies attached).
- [ ] Playwright test: a malicious HTML at `<slug>.apps.<root>` cannot
      read `localStorage` set by the dashboard origin.
- [ ] The dashboard's session cookie has `Domain` pinned to the
      dashboard host (or `Domain` omitted, which has the same effect).
- [ ] Self-hosted compose recipe brings up dashboard + apps origins
      end-to-end with operator-provided certs.
- [ ] PR #42's sandbox CSP is retained as belt-and-braces. (Document
      the decision explicitly if removed.)
