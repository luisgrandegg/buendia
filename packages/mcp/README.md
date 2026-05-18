# @buendia/mcp

[Model Context Protocol](https://modelcontextprotocol.io/) server for
[Buendia](https://buendia.app) — lets Claude (and any other MCP-aware
client) host single-file HTML apps on Buendia.

After installation a user can say:

> _"Claude, build me a project tracker and host it on Buendia, then
> share it with my husband at husband@example.com."_

Claude generates the HTML, decides on a schema, and chains
`buendia.host_app` → `buendia.provision_schema` →
`buendia.invite_collaborator` — without leaving the chat.

## Install

The server is stateless: it forwards every call to Buendia's HTTP API
using a personal access token you mint at
`https://buendia.app/settings/tokens`.

### Claude Desktop / Claude Code

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`
(Claude Desktop) or `~/.claude/settings.json` (Claude Code):

```json
{
  "mcpServers": {
    "buendia": {
      "command": "npx",
      "args": ["-y", "@buendia/mcp"],
      "env": {
        "BUENDIA_PAT": "buendia_pat_replace-with-your-token"
      }
    }
  }
}
```

Restart Claude; you should see eight `buendia.*` tools in the picker.

### Other MCP clients

Spawn the server over stdio:

```bash
BUENDIA_PAT=buendia_pat_... npx -y @buendia/mcp
```

or over Streamable HTTP:

```bash
BUENDIA_PAT=buendia_pat_... npx -y @buendia/mcp --http 7400
```

## Environment

| Variable             | Default                 | Notes                                                  |
| -------------------- | ----------------------- | ------------------------------------------------------ |
| `BUENDIA_PAT`        | _(required)_            | Personal access token. Mint from `/settings/tokens`.   |
| `BUENDIA_BASE_URL`   | `https://buendia.app`   | Override for staging or self-hosted Buendia instances. |
| `BUENDIA_USER_AGENT` | `buendia-mcp/<version>` | Optional UA suffix; helps when grepping audit logs.    |

## Tools

| Tool                  | Method | Path                                |
| --------------------- | ------ | ----------------------------------- |
| `whoami`              | GET    | `/api/v1/me`                        |
| `list_apps`           | GET    | `/api/v1/apps`                      |
| `host_app`            | POST   | `/api/v1/apps`                      |
| `get_app`             | GET    | `/api/v1/apps/:slug`                |
| `provision_schema`    | POST   | `/api/v1/apps/:slug/provision`      |
| `delete_app`          | DELETE | `/api/v1/apps/:slug`                |
| `invite_collaborator` | POST   | `/api/v1/apps/:slug/shares`         |
| `remove_collaborator` | DELETE | `/api/v1/apps/:slug/shares/:target` |

Each tool is a thin wrapper around the matching `/api/v1/*` endpoint
(see Buendia's `decisions/0012-http-api-v1.md`). The server has no
state of its own — revoking the PAT from `/settings/tokens` immediately
disables every running session.

## Schema rules

`host_app`'s description teaches Claude how to write SQL that Buendia's
provisioner accepts on the first try:

- No `public.` (or any) schema prefix on tables.
- No `grant` or `disable row level security` statements.
- Reference `created_by` instead of `auth.users`.
- Plain DDL only.

If you're hand-writing tools that wrap `host_app` from outside Claude,
the same rules apply.

## Troubleshooting

**`401 unauthenticated` on every call.** The PAT is wrong or revoked.
Mint a fresh one and replace `BUENDIA_PAT`.

**`502 upstream_failed` from `provision_schema`.** Buendia couldn't talk
to your Supabase project. Open `/settings`; if there's a
**Supabase connection broken** banner, click Reconnect.

**Stdout output mangles the MCP transport.** Don't print to stdout from
hooks or wrappers around `buendia-mcp` — the SDK uses stdout as the
wire. The server itself only writes diagnostics to stderr.
