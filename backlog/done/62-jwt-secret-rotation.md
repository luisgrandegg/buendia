# 62 — JWT secret rotation handling

**Phase:** Cross-cutting
**Depends on:** 11, 12, 60
**Constitution refs:** §3, §4

## Goal

If a user manually rotates their Supabase JWT secret, every JWT Buendia mints
becomes invalid. Offer a one-click "Refresh credentials" that re-fetches the
secret via the existing OAuth grant. Resolves MVP §Open question 6.

## Scope

- Detect symptom: edge serve route receives a stream of `401 invalid JWT`
  responses from the owner's Supabase.
- Either auto-trigger or prompt: the user sees a banner in the dashboard,
  "Buendia couldn't authenticate to your project — refresh credentials?".
- Refresh: re-call the management API with the stored OAuth refresh token,
  fetch the new URL / anon / service-role / JWT secret, re-encrypt and store.
- Audit log entry on every refresh.

## Out of scope

- Forcing JWT secret rotation from Buendia (the user owns that key).

## Acceptance criteria

- [ ] Rotating the JWT secret in Supabase and clicking refresh restores
      serving with no manual reconnect.
- [ ] Refresh failure (e.g. refresh token expired) falls through to the
      reconnect flow from ticket 61.
