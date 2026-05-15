# 52 — Disconnect Buendia

**Phase:** 5
**Depends on:** 12, 51
**Constitution refs:** §1, §3 ("Plinth simply stops being involved" → must be true literally)

## Goal

Owners can sever Buendia from their Supabase account. After disconnect, their
schemas, data, and the apps themselves still work; Buendia simply stops
serving them.

## Scope

- "Disconnect Buendia" button in `/settings`.
- Confirmation screen explains exactly what happens: schemas remain, data
  remains, sharing grants become inert, no more JWTs minted, OAuth refresh
  token revoked at Supabase.
- Offer "Export all apps" before final confirm (calls ticket 51 in a loop).
- On confirm: zero out the encrypted columns in `owner_backends`, mark the
  user's `apps` rows as disconnected, remove them from serving routes.
- Revoke OAuth refresh token at Supabase via the management API.

## Out of scope

- Reconnect-after-disconnect flow (treat as fresh signup for MVP).

## Acceptance criteria

- [ ] After disconnect, the owner's Supabase project is healthy and
      queryable directly.
- [ ] Buendia returns a clean "this app is disconnected" page for previously
      shared URLs; no 500s.
- [ ] Encrypted credential columns are NULL after disconnect.
