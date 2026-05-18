# 73 — MCP docs + onboarding

**Phase:** 7 — Claude / MCP integration
**Depends on:** 72
**Constitution refs:** §Rules for Agents §On UI and copy

## Goal

A non-technical Claude user lands on Buendia, generates a PAT, copies a
two-line config snippet into Claude, and is shipping AI-generated apps
within a couple of minutes. Plus a public `/docs/mcp` page so people
who hear about the integration externally can self-serve.

## Scope

- `apps/web/app/docs/mcp/page.tsx` — public docs page covering:
  - What MCP is (one-paragraph explainer; link to the spec).
  - Install: `npx @buendia/mcp` (or pinned version).
  - Get a PAT from `/settings/tokens`.
  - Paste the config snippet for Claude Desktop and Claude Code. The
    snippet pulls `BUENDIA_PAT` from the user's local environment, not
    from the config file, so users don't commit secrets.
  - Three example prompts that exercise the most useful tools
    (host_app, invite, list_apps).
- `apps/web/app/(dashboard)/settings/tokens/page.tsx` (added in
  ticket 70) gets a sibling **Use with Claude** panel that links to
  `/docs/mcp` and shows the same config snippet, pre-filled with the
  current host. No actual PAT in the snippet — the user pastes it
  themselves into an env var.
- Landing page (`/landing`) gets a new card: **Build with Claude →
  host on Buendia**, deep-linking into `/docs/mcp`.
- README (root) gets a short "Use with Claude" section linking to the
  docs page.

## Out of scope

- A guided "first run" wizard inside the dashboard (modal walkthroughs,
  tooltips, etc.). The docs page is the path for now.
- A no-code "Connect Claude" button that talks to Claude's API on
  the user's behalf. That's a separate ADR — see the _Generate with
  Claude inside Buendia_ option discussed when this work was scoped.

## Acceptance criteria

- [ ] `/docs/mcp` renders for signed-out users (added to public-paths
      list in middleware).
- [ ] A new user can: sign up → connect Supabase → provision project →
      create a PAT → paste the config into Claude → ship their first
      app from a prompt, all within ~5 minutes.
- [ ] The Claude config snippet on `/settings/tokens` matches the one
      on `/docs/mcp`.
- [ ] Landing page card click-through to `/docs/mcp` is wired and the
      visual treatment matches the existing two cards.
