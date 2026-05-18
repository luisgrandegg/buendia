# 64 — Sandbox CSP on `/a/<slug>` edge serve route

**Phase:** 6
**Severity:** Critical (short-term mitigation for ticket 75)
**Audit ref:** SECURITY_AUDIT.md §C2 (step 1)
**Constitution refs:** Principle 7 (sharing is access, not ownership transfer).

## Goal

Stop user-uploaded HTML at `/a/<slug>` from running with ambient authority against the dashboard origin. This is the short-term mitigation; ticket 75 is the durable fix (cookieless app origin).

## Background

The edge route currently sets only `Content-Type: text/html; charset=utf-8`. Because the page is same-origin with the dashboard, a malicious owner's HTML opened by a sharee can call `/api/v1/*` and Next server actions with the sharee's first-party cookies. Adding `Content-Security-Policy: sandbox …` forces the document into a unique opaque origin so its scripts cannot reach dashboard cookies or `localStorage`, even from the same hostname.

## Scope

- In `apps/web/app/a/[slug]/route.ts`, update `htmlHeaders()` to set:
  - `Content-Security-Policy: sandbox allow-scripts allow-forms allow-popups allow-modals; default-src 'self' https:; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; connect-src 'self' https:; img-src 'self' data: blob: https:; frame-ancestors 'self';`
  - `X-Frame-Options: SAMEORIGIN`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: no-referrer`
  - `Cross-Origin-Opener-Policy: same-origin`
- Apply the headers to all responses from this route (HTML, 403, 404, 502, 500), not just success.
- Vitest: assert headers on every response branch.
- Manual test: confirm the project-tracker canary still works under the new CSP. Tune `script-src`/`connect-src` if Supabase realtime or the SDK CDN need allowances.

## Out of scope

- Moving apps to a separate origin (ticket 75).
- Per-app CSP customisation by the owner.

## Acceptance criteria

- [ ] All five response branches return the hardened headers.
- [ ] A canary HTML attempting `fetch("/api/v1/me", { credentials: "include" })` from inside `/a/<slug>` is blocked by the sandbox (assert in test).
- [ ] Project-tracker canary still passes end-to-end.
