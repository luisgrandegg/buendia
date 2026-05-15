# 40 — Project-tracker canary migration

**Phase:** 4
**Depends on:** all of Phase 0–3
**Constitution refs:** all eight principles (this is the acceptance test)

## Goal

Migrate `luisgrandegg/project-tracker` to run on Buendia: replace its inline
Supabase setup with `@buendia/sdk`, no other functional changes. Two real
users (you and your partner) exercise sharing, realtime, revocation, and
disconnect end to end. This is the MVP acceptance test (MVP §Goals 7).

## Scope

- Fork or branch project-tracker.
- Remove the URL-paste-and-pray credentials code.
- Replace with `<script type="module">…Buendia.init()…</script>`.
- Upload to a running Buendia instance.
- Real-world test plan:
  - Owner uploads, gets URL, invites partner.
  - Partner signs up, sees the app under "Shared with me", uses it live.
  - Both edit at once; realtime sync verified.
  - Owner revokes partner; partner sees the overlay within TTL.
  - Owner exports the bundle, disconnects, re-runs locally from the export.

## Out of scope

- New project-tracker features.

## Acceptance criteria

- [ ] Project-tracker on Buendia has no UX regressions vs the existing version.
- [ ] All five steps of the test plan pass with no manual workarounds.
- [ ] The exported bundle runs from `file://` with the standalone overlay.
