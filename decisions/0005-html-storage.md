# 0005 — Where Buendia stores app HTML

**Status:** Accepted
**Date:** 2026-05-15

## Context

Ticket 20 (`backlog/done/20-html-upload.md`) puts an HTML blob somewhere
that:

- The dashboard can write on upload.
- The edge serve route (ticket 22) can fetch cheaply on every request.
- Survives the user disconnecting Buendia (per constitution §1
  portability — they leave with the HTML and their schema).
- Doesn't pollute the owner's Supabase project, which is for app _data_
  per constitution §3.

Two candidate stores:

1. **Control-plane Supabase Storage** (Buendia's own project).
2. **The user's Supabase Storage** (their `Buendia Apps` project).

## Decision

Store HTML in the **control-plane Supabase Storage** in a private bucket
called `app-html`. Path layout: `<user_id>/<slug>/v<version>.html`.

RLS on `storage.objects`:

- The owner (matching `auth.uid()`) can read, insert, and delete objects
  under their own folder.
- Everyone else is denied.

The bucket is created in `packages/db/migrations/0005_apps.sql` via the
`storage.buckets` row Supabase exposes.

## Why control-plane

- **Keeps the owner backend purely for data.** The HTML is an authoring
  artifact, not part of the application data model. Mixing the two in
  the owner's project makes "delete all my app data" or "export my data"
  ambiguous.
- **Edge service convenience.** The edge serve route runs as a Buendia
  process and already holds the control-plane Supabase credentials.
  Pulling from the user's storage would require either a fresh JWT mint
  per request, or service-role-as-Buendia, both of which add latency
  and complicate the trust model.
- **Portability isn't compromised.** Export (ticket 51) bundles the
  current `index.html` + `schema.sql` from this bucket into a zip the
  user can run anywhere. The constitution requires the _user owns the
  data_, not that the build artifact lives on their infrastructure.

## Consequences

**Enables**

- Cheap edge serve: a single Supabase Storage read with a long-lived
  cache.
- Simple authorization: RLS on `storage.objects` does the right thing
  for the owner; sharing (ticket 30) will widen reads from the edge
  service via a service-role-style path that bypasses object RLS but
  still goes through Buendia's membership check.
- Versioning: `<slug>/v<version>.html` makes it trivial to keep prior
  versions when the user uploads a new revision (ticket 50).

**Costs**

- HTML lives on Buendia's storage rather than the user's. If Buendia's
  storage goes away, every app's HTML is gone — but the user's _data_
  is intact and they can re-upload. The constitution's portability
  guarantee is about data continuity, which this preserves.
- Storage limits cap how many apps a user can host. We monitor and
  document; ticket 50 will surface usage in the dashboard.

**Forecloses**

- Nothing material. A future ticket could mirror to S3 or move HTML
  to the user's project; the storage path is a column on `apps`, not
  a hard-coded assumption.

## Alternatives considered

- **Owner's Supabase Storage.** Cleaner story for "the user owns
  everything", but conflates authoring artifacts with app data and
  requires extra credential plumbing on every edge request. Rejected.
- **Inline HTML in `apps` table.** Simpler but unfriendly to bigger
  apps (5 MB limit hits Postgres row limits) and forces every dashboard
  read to drag the whole body. Rejected.
- **An external object store (S3, R2).** Adds operator setup and
  duplicates what Supabase Storage already gives us. We can migrate
  later if there's a reason; not today.

## Operator setup

Apply `packages/db/migrations/0005_apps.sql` in the control-plane
Supabase project. The bucket and its policies are created by that
migration. Nothing else to configure.
