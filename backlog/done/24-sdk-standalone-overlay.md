# 24 — SDK standalone-mode setup overlay

**Phase:** 2
**Depends on:** 23
**Constitution refs:** §1 (portability), §2 (opt-in at runtime)

## Goal

When `__APP_CONFIG__` is absent (e.g. the HTML was opened from `file://` or a
static host), the SDK collects Supabase credentials via a setup overlay and
runs the same `Buendia.init()` flow with `mode: 'standalone'`.

## Scope

- Detect absence of `__APP_CONFIG__`.
- Read `localStorage["buendia:<appId>:config"]` if present; use those.
- Otherwise mount a non-dismissable overlay that asks for the Supabase URL +
  anon key. Link to docs explaining where to find them and how to provision a
  free project.
- Persist to localStorage under the namespaced key.
- After collection, the rest of the SDK behaves identically to hosted mode.
- Document the security trade-off in the overlay copy: standalone mode uses
  the anon key directly, with no per-user JWT or revocation.

## Out of scope

- Server-side help / project provisioning from standalone mode (that _is_ the
  hosted platform; standalone deliberately falls back to URL-paste).

## Acceptance criteria

- [ ] Double-clicking an exported HTML opens a working setup overlay.
- [ ] After credentials are pasted, the app's read/write paths behave the
      same as hosted mode (verified by parity test).
- [ ] App code does not branch on `mode` to function correctly.
