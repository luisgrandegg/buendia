# 61 — OAuth grant revocation handling

**Phase:** Cross-cutting
**Depends on:** 10, 12, 60
**Constitution refs:** §3 (the user owns the database — including the right to disconnect us)

## Goal

If a user revokes Buendia's OAuth grant from their Supabase dashboard, every
operation Buendia tries on their behalf will fail. Detect this, surface it,
and offer a reconnect path. Resolves MVP §Open question 5.

## Scope

- Daily cron: call `Buendia.health()` (a trivial PostgREST query) against each
  `owner_backends` row using the stored credentials.
- On failure: set `last_validated_at` and mark the row as
  `grant_status = 'broken'`.
- Dashboard banner: "Supabase connection broken — your apps are temporarily
  unavailable. Reconnect to restore." Links to a reconnect CTA.
- Reconnect CTA reruns the OAuth flow from ticket 10 and updates the same row.
- Audit log entry for both detection and successful reconnect.

## Out of scope

- Auto-recovery without the user's involvement (we cannot — they revoked us).

## Acceptance criteria

- [ ] Simulating revoked grant in Supabase's dashboard surfaces the banner
      within 24h (cron tick).
- [ ] Reconnect restores serving without data loss.
- [ ] The broken state never causes 500s on the dashboard or app routes;
      apps render a clean "temporarily unavailable" page.
