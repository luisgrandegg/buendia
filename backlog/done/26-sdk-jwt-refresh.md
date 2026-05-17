# 26 — SDK JWT refresh + revocation overlay

**Phase:** 2
**Depends on:** 23, 32
**Constitution refs:** §4 (real auth), §7 (sharing is access, revocation is immediate)

## Goal

The SDK silently refreshes its JWT every 10 minutes via the Buendia control
plane. If the refresh fails because the share was revoked, it mounts a clear
"access removed" overlay — the only path that breaks under revocation.

## Scope

- Background timer fires every 10 min; calls `POST /api/jwt/refresh?app=<id>`
  with the session cookie.
- On 200: swap the JWT into the Supabase client.
- On 401/403: stop the app's read/write paths and mount a non-dismissable
  overlay: "Your access to this app was removed."
- The UI itself stays mounted — users see a clear message, not a silent error
  cascade.

## Out of scope

- Letting the user request access back (post-MVP if it comes up at all).

## Acceptance criteria

- [ ] A revoked share triggers the overlay within the JWT TTL window.
- [ ] No errors leak from realtime/db calls after the overlay mounts.
- [ ] A 5xx from the refresh endpoint retries with backoff and does not show
      the revocation overlay.
