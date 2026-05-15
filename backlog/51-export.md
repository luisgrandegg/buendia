# 51 — One-click export

**Phase:** 5
**Depends on:** 20, 21
**Constitution refs:** §1 (portability is the durable contract)

## Goal

One click downloads everything an owner needs to run an app outside Buendia:
the latest `index.html`, the `schema.sql`, and a SQL dump of the app's data
from the owner's Supabase project.

## Scope

- Export button on app detail page.
- Server-side job assembles a zip:
  - `index.html` (current version)
  - `schema.sql` (as uploaded; or reconstructed from live schema if the
    upload predates a schema change — document the choice)
  - `data.sql` (pg*dump of `app*<slug>` data, ordered by table)
  - `README.md` explaining how to run the bundle on any static host with a
    fresh Supabase project.
- Bundle is downloaded directly; not stored long-term server-side.

## Out of scope

- Continuous export / backup automation (post-MVP).

## Acceptance criteria

- [ ] Exported bundle runs an exact copy of the app on a fresh Supabase
      project + any static host with no Buendia involvement.
- [ ] Standalone-mode SDK overlay accepts the new project's credentials
      and the app works (parity test from ticket 24).
