# 75 — App-origin isolation (cookieless app domain)

**Phase:** 6
**Severity:** Critical (durable fix for ticket 64 / C2)
**Audit ref:** SECURITY_AUDIT.md §C2 (step 2)
**Depends on:** 64 (short-term CSP mitigation), 71 (bearer-auth refresh)
**Constitution refs:** Principle 1 (portability), Principle 4 (real auth), Principle 7 (sharing is access, not ownership transfer).

## Goal

Serve user-uploaded HTML at `/a/<slug>` from a separate, cookieless origin so the app cannot reach dashboard cookies, IndexedDB, or `localStorage` even when a sharee opens it. This is the structural fix; ticket 64's sandbox CSP is a stopgap.

## Background

The current same-origin model means a malicious owner's HTML, opened by a sharee, runs JavaScript inside `buendia.app` with the sharee's first-party cookies. The only durable defence is origin isolation: the dashboard origin (`buendia.app`) holds auth cookies; the app origin (`*.apps.buendia.app` or per-slug `<slug>.apps.buendia.app`) is cookieless and only sees the short-lived JWT the edge route injects.

## Scope

- **ADR first.** Open `decisions/0014-app-origin-isolation.md` covering:
  - Per-tenant subdomain vs wildcard `apps.buendia.app` (preferred: per-app slug subdomain for cookie isolation and identifiability).
  - Wildcard cert / Vercel domain config.
  - Self-hosted parity (Principle 5): same scheme must work on `docker compose`.
  - Edge route mapping from `<slug>.apps.<host>` to the storage object.
  - CORS implications for the SDK ↔ control plane (now genuinely cross-origin).
- Implementation:
  - DNS + cert for `*.apps.buendia.app`.
  - New Vercel routing or edge function that maps `<slug>.apps.…` → existing edge serve handler.
  - Dashboard cookies tightened to the dashboard domain only (`Domain=buendia.app; Path=/`).
  - SDK refresh fetch now points at `https://<dashboard-host>/api/jwt/refresh` with `Authorization` bearer (ticket 71 prerequisite).
  - CORS on `/api/jwt/refresh` and any other endpoint the SDK calls cross-origin: allow only `*.apps.<host>`, only the methods the SDK needs.
  - Migration: existing apps keep working at the old path during a deprecation window; new shares always go to the new origin.
- Tests:
  - Sharee opening a malicious-HTML app from the canary cannot read dashboard cookies (browser test under Playwright).
  - SDK round-trip from the app origin to the control plane works without cookies.
  - Self-hosted compose recipe still works (no SaaS-only assumption).

## Out of scope

- Per-app custom domains (post-MVP).
- Service Worker scoping (separate concern).

## Acceptance criteria

- [ ] ADR merged before code.
- [ ] App HTML served from a different origin than the dashboard.
- [ ] Playwright test demonstrates cookie isolation.
- [ ] Self-hosted compose recipe updated and smoke-tested.
- [ ] Ticket 64's sandbox CSP can be relaxed (or kept as belt-and-braces — document decision).
