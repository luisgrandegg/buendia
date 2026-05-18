# Buendia

A hosted runtime for AI-generated single-file HTML apps. Apps live on Buendia;
app _data_ lives in the user's own backend, which Buendia provisions and manages
on their behalf.

## Start here

- [`CONSTITUTION.md`](./CONSTITUTION.md) — the binding contract.
- [`MVP.md`](./MVP.md) — the build plan.
- [`CLAUDE.md`](./CLAUDE.md) — the agent guide.
- [`backlog/`](./backlog) — broken-down tickets, grouped by phase prefix.
- [`decisions/`](./decisions) — architectural decision records.

## Repository layout

```
apps/
  web/       Next.js — dashboard, auth, upload, share UI
  edge/      Hono — serves user apps with injected config
packages/
  sdk/       @buendia/sdk — embedded in every user HTML
  mcp/       @buendia/mcp — Model Context Protocol server for Claude
  shared/    Shared TS types, zod schemas, constants
  db/        Migrations, RLS policies, schema provisioner (placeholder)
```

## Use with Claude

Buendia ships a Model Context Protocol server so Claude (Desktop / Code / API)
can host apps for you. Install with `npx -y @buendia/mcp` and a config snippet —
full walkthrough at [`/docs/mcp`](https://buendia.app/docs/mcp) or in
[`packages/mcp/README.md`](./packages/mcp/README.md).

## Local development

Requires Node 22+ and pnpm 10+.

```bash
pnpm install
pnpm dev        # runs all package dev tasks
pnpm build      # builds everything
pnpm lint
pnpm typecheck
```

## Deploying `apps/web` to Vercel

The repo is set up so Vercel can import it directly:

1. In Vercel, **Add New → Project → Import** this GitHub repo.
2. Set **Root Directory** to `apps/web`.
3. Leave the framework preset on **Next.js**. Vercel auto-detects pnpm and Turbo.
4. Deploy.

PRs get preview deployments automatically; `main` deploys to production.
