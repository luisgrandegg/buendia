# 0013 — `@buendia/mcp` server

**Status:** Accepted
**Date:** 2026-05-18

## Context

Buendia's whole bet is that AI-generated single-file HTML apps are a
real category once hosting them takes a single sentence. The HTTP API
from ticket 71 lets a curl user drive the platform, but the user we
actually want is "someone who talks to Claude." The Model Context
Protocol is the open standard for letting an LLM call tools; shipping
Buendia as an MCP server is the path of least surprise.

## Decision

Ship a new package `@buendia/mcp` that:

- Talks to Buendia over the same HTTP surface from ticket 71.
- Authenticates with a personal access token from ticket 70 read
  from the `BUENDIA_PAT` env var.
- Exposes one MCP tool per `/api/v1/*` endpoint (`whoami`,
  `list_apps`, `host_app`, `get_app`, `provision_schema`,
  `delete_app`, `invite_collaborator`, `remove_collaborator`).
- Defaults to stdio transport (Claude Desktop, Claude Code). Accepts
  `--http <port>` for clients that prefer Streamable HTTP.
- Has zero state of its own. Revoking the PAT in Buendia's UI is the
  one-click kill switch for every running session.

### Why a separate package

- **npm-publishable** so `"command": "npx", "args": ["-y", "@buendia/mcp"]`
  is the install instruction. No build step on the user's side.
- **Doesn't drag the web app into the MCP runtime.** Self-hosted users
  can run the MCP server pointed at their instance without checking
  out the monorepo.
- **Boundary of trust.** The package only needs the MCP SDK + a fetch
  client. It never touches credentials, KEKs, or Buendia's database.

### Tool descriptions matter

Claude reads the tool description to decide which tool to call and how
to populate arguments. We invest in `host_app`'s description in
particular: it includes the schema-augmentation rules ("no `public.`
prefix, no `GRANT`, no `disable row level security`, reference
`created_by` not `auth.users`") so Claude generates compatible SQL on
the first try. Catching this mistake on Buendia's side is also
possible (the schema provisioner already does deny-list validation),
but the cheapest fix is to never write the wrong SQL.

### Error surface

`BuendiaApiError` wraps the API's `{ error, message, details? }`
envelope. The MCP tool layer surfaces these to Claude as an error
result; a 401 gets an extra hint pointing the user back to
`/settings/tokens`, which is the only recovery the MCP server can
actually drive (it can't re-OAuth Supabase for the user — that's
Buendia's job).

## Out of scope

- **App-data tools.** Exposing `select`/`insert` against the user's
  Supabase project through MCP would cross the JWT-scope boundary —
  the SDK + the user's project already covers that path, and a
  full-power data tool would defeat the per-app RLS isolation. If we
  ever want it, it'd be the user calling Buendia's mint endpoint
  themselves and pasting the resulting JWT into a separate tool.
- **Server-side LLM calls.** The MCP server mediates between Claude
  and Buendia; it doesn't call an LLM. Buendia's constitution forbids
  AI generation inside the platform.
- **A hosted MCP server.** Each user runs the binary locally. Hosting
  a multi-tenant MCP server would mean trusting Buendia with every
  participant's chat content; nothing else in the system requires
  that, and it would invite a giant prompt-injection surface.

## Consequences

**Enables**

- A non-technical user can install Claude Desktop, paste a PAT, and
  ship an app to Buendia from chat.
- The same package works for any other MCP-aware client (the IDE
  integrations, Anthropic API consumers with MCP, future tools).
- The HTTP API + MCP server are version-locked through a single
  contract — when the API gains an endpoint, we add a tool with the
  same shape.

**Costs**

- One more package to publish, version, and document. Release scripts
  go alongside `packages/sdk` when those land.
- Tool descriptions are part of the surface area: changing how Claude
  interprets `host_app`'s "schema_sql" param can subtly change which
  prompts succeed. Track this in the release notes.

**Forecloses**

- Nothing material. If hosted MCP becomes interesting (multi-user
  Claude.ai instances, say) we can add a second deployment target
  later; the tool wiring is reusable.

## Alternatives considered

- **Skip MCP and ship a CLI instead.** Non-technical users don't open
  terminals. CLI is still useful for power users and lands later
  alongside ticket 73's docs — but it's a complement, not a substitute.
- **Mount the tools as direct HTTP endpoints with an OpenAPI spec.**
  Anthropic's API consumers can adapt OpenAPI, but it's strictly more
  work for the user than dropping an `mcpServers` block into a config.
- **Use the low-level MCP SDK (`Server` + manual schema handlers)
  instead of `McpServer.tool`.** Both work; the high-level API costs
  less code and the wire format is identical.

## Operator setup

- Install: `npx -y @buendia/mcp` (or pin a version in `package.json`).
- Provide `BUENDIA_PAT`; optionally override `BUENDIA_BASE_URL` for
  staging or self-hosted instances.
- Distribution: published to npm; the docs landing page (ticket 73)
  carries the install snippet.
