# 53 — Self-hosted docker compose

**Phase:** 5
**Depends on:** 00, 11 (`PLATFORM_MODE` branch), 12 (KMS-equivalent)
**Constitution refs:** §5 (single codebase, two deployments), §8 (the stack, not the vendor)

## Goal

`docker compose up` brings up a complete Buendia instance: `apps/web`,
`apps/edge`, local Supabase, and a KMS-equivalent for credential storage.

## Scope

- `docker-compose.yml` at the repo root.
- Services: Supabase OSS stack, Buendia web + edge, a KMS-equivalent
  (e.g. `age` keyfile or Vault dev mode).
- `.env.example` documents the operator-provided credentials that fill the
  shared `owner_backends` row.
- `PLATFORM_MODE=self-hosted` selected by the compose env.
- Smoke test script: spin up, sign up two users, upload an app, share, verify
  realtime, revoke, delete.

## Out of scope

- Helm chart / k8s manifests (post-MVP).
- Production-grade KMS guidance for self-hosters (document Vault as the
  recommended choice but don't ship a full Vault setup).

## Acceptance criteria

- [ ] A fresh clone runs end-to-end via `docker compose up` in under 15
      minutes (excluding image pulls).
- [ ] All MVP user flows work in self-hosted mode with no SaaS coupling.
- [ ] Smoke test script is green in CI on a nightly schedule.
