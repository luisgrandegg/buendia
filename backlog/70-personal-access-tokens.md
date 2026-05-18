# 70 — Personal access tokens

**Phase:** 7 — Claude / MCP integration
**Depends on:** 01, 12, 60
**Constitution refs:** §4 (real auth), Architecture Invariants §JWT scope is the security boundary

## Goal

Give every Buendia user the ability to mint, list, and revoke
short-named personal access tokens (PATs). PATs authenticate non-browser
clients — the MCP server (ticket 72), curl scripts, future CLI — against
Buendia's HTTP API (ticket 71).

A PAT is **not** a JWT for the user's Supabase project. It only proves
"this is user X talking to Buendia." JWT minting for app data still
goes through the per-app flow (ticket 32) and is keyed off the user
identity that the PAT resolves to.

## Scope

- Migration `packages/db/migrations/00NN_personal_access_tokens.sql`:
  - `public.personal_access_tokens (id uuid, user_id uuid, name text,
token_prefix text, token_hash bytea, last_used_at timestamptz,
created_at timestamptz, revoked_at timestamptz)`
  - RLS: user reads + manages own rows.
- Token format: `buendia_pat_<base64url-32-bytes>`. Stored as a SHA-256
  hash; the plaintext is shown once on creation.
- Settings UI under `/settings/tokens`:
  - List of tokens (name, prefix, last used, created).
  - Form to create (name only). On success, the page shows the new
    token once with a copy affordance.
  - Revoke button per row (sets `revoked_at`).
- `apps/web/lib/auth-token.ts` — verifyPersonalAccessToken(headers):
  parses `Authorization: Bearer buendia_pat_...`, hashes, looks up the
  row, updates `last_used_at`, returns the owning `user_id` or null.
- Audit actions: `pat.created`, `pat.revoked`, `pat.used` (only on
  first use per token to avoid noise).

## Out of scope

- Fine-grained scopes per token. Ticket 71's HTTP API surface is small
  enough that "this token can do anything the user can" is acceptable
  for MVP. Scopes can land later with their own ADR.
- Sharing tokens between users / org-level tokens. PATs are personal.

## Acceptance criteria

- [ ] Migration applies cleanly; user-only RLS verified.
- [ ] `/settings/tokens` lets a user create, view (prefix only), and
      revoke their tokens.
- [ ] The plaintext token is shown exactly once.
- [ ] `verifyPersonalAccessToken` correctly resolves valid tokens,
      returns null for revoked / expired / unknown tokens, and updates
      `last_used_at`.
- [ ] Token hashes are never logged; plaintext is never stored.
