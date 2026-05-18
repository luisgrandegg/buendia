# 0012 — HTTP API v1

**Status:** Accepted
**Date:** 2026-05-18

## Context

Until now, every control-plane operation on Buendia ran through a
server action behind the dashboard. That's fine for browser users but
doesn't help the two non-browser clients we're about to ship:

- The MCP server (ticket 72) — runs locally next to Claude and needs
  to upload, share, and provision apps over JSON.
- A future CLI / curl-driven scripts — same need.

The actions themselves are 99 % business logic and 1 % "redirect with a
status query param". The rewrite ratio of "extract a function and call
it from a route handler" is high; the duplication ratio if we don't is
also high. So this ticket lifts the business logic into a transport-
agnostic operations layer and adds a versioned JSON API on top.

## Decision

### Auth (`apps/web/lib/api-auth.ts`)

`authenticateApi(req)` accepts:

- `Authorization: Bearer buendia_pat_…` — verified via the ticket-70
  helper. Wins over the cookie path: an explicit bearer header always
  asserts the caller's intent.
- The Supabase session cookie — same path the dashboard uses.

Both resolve to a single `{ user, supabase, authPath }` context where
`supabase` is the control-plane **admin** client. Operations therefore
cannot rely on RLS as the security boundary — they MUST filter by
`user.id` themselves. This matches what the existing dashboard actions
already do (every one performs an explicit `owner_id === user.id`
check), and lets one operation function serve both transports.

The cookie-path tradeoff is losing RLS as defence-in-depth. We accept
this in exchange for not maintaining two parallel data paths.

### Operations (`apps/web/lib/operations/*.ts`)

Each operation:

- Takes an admin Supabase client + an explicit `userId`.
- Filters by `userId` for every write, and checks `owner_id` before
  every owner-only action.
- Returns `OpResult<T> = { ok: true; data } | { ok: false; error }`
  where `error` has a stable `code`, a human `message`, and an HTTP
  `status`. No exceptions across the action ↔ HTTP boundary.

Modules:

- `operations/apps.ts` — uploadApp, listAppsForUser, getAppForUser,
  renameApp, deleteApp, provisionAppSchema.
- `operations/shares.ts` — addCollaborator (returns either a `share`
  or an `invitation` result), removeCollaborator, cancelInvitation.

### HTTP surface (`apps/web/app/api/v1/`)

| Method | Path                                              | Notes                           |
|--------|---------------------------------------------------|---------------------------------|
| GET    | `/api/v1/me`                                      | identity + backend status       |
| GET    | `/api/v1/apps`                                    | owned + shared                  |
| POST   | `/api/v1/apps`                                    | body `{ html\|html_base64, name?, schema_sql? }` |
| GET    | `/api/v1/apps/:slug`                              | detail + collaborators          |
| DELETE | `/api/v1/apps/:slug`                              | owner-only                      |
| POST   | `/api/v1/apps/:slug/provision`                    | re-runs schema provisioner      |
| POST   | `/api/v1/apps/:slug/shares`                       | body `{ email, role? }`         |
| DELETE | `/api/v1/apps/:slug/shares/:target`               | target = user uuid or email     |

Error shape: `{ error: "code", message: "human", details?: {...} }`.

### Action refactor

The form-action wrappers now do FormData parsing → operation call →
redirect-with-status translation. The mapping from `OpError.code` back
to the dashboard's per-flow status strings is mechanical; we lose a
little fidelity (some `bad_request` codes collapse onto a single
banner) but the UX is unchanged in practice.

## Why not GraphQL / tRPC / a hand-rolled RPC layer

- **GraphQL** — buys nothing here; the surface is small and the
  consumers are tools, not UIs with overfetching concerns.
- **tRPC** — would couple the API to TypeScript clients. MCP clients
  are often spawned in other runtimes; raw HTTP keeps the door open.
- **A custom RPC** — every JSON RPC framework eventually evolves into
  REST with worse docs.

## Consequences

**Enables**

- The MCP server (ticket 72) is now mechanically straightforward —
  each tool is a thin wrapper around an HTTP call.
- CLI / curl scripting for advanced users.
- A future v2 can stand alongside v1 without breaking either.
- Test coverage gets easier — operations are pure-ish functions
  testable without a Next.js request.

**Costs**

- One more layer (operations) between actions and storage. The
  per-flow status mapping in the actions is now best-effort string
  matching against operation error messages; we could replace it with
  a richer error code if it gets in the way.
- The admin-client-everywhere choice means we lean fully on explicit
  user-id filtering. Future operations MUST follow this contract.

**Forecloses**

- Nothing material. If we later want per-endpoint scopes on a PAT,
  that lives in the auth helper without touching operations.

## Out of scope

- WebSocket / SSE realtime over `/api/v1`. App realtime continues to
  flow through the user's own Supabase project via the SDK.
- Operations the dashboard doesn't have (transfer ownership, bulk
  imports). Don't grow surface from the API side.
- Versioned breaking changes. `/api/v1` is the only contract; `v2`
  lands when something compels it.

## Alternatives considered

- **Mount actions directly as POST handlers.** Server actions in Next
  require the dashboard's CSRF/form-action machinery and don't
  cleanly accept JSON. Plus they redirect, which is wrong for an API.
- **Have operations take the session client when called from actions
  and admin when called from API handlers.** Two code paths inside
  every operation; cuts both ways. The admin-everywhere choice keeps
  the operation contract uniform.
- **Skip the extraction and duplicate the logic in the API handlers
  "for now".** Rejected — the ticket explicitly requires audit-log
  parity between the two transports, and duplication makes drift
  inevitable.
