# 21 — Schema provisioner

**Phase:** 2
**Depends on:** 11, 12, 20
**Constitution refs:** §3, Architecture Invariants §Every table gets RLS, §Provisioning is reversible

## Goal

Given an uploaded `schema.sql`, create `app_<slug>` in the owner's Supabase
project, run the DDL safely, add the standard columns, and generate default
RLS policies.

## Scope

- Connect to the user's Supabase using the decrypted service-role key.
- Create schema `app_<slug>`.
- Parse `schema.sql`. Refuse statements that disable RLS, grant superuser, or
  touch other schemas. Refuse `CREATE EXTENSION`, `DROP DATABASE`, etc.
- Add `created_by uuid default auth.uid()` and `team_id uuid` to every table.
- Generate default RLS policies (members read; editors + owner write) keyed off
  the JWT claims spec.
- Documented inverse: dropping the schema cleans up cleanly (used by ticket 50).

## Out of scope

- AI-assisted schema generation (post-MVP).
- Migrations on existing schemas (revisit in ticket 50 when versioning lands).

## Acceptance criteria

- [ ] Provisioned schema has RLS enabled on every table.
- [ ] A `schema.sql` containing `ALTER TABLE … DISABLE ROW LEVEL SECURITY` is
      rejected before any DDL runs.
- [ ] Schema drop removes the schema, its tables, and its policies in one tx.
