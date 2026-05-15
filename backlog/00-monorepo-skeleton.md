# 00 — Monorepo skeleton

**Phase:** 0
**Depends on:** none
**Constitution refs:** §5 (single codebase, two deployments)

## Goal

Stand up the pnpm + Turborepo monorepo with the package layout the MVP describes,
TypeScript strict everywhere, and a CI pipeline that lints, typechecks, and
builds on every PR.

## Scope

- pnpm workspaces, Turborepo, Node pinned via Volta.
- Packages: `apps/web` (Next.js 15 App Router), `apps/edge` (Hono on Node),
  `packages/sdk` (pure TS, ESM + IIFE outputs), `packages/shared` (TS types,
  zod schemas, constants), `packages/db` (migrations + provisioner, placeholder).
- TypeScript strict mode across all packages. ESLint + Prettier shared config.
- CI: install, lint, typecheck, build all packages.
- Vercel preview deploy of `apps/web` on PRs.

## Out of scope

- Any business logic.
- The control-plane Supabase project itself (ticket 01).

## Acceptance criteria

- [ ] `pnpm install && pnpm build` is green on a clean clone.
- [ ] PRs run lint + typecheck + build in CI.
- [ ] Pushing to a PR creates a Vercel preview URL for `apps/web`.
