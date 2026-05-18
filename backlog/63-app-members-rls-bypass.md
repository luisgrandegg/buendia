# 63 — `app_members` RLS bypass + sharing read policies

**Phase:** 6
**Severity:** Critical
**Audit ref:** SECURITY_AUDIT.md §C1, §M7
**Constitution refs:** Architecture Invariants ("Every table in an app schema gets RLS" — same spirit applies to the control plane); Principle 7 (sharing is access, not ownership transfer).

## Goal

Stop the `app_members` view from bypassing RLS, and add the missing sharing read policies on `public.apps` / `public.app_versions` so the view actually returns the right rows when invoker-scoped.

## Background

The view is created without `security_invoker = true`, so in PostgreSQL ≥15 it runs with the view owner's privileges and ignores RLS on `apps` and `app_shares`. Any authenticated user can today `select * from public.app_members` and obtain every app's `slug`, `name`, `schema_name`, `owner_id`, `team_id`, and `html_storage_path`. Application-layer `.eq("user_id", …)` filters are voluntary on the client.

## Scope

- New migration `0012_app_members_security_invoker.sql`:
  - `alter view public.app_members set (security_invoker = true);`
  - Add `select` policy on `public.apps` allowing rows where the caller has a row in `public.app_shares`.
  - Same for `public.app_versions`.
- Vitest (integration) against a real Supabase instance:
  - As a non-member, `select * from app_members` returns 0 rows.
  - As a sharee, returns exactly their shared apps with the right columns.
  - As an owner, unchanged.
- Audit any other views in `packages/db/migrations/` and set `security_invoker` on them too.

## Out of scope

- Refactoring the view shape.
- Surfacing version history to collaborators in the UI (covered by the future ticket that consumes `app_versions` shares).

## Acceptance criteria

- [ ] New migration lands and is idempotent.
- [ ] Integration tests cover the three roles (owner / sharee / non-member).
- [ ] Manual check: a fresh non-owner account can no longer enumerate any app metadata via supabase-js direct query.
