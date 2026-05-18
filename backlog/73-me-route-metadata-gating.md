# 73 — `/api/v1/me`: gate backend metadata on session auth

**Phase:** 6
**Severity:** Medium
**Audit ref:** SECURITY_AUDIT.md §M3

## Goal

Stop returning owner-backend `grant_status` and `connected_at` to PAT-authenticated callers.

## Background

A leaked PAT today learns whether the user has provisioned a Supabase backend and when. Small info leak; easy gate.

## Scope

- In `apps/web/app/api/v1/me/route.ts`, branch on `authPath`:
  - For `session`-authenticated callers: return current shape.
  - For `pat`-authenticated callers: return only `{ id, email, display_name, created_at }`. Omit backend metadata entirely.
- Tests: hit the route under both auth paths, assert shape.
- Update `packages/mcp` docs if any tool surface depended on the omitted fields (it shouldn't).

## Out of scope

- PAT scoping (deciding which fields each PAT can read) — that's a separate, larger design.

## Acceptance criteria

- [ ] PAT response omits backend metadata.
- [ ] Session response unchanged.
- [ ] HTTP API contract test updated.
