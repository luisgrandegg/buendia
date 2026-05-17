# 23 — SDK v1, hosted mode

**Phase:** 2
**Depends on:** 22
**Constitution refs:** §2 (opt-in at runtime), §6 (library, not runtime), §8 (the stack, not the vendor)

## Goal

Ship `@buendia/sdk`: a pure-TS, framework-free library that resolves
`__APP_CONFIG__`, constructs a `SupabaseClient` pinned to the app's schema,
and exposes a tiny typed surface.

## Scope

- Pure TS, no React/Vue/Solid. ESM + IIFE outputs.
- `Buendia.init()` returns `BuendiaClient` per the MVP §SDK Surface section.
- Reads `__APP_CONFIG__`. Configures the Supabase client with
  `Accept-Profile: app_<slug>` so PostgREST only reaches the app's schema.
- Surface: `.db`, `.user`, `.app`, `.mode = 'hosted'`.
- Published to npm and served from `cdn.buendia.app/sdk/v1/buendia.js` (own
  the version path so v2 can roll without breaking v1 consumers).

## Out of scope

- Standalone mode overlay (ticket 24).
- Realtime (ticket 25), refresh (ticket 26).

## Acceptance criteria

- [ ] A vanilla HTML page with `<script type="module">` import works after
      `await Buendia.init()`.
- [ ] Reads/writes hit only `app_<slug>` (verified with PostgREST trace).
- [ ] SDK bundle size budget: ≤30 KB gzipped for `v1` excluding
      `@supabase/supabase-js`.
