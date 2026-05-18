# 72 — `@buendia/mcp` server

**Phase:** 7 — Claude / MCP integration
**Depends on:** 70, 71
**Constitution refs:** §6 (SDK is a library, not a runtime), §8 (the stack, not the vendor — MCP is an open protocol)

## Goal

Ship a Model Context Protocol server that gives Claude (Claude Desktop,
Claude Code, Anthropic API consumers with MCP) tools to host apps on
Buendia. A user adds Buendia once to their MCP config, then prompts:

> _Claude, build me a project tracker and host it on Buendia, then
> share it with my husband at husband@example.com._

Claude generates the HTML, decides whether a schema is needed (and what
it should look like), calls `buendia.host_app` + `buendia.provision_schema`

- `buendia.invite_collaborator`, and hands the user a URL.

## Scope

- New package `packages/mcp` (npm-publishable as `@buendia/mcp`):
  - Built with `@modelcontextprotocol/sdk` (TypeScript). Stdio + HTTP
    transports both supported.
  - Reads `BUENDIA_PAT` and `BUENDIA_BASE_URL` env vars (defaults to
    `https://buendia.app`).
  - Tools (1:1 with HTTP API endpoints from ticket 71):
    - `whoami()`
    - `list_apps()`
    - `host_app({ name?, html, schema_sql? })` — returns `{ slug, url }`.
    - `get_app({ slug })`
    - `provision_schema({ slug })`
    - `delete_app({ slug })`
    - `invite_collaborator({ slug, email, role })`
    - `remove_collaborator({ slug, user_or_email })`
  - Each tool has a clear JSON schema + description so Claude picks
    the right one. The description for `host_app` includes a brief
    note about Buendia's schema-augmentation rules (no `public.`
    prefix, no `GRANT`, no `DISABLE ROW LEVEL SECURITY`) so Claude
    generates compatible SQL the first try.
- `packages/mcp/README.md` covers installation, the Claude config
  snippet (Claude Desktop `claude_desktop_config.json` and Claude
  Code `~/.claude/settings.json`), and the env vars.
- Published to npm + served from the docs page (ticket 73). The
  release script lives in `packages/mcp/scripts/release.mjs`.

## Out of scope

- A hosted MCP server (only stdio + HTTP for self-hosting). Hosting
  the MCP server centrally is a follow-up if there's demand.
- Server-side LLM calls. The MCP server only mediates between Claude
  and Buendia's HTTP API; it doesn't call any LLM.
- App-data tools (read rows, write rows). The SDK + the user's
  Supabase already covers that — exposing it through MCP would
  cross the JWT-scope boundary.

## Acceptance criteria

- [ ] `npx @buendia/mcp` runs the server on stdio.
- [ ] Claude Desktop with the published config snippet can list tools,
      and a prompt like _"host this HTML on Buendia"_ successfully
      lands an app in the user's dashboard.
- [ ] Tool descriptions are good enough that Claude doesn't mis-call
      `host_app` with a `public.` prefix or a `GRANT` statement on
      the first attempt for typical CRUD schemas (verified by manual
      eval against 5 different "build me X" prompts).
- [ ] Invalid PAT → MCP surfaces a `401 invalid_token` error to Claude
      with a `Reconnect Buendia in your MCP config` hint.
- [ ] The MCP server has zero state of its own. All persistence is on
      Buendia.
