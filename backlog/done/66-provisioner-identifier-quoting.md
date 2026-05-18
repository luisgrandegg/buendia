# 66 — Schema provisioner: quote identifiers, don't trust the regex

**Phase:** 6
**Severity:** High (defence in depth)
**Audit ref:** SECURITY*AUDIT.md §H1
**Constitution refs:** Architecture Invariants ("The SDK has zero privileged operations" — the provisioner is the \_one* privileged path; it must be airtight).

## Goal

Replace string interpolation of `schemaName` in `lib/schema-provisioner.ts` with proper PostgreSQL identifier quoting. The current `^app_[a-z0-9_]+$` regex makes the system safe _today_; the moment anyone relaxes it (unicode handles, `-`, longer prefixes) it becomes SQL injection against the owner's Supabase project, where Buendia runs with elevated grants.

## Scope

- Move the SQL bodies to a `security definer` provisioning function on the owner backend, with `quote_ident` / `format('%I', …)` inside:
  ```sql
  create or replace function buendia._provision_schema(schema_name text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
  as $$
  begin
    execute format('drop schema if exists %I cascade', schema_name);
    execute format('create schema %I', schema_name);
    -- …
  end$$;
  ```
- Alternative if a function feels heavy: build the SQL with `pg-format` (or hand-rolled `quoteIdent`) on the Node side. Keep the regex as a belt-and-braces precheck.
- Keep the same identifier wrapping in `buildDropSchemaSql` (the inverse path).
- Tests: feed the provisioner pathological-but-regex-passing names (e.g. `app_aaa…` truncated to limits) and confirm the generated SQL is structurally correct.

## Out of scope

- Changing what the provisioner _does_ (only how it interpolates).
- The `security definer` audit (set `search_path = ''`, document on the function).

## Acceptance criteria

- [ ] No string interpolation of identifiers anywhere in `schema-provisioner.ts`.
- [ ] If a `security definer` function is introduced, ADR (or note in `decisions/0007-…`) documents it.
- [ ] Existing provisioning + uninstall tests still pass.
