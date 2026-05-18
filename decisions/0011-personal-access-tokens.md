# 0011 — Personal access tokens

**Status:** Accepted
**Date:** 2026-05-18

## Context

The browser dashboard authenticates via Supabase Auth — a cookie-bound
session that the user can't paste into a curl invocation. We're about to
ship two non-browser clients against Buendia:

- **MCP server** (ticket 72) — runs locally next to Claude, talks to
  Buendia's HTTP API on the user's behalf.
- **HTTP API v1** (ticket 71) — a small REST surface (`/api/v1/*`) for
  the same scripted / agentic use cases.

Both need to identify the calling user without an interactive browser
session. The shape that fits is a personal access token: a long,
high-entropy string the user mints from settings and pastes into a
config file.

## Decision

A PAT is `buendia_pat_<base64url-32-bytes>`. The plaintext is shown to
the user exactly once at creation; only a SHA-256 hash and a 12-char
display prefix make it into the database. Lookup is by hash via a
unique index — O(1) and constant-time-safe at the DB layer.

A PAT only authenticates the user against **Buendia**. It is not a JWT
for the user's Supabase project. App-data JWTs continue to come from
the per-app mint flow (ADR 0007), keyed off the user identity that the
PAT resolves to. This preserves the JWT-scope invariant.

### Schema

`public.personal_access_tokens`:

- `id uuid` — primary key.
- `user_id uuid` — owner.
- `name text` — short label the user chose; 1–80 chars.
- `token_prefix text` — first 12 chars of the base64url body; surfaced
  in the UI so the user can tell tokens apart.
- `token_hash bytea unique` — SHA-256 of the plaintext.
- `last_used_at timestamptz` — stamped on every successful verification.
- `created_at`, `revoked_at`.

RLS: users see + manage their own rows. The HTTP-API-side lookup uses
the control-plane admin client (RLS-bypassing), so a server-only policy
isn't needed.

### Verification

`verifyPersonalAccessToken(headers)` parses
`Authorization: Bearer buendia_pat_…`, hashes, looks up by `token_hash`,
checks `revoked_at`, stamps `last_used_at`. Returns the owning `user_id`
on success. Garbage bearer values short-circuit without a DB round-trip
via a regex on the base64url body.

### Reveal flow

A server action can't return data through the form-submission redirect.
We stash the plaintext in a 5-minute, httpOnly, sameSite=strict,
path-scoped cookie keyed by the new row's id, then redirect to
`/settings/tokens`. The page reads the cookie, renders the plaintext
in a copy-friendly `<code>`, and a tiny client effect calls a
clear-cookie action so a hard refresh doesn't show it again. If the
user closes the tab first, the cookie's `maxAge` is the backstop.

### Audit

- `pat.created` — on every successful insert.
- `pat.revoked` — on every revoke.
- `pat.used` — once, on the **first** successful verification of each
  token (signal-on-activation; per-call audits would drown the log).

## Consequences

**Enables**

- The MCP server (72) and HTTP API (71) get a uniform, revocable
  auth scheme that maps cleanly to a Buendia user.
- Scripts / a future CLI use the same primitive.
- Revoke is one click; downstream calls start failing 401 immediately.

**Costs**

- One more migration (`0011`).
- One more concept on the settings surface. The page is opt-in (the
  user doesn't see tokens until they go looking) so we don't crowd the
  Connected Backend story.
- The plaintext-once UX requires careful cookie handling. The
  alternatives — embedding the plaintext in a redirect URL, or in
  flash session storage — were worse.

**Forecloses**

- Nothing material. Per-token scopes can land later (the row gains a
  `scopes text[]` and the verifier filters), as can org-level tokens
  if we add organizations.

## Out of scope

- Per-token scopes. The HTTP API surface in ticket 71 is small enough
  that "this token can do anything the user can" is acceptable for
  MVP. A scopes-and-permissions ADR is the right place to revisit if
  we grow more dangerous endpoints.
- Token rotation / expiry. The user revokes + reissues manually for now.

## Alternatives considered

- **OAuth-style device code flow.** Cleaner UX in some shells, much
  more code to ship, doesn't fit headless agents that want to read a
  config file at startup. Defer until we have a CLI demanding it.
- **Supabase Auth refresh tokens reused as PATs.** They're rotating
  by design and not human-friendly to paste; piggybacking on them
  conflates browser sessions with bot identities.
- **Store the plaintext alongside the hash so the user can copy it
  again later.** Defeats the point. The whole reason to hash is so a
  database read can't impersonate the user.
