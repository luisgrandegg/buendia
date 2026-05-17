# 0006 — Schema provisioner

**Status:** Accepted
**Date:** 2026-05-15

## Context

Ticket 21 takes the `schema.sql` the user uploaded with their app
(ticket 20) and applies it to a dedicated `app_<slug>` schema in their
own Supabase project. Constitution invariants in play:

- Every table in an app schema **must** have RLS enabled, with policies
  keyed off the JWT claims we mint in the edge route (`team_id`,
  `buendia_role`).
- Buendia must never let the user's SQL escape the app schema, install
  extensions, manipulate roles, or otherwise break the trust model that
  keeps two apps in the same project isolated.

## Decision

A single server-side provisioner that:

1. **Validates** the SQL with a deny-list of forbidden patterns (see
   `apps/web/lib/schema-provisioner.ts`). Every finding is collected so
   the dashboard can list them, not just the first one.
2. **Wraps the SQL** in a transaction along with the schema setup and the
   post-DDL augmentation (drop existing schema, create, run user DDL,
   loop through resulting tables to add `created_by` / `team_id` columns,
   enable RLS, install policies).
3. **Executes** the whole block via Supabase's Management API
   `POST /v1/projects/<ref>/database/query`, using a freshly refreshed
   OAuth access token. We don't need the project's secret key for DDL.
4. **Stamps** `apps.schema_provisioned_at` on success and emits an
   `app.version.uploaded` audit row with the `schema_provisioned`
   annotation.

The schema is dropped + recreated on every provision so re-provisioning
is idempotent. Data persistence across re-provisioning is a ticket-50
concern (versioning); the MVP path is "provision once" or "wipe and
re-provision when you want a clean schema".

## Forbidden statements

The validator rejects any of the following — listed here so adding new
denials has a single place to update:

- Disabling RLS (`DISABLE ROW LEVEL SECURITY`, force variants).
- Installing extensions (`CREATE EXTENSION`).
- Database / schema lifecycle (`DROP DATABASE`, `CREATE SCHEMA`,
  `DROP SCHEMA`).
- Privilege grants (`GRANT`, `REVOKE`).
- Session-role manipulation (`SET ROLE`, `SET SESSION AUTHORIZATION`).
- Role / user / group manipulation (`CREATE|DROP|ALTER ROLE/USER/GROUP`).
- `SECURITY DEFINER` (privilege-escalation risk).
- `COPY ... PROGRAM` (shell escape).
- `psql` meta-commands (`\copy`, `\set`, etc.).
- References to reserved schemas (`auth.`, `storage.`, `public.`,
  `pg_catalog.`, `information_schema.`, etc.).

This is defense-in-depth. The Management API will refuse most of these
anyway because it executes as the project's `postgres` role only inside
the project's database, but validating before sending also gives the
user a clear error message instead of an opaque Postgres failure.

## Default RLS policies

For every table the user creates, the provisioner adds:

```sql
alter table <schema>.<table> add column if not exists created_by uuid default auth.uid();
alter table <schema>.<table> add column if not exists team_id uuid default ((auth.jwt() ->> 'team_id')::uuid);
alter table <schema>.<table> enable row level security;

create policy "buendia members read"
  on <schema>.<table> for select
  using (team_id = ((auth.jwt() ->> 'team_id')::uuid));

create policy "buendia editors write"
  on <schema>.<table> for all
  using (
    team_id = ((auth.jwt() ->> 'team_id')::uuid)
    and (auth.jwt() ->> 'buendia_role') in ('owner','editor')
  )
  with check (team_id = ((auth.jwt() ->> 'team_id')::uuid));
```

The JWT claims (`team_id`, `buendia_role`, `sub`) are what the edge
serve route (ticket 22) and JWT mint endpoint (ticket 32) put on
every token. App data is naturally partitioned by `team_id` and
collaborator role is enforced at the database boundary.

## Consequences

**Enables**

- The user uploads `schema.sql`, clicks Provision schema in the
  dashboard, and lands with an `app_<slug>` schema that's safe to
  serve through the SDK.
- The same validator can be re-used later (e.g., a "Preview policies"
  step in the UI, or by the export tool to warn about schemas that
  won't import cleanly elsewhere).

**Costs**

- The deny-list is conservative; some legitimate uses (e.g., defining
  a non-`SECURITY DEFINER` function) currently slip through, but
  legitimate SECURITY DEFINER usage is blocked. We can loosen
  case-by-case with follow-up ADRs.
- Re-provisioning drops the schema. Users with persisted data who
  re-provision will lose it. The dashboard surface labels the button
  as "Re-provision" once `schema_provisioned_at` is set, but the
  destruction is real. A safe migrations story is post-MVP (and very
  much its own ticket).

**Forecloses**

- Nothing material. The Management API call is replaceable; the SQL
  generator is library-free; the validator can be extended.

## Operator setup

Apply `packages/db/migrations/0006_apps_schema_provisioned_at.sql` to
the control plane. The Management API endpoint we call is part of
Supabase's standard surface; no extra app registration is needed
beyond what ADR 0003 already requires.

## Alternatives considered

- **Use the project's secret API key + PostgREST `rpc`.** PostgREST
  doesn't execute arbitrary DDL, so we'd have to ship a stored
  procedure with the migration. That's an extra moving part for no
  win over the Management API.
- **Connect to Postgres directly with the DB password.** We
  randomized the password during provisioning (ticket 11) and didn't
  store it. We _could_ store it encrypted, but that's another secret
  surface for no real benefit — the Management API is the
  better-supported path.
- **Pre-parse the SQL with a real Postgres grammar.** Heavier; the
  deny-list is sufficient as a first line. The actual safety belt is
  the Management API's role boundary, which is project-scoped.
