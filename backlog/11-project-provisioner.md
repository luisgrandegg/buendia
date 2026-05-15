# 11 — User project provisioning

**Phase:** 1
**Depends on:** 10, 12
**Constitution refs:** §3 (the user owns the database), §5 (single codebase, two deployments)

## Goal

After OAuth, Buendia creates one Supabase project named "Buendia Apps" in the
user's first organization, polls until it is `READY`, and captures the
credentials needed to act on it.

## Scope

- `@supabase/management-js` integration.
- Create project (free tier where available); poll until `READY` (30–60s).
- Fetch: project ref, project URL, anon key, service-role key, JWT secret.
- Persist via ticket 12 (envelope-encrypted).
- "Preparing your workspace" UI absorbs the wait; user can fill in profile
  while it runs.
- `SchemaProvisioner` interface (hides which provisioning strategy is active;
  future-proofs the post-MVP `ProjectProvisioner`).
- Self-hosted mode (`PLATFORM_MODE=self-hosted`): skip OAuth + creation, read
  operator-pre-configured credentials from env, write the same `owner_backends`
  row for every user.

## Out of scope

- Project-per-app provisioning (post-MVP).
- Multi-organization selection.

## Acceptance criteria

- [ ] SaaS signup ends with a provisioned project and stored credentials.
- [ ] Self-hosted signup writes an `owner_backends` row pointing at the
      operator's stack.
- [ ] Mid-flow failures surface a retry CTA, never a half-state.
