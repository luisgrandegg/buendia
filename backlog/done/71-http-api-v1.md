# 71 — HTTP API v1

**Phase:** 7 — Claude / MCP integration
**Depends on:** 70
**Constitution refs:** §6 (SDK is a library, not a runtime), §8 (the stack, not the vendor)

## Goal

Expose Buendia's existing control-plane operations through a small,
versioned JSON HTTP API at `/api/v1/...`. This is the surface the MCP
server (ticket 72) talks to. It's also useful for curl scripts, a
future CLI, and self-hosted operators who want to script their
instance.

The API is a **thin** wrapper over the same server-side functions the
dashboard already uses (upload, provision schema, share, list, etc.).
No new business logic — same code, different transport.

## Scope

- `apps/web/lib/api-auth.ts` — middleware that accepts either:
  - The existing Buendia session cookie (browser path), or
  - `Authorization: Bearer buendia_pat_...` (PAT path, ticket 70).
    Returns a `{ user, supabase }` context shaped like the server-action
    helpers.
- Endpoints under `apps/web/app/api/v1/`:
  - `GET /api/v1/me` — `{ id, email, backend: { connected, hasProject } }`.
  - `GET /api/v1/apps` — list owner apps + shared-with-me apps.
  - `POST /api/v1/apps` — JSON body `{ name?, html, schema_sql? }`.
    Returns the created app's slug + URL.
  - `GET /api/v1/apps/:slug` — single app metadata + collaborators.
  - `DELETE /api/v1/apps/:slug` — same path as ticket 50's action.
  - `POST /api/v1/apps/:slug/provision` — runs ticket 21's provisioner
    against the stored schema_sql.
  - `POST /api/v1/apps/:slug/shares` — body `{ email, role }`.
  - `DELETE /api/v1/apps/:slug/shares/:user_or_email` — remove a share
    or cancel a pending invitation.
- JSON error shape: `{ error: "code", message: "human-readable" }`.
  Status codes match the dashboard's redirects (400 / 401 / 403 / 409 /
  502).
- Refactor existing server actions to share their core with the API
  handlers (extract `lib/operations/*.ts`). Server actions stay thin
  wrappers that translate FormData + redirect; HTTP handlers wrap the
  same functions and return JSON.

## Out of scope

- WebSocket / SSE endpoints. App realtime stays on the per-user
  Supabase project (the SDK's existing path).
- Versioned breaking changes. `/api/v1/*` is the only contract for now;
  `v2` lands when something compels it.
- Operations the dashboard doesn't have (e.g. transfer ownership,
  bulk imports). Don't add new surface, just expose existing.

## Acceptance criteria

- [ ] Every endpoint accepts both session cookie and PAT auth.
- [ ] Hitting an endpoint without auth returns `401`.
- [ ] PAT auth resolves to the same `user` shape the session path
      produces; downstream code can't tell which path the request
      came from.
- [ ] Uploading an app via `POST /api/v1/apps` + provisioning via
      `POST /api/v1/apps/:slug/provision` produces an app
      indistinguishable from one created through the dashboard.
- [ ] No business logic lives only in the HTTP handlers — the same
      function is also used by the corresponding server action.
- [ ] Audit log rows are emitted identically regardless of transport.
