# 20 — HTML upload

**Phase:** 2
**Depends on:** 02, 11
**Constitution refs:** §1 (portability), §6 (SDK is a library)

## Goal

Owner drags an `index.html` (and optionally a `schema.sql`) onto the dashboard
and ends up with an `apps` row, the HTML stored, and a generated slug.

## Scope

- Drag-and-drop UI on the dashboard.
- Server-side validation: size cap, MIME sniff, `.html` only, single-file rule.
- Store the HTML blob (decide where in `decisions/0002-html-storage.md`:
  control-plane Supabase Storage vs the user's; default control-plane to keep
  the owner's backend purely for app _data_).
- Write `apps` + first `app_versions` row. Generate a URL-safe slug.
- Persist `schema.sql` text (if uploaded) on `app_versions.schema_sql` for the
  provisioner to consume in ticket 21.

## Out of scope

- Schema provisioning itself (21).
- Rename / delete / versioning UI (50).
- Multi-file apps (permanently out of scope per the constitution).

## Acceptance criteria

- [ ] Dropping a valid `.html` produces an `apps` row visible in the dashboard.
- [ ] Invalid uploads (oversized, wrong type) are rejected with a clear message.
- [ ] Slugs are unique and URL-safe.
