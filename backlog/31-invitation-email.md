# 31 — Invitation email + magic link

**Phase:** 3
**Depends on:** 30
**Constitution refs:** §4 (real auth, granted to people), §5 (single codebase, two deployments)

## Goal

Inviting a collaborator sends an email with a magic link. Clicking it signs
the user into Buendia (signup if they're new) and lands them on the shared
app.

## Scope

- Resend integration in SaaS; local SMTP / "copy this link" fallback in
  self-hosted (selected by `PLATFORM_MODE`).
- Email template: who invited, app name, role, prominent CTA.
- Magic link route `/invite?token=…`:
  - Validates the token against `app_shares`.
  - If user exists: signin. If not: lightweight signup (email + password to
    the control plane only — collaborators do not OAuth Supabase).
  - Redirects to the shared app's URL on success.
- Token TTL (e.g. 14 days). Document revocation: removing the share
  invalidates pending tokens immediately.

## Out of scope

- Email templating system / branding (post-MVP).
- SSO / OAuth providers for the control plane (post-MVP).

## Acceptance criteria

- [ ] Invited email arrives in SaaS mode within seconds.
- [ ] In self-hosted, the magic link is surfaced to the inviter to copy.
- [ ] Clicking a valid link signs the user in (or signs them up) and opens
      the app.
- [ ] Clicking a link for a removed share lands on a clear "no longer
      available" page.
