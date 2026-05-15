# 50 — Rename, delete, version

**Phase:** 5
**Depends on:** 20, 21
**Constitution refs:** Architecture Invariants §Provisioning is reversible

## Goal

Owners can rename their app's display name, upload new versions of the HTML
(preserving older versions), and delete an app cleanly.

## Scope

- Rename: edits `apps.name`. Slug is immutable.
- New version: upload HTML (and optionally schema migration), write new
  `app_versions` row, bump `apps.current_version`. Serve the current version.
- Delete: single transaction that drops the app schema in the owner's
  Supabase, deletes `app_shares`, `app_versions`, and the stored HTML blobs.
  No orphans in either backend.

## Out of scope

- Rolling back to a prior version from the UI (post-MVP if requested).
- Schema migration tooling beyond "drop and rebuild" (post-MVP).

## Acceptance criteria

- [ ] Rename reflects in dashboard and inside the app within one render.
- [ ] Uploading v2 of an app keeps v1 in `app_versions` but serves v2.
- [ ] Delete leaves no rows in `app_shares`, `app_versions`, or storage; the
      `app_<slug>` schema is gone from the owner's Supabase.
