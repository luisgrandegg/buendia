# 0009 — SDK distribution

**Status:** Accepted
**Date:** 2026-05-17

## Context

Ticket 23 ships `@buendia/sdk` v1: a pure-TS library that reads
`window.__APP_CONFIG__` and exposes a typed Supabase client to the
hosted app. The constitution constrains it heavily — no framework,
no build tooling required in the app, `<script>` tag + one call.

The MVP brief says: "Published to npm and served from
`cdn.buendia.app/sdk/v1/buendia.js`." For pre-launch we don't have a
real CDN at that hostname or a published npm package; we need a
serving path that works today.

## Decision

Three outputs, one transport for now:

1. **Build** the SDK with `tsup` (already configured) — emits
   `dist/index.js` (ESM), `dist/index.cjs` (CJS), and
   `dist/index.global.js` (IIFE with `globalName: "Buendia"`).
2. **Serve** the IIFE bundle as a Next.js static asset at
   `/sdk/v1/buendia.js` on the dashboard host. A small sync script
   (`apps/web/scripts/sync-sdk.mjs`) copies
   `packages/sdk/dist/index.global.js` into
   `apps/web/public/sdk/v1/buendia.js` during the apps/web `prebuild`
   step (and `predev` step for local development).
3. **Cache** aggressively: `next.config.ts` adds
   `Cache-Control: public, max-age=31536000, immutable` for any
   `/sdk/v1/*` path. The version is pinned in the URL; a v2 will land
   at `/sdk/v2/` so we never have to bust this cache.

Once the app is live on a stable host, we can flip a CDN like
Cloudflare R2 or jsDelivr in front by changing the URL the docs
recommend — apps already point at `/sdk/v1/buendia.js`, which is the
contract.

## Build orchestration

- **Production build** (`pnpm build` at root): Turbo's `^build` rule
  guarantees `@buendia/sdk` builds before `@buendia/web`. The
  `prebuild` script in `apps/web/package.json` then runs `sync-sdk`
  to copy the IIFE bundle into `public/`.
- **Local dev** (`pnpm dev` in apps/web): the `predev` script
  explicitly runs the SDK build (`pnpm --filter @buendia/sdk build`)
  before copying. Adds ~2 s to first start; subsequent dev runs are
  unaffected.
- **Gitignored.** `apps/web/public/sdk/` is excluded from git; the
  file regenerates on every build.

## Runtime shape

The SDK exports `init()` (and types) at the top level:

```ts
export async function init(): Promise<BuendiaClient>;
```

The IIFE wrapper from `tsup` (with `globalName: "Buendia"`) yields
`window.Buendia.init()` for non-module consumers, and named imports
work in ESM/CJS. Apps then do:

```html
<script src="/sdk/v1/buendia.js"></script>
<script>
  const platform = await Buendia.init();
  // platform.db.from("todos").select(...)
</script>
```

`platform.db` is a `SupabaseClient` configured against the owner's
project with the schema header (`Accept-Profile: app_<slug>`) set so
PostgREST reaches only that app's tables. `accessToken` is a closure
that returns the current JWT — ticket 26 will reach in to refresh it.

## Consequences

**Enables**

- One ergonomic line for app authors: `<script src="/sdk/v1/buendia.js">`.
- A real, working `Buendia.init()` that returns a typed Supabase
  client pinned to the right schema.
- Long-cached, version-pinned distribution — no client-side cache
  bursts needed when we ship v1.1 (still v1) or v2 (new URL).

**Costs**

- The bundle includes `@supabase/supabase-js`, so it's not tiny.
  The MVP brief explicitly carves that out of the budget; the IIFE
  comes in at ~150–200 KB minified, which is in line with what the
  app already pays for using Supabase directly.
- `predev` adds a one-time ~2 s wait for local dev. Acceptable.

**Forecloses**

- Nothing material. Swapping to a real CDN is a URL change in our
  docs; users with hardcoded `/sdk/v1/buendia.js` on the dashboard
  origin keep working.

## Alternatives considered

- **Serve via a Next.js route handler that reads from disk.**
  Doable, but adds runtime overhead and requires
  `outputFileTracingIncludes` plumbing on Vercel to make sure the
  built bundle is included in the function. Static `public/` is the
  default-correct path.
- **Inline the SDK in every `__APP_CONFIG__` injection.** Bloats
  every page render with the same ~200 KB; defeats CDN caching.
- **Publish to npm right away.** Would mean every app author has to
  pick a CDN like jsDelivr or unpkg. Adds a moving part; we can
  publish later when we have a real version cadence.

## Operator setup

None beyond what already exists. The SDK file is generated and
served from the same Next.js deployment.
