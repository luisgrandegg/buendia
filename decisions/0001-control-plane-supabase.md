# 0001 — Control-plane Supabase project

**Status:** Accepted
**Date:** 2026-05-15

## Context

The Buendia control plane stores users, apps, sharing grants, and audit logs.
The constitution mandates a separate backend from app data (Architecture
Invariants §Two backends). We need to pick the control-plane data stack and
spell out how the operator provisions it.

## Decision

The control plane runs on a **Supabase project that Buendia owns**. The same
project provides:

- **Postgres** for the control-plane schema (`public.users`, `public.apps`,
  `public.app_shares`, `public.owner_backends`, `public.audit_log`).
- **Supabase Auth** for the control-plane user accounts (email + password
  in MVP; OAuth providers post-MVP).

The operator provisions this project manually, once, and supplies its URL +
anon key to `apps/web` via environment variables:

| Variable                        | Where                                     |
| ------------------------------- | ----------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Vercel project env (Production + Preview) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel project env (Production + Preview) |

SQL migrations live in [`packages/db/migrations/`](../packages/db/migrations)
and are applied manually against the Supabase project — see
[`packages/db/README.md`](../packages/db/README.md). There is no managed
migration runner yet; one is post-MVP and would warrant its own ADR.

In SaaS mode the control-plane Supabase project is hosted on Supabase's
managed service. In self-hosted mode it is the local Supabase OSS stack
spun up by `docker compose`. The application code is identical in both
cases (constitution §5).

## Consequences

**Enables**

- Email + password signin out of the box, with refresh tokens and recovery
  flows that Supabase Auth provides.
- A single Postgres database we can model the rest of the control plane
  against, all under RLS.
- Self-hosted parity for free (Supabase OSS ships the same Postgres + Auth +
  PostgREST surface).

**Costs**

- The operator has to create one Supabase project before deploying. We
  document the four-step setup; we don't automate it.
- We're coupled to Supabase Auth's specific token format on the control
  plane. App-data auth is decoupled (per constitution §8 — we mint our own
  JWTs signed with each user's backend secret), so this coupling is local
  to the control plane.

**Forecloses**

- Running Buendia without a Postgres database. The constitution already
  forbids this (§out-of-scope: "bare Postgres" + Permanently out of scope:
  reimplementing PostgREST).

## Alternatives considered

- **Embed Postgres inside `apps/web` (e.g. Neon serverless driver).** Adds a
  separate auth surface to build. Rejected: Supabase Auth solves it.
- **Use a third-party auth (Clerk, Auth.js) plus an external Postgres.**
  Adds vendor lock-in and a second moving part. Rejected for MVP; could
  revisit if Supabase Auth becomes a bottleneck.
- **Skip the control-plane DB entirely and store everything in cookies /
  KV.** Untenable for `app_shares` and `audit_log`.

## Operator setup checklist

1. Create a Supabase project at https://supabase.com/dashboard. Free tier is
   fine for MVP.
2. From the SQL editor, run every file in `packages/db/migrations/` in order.
3. Copy the project URL and anon key into Vercel's project env vars (or your
   `.env.local` for local development; see [`apps/web/.env.example`](../apps/web/.env.example)).
4. In Supabase Auth settings, enable email + password and disable email
   confirmation for MVP if you want frictionless signup; turn it back on
   when invitations land (ticket 31).
