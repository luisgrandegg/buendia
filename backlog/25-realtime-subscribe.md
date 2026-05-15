# 25 — Realtime subscriptions

**Phase:** 2
**Depends on:** 23, 32 (JWT claims must include what Realtime accepts)
**Constitution refs:** §6 (library), §8 (the stack, not the vendor)

## Goal

`Buendia.subscribe(table, callback)` wraps `supabase.channel(...)` with the
app's schema pre-bound, so app authors get realtime in one line.

## Scope

- `subscribe(table: string, cb: (event) => void): Unsubscribe` on the
  `BuendiaClient`.
- Internally: `db.channel('app_<slug>:public:<table>')...on(...)`.
- JWT claims minted by ticket 32 must satisfy the Realtime authoriser for
  the app schema.
- Reconnect logic delegated to `@supabase/supabase-js`; document expected
  behaviour on network drop.

## Out of scope

- Presence / broadcast features beyond table changes (not in MVP).

## Acceptance criteria

- [ ] Two browsers viewing the same app see INSERT/UPDATE/DELETE events
      arrive within 500ms on a healthy network.
- [ ] Subscribing without an active session is rejected at the JWT layer,
      not silently.
- [ ] `Unsubscribe()` releases the channel cleanly.
