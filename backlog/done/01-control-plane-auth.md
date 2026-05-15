# 01 — Control-plane auth

**Phase:** 0
**Depends on:** 00
**Constitution refs:** §3 (two backends), Architecture Invariants §Two backends

## Goal

Buendia's own Supabase project hosts the control plane. Implement email +
password signup and signin against it, with a session middleware in `apps/web`
that protects authenticated routes.

## Scope

- Provision the Buendia-managed Supabase project (manually, document the steps
  in `decisions/0001-control-plane-supabase.md`).
- Email + password signup, signin, signout in `apps/web`.
- `users` table in the control plane (id mirroring `auth.users.id`, email,
  display_name, created_at) populated on first signin.
- Session middleware: protected routes redirect unauthenticated requests to
  `/signin`.

## Out of scope

- OAuth providers (Google, GitHub) — post-MVP per Platform Registry.
- MFA, password reset flows — post-MVP.
- App data backend (tickets 10–12).

## Acceptance criteria

- [ ] New signup lands on the dashboard.
- [ ] Signing out clears the session and redirects to `/signin`.
- [ ] Visiting a protected route while signed out redirects to `/signin`.
- [ ] A `users` row is created exactly once per new account.
