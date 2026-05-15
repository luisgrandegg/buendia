# 12 — Owner backend credential storage

**Phase:** 1
**Depends on:** 00
**Constitution refs:** §3, Architecture Invariants §The platform never holds app data

## Goal

`owner_backends` stores each user's Supabase credentials under envelope
encryption. This is the most security-sensitive surface in the system; treat
it that way.

## Scope

- `owner_backends` table per the MVP data model.
- Envelope encryption: per-row data key, wrapped by a KMS key.
- KMS adapters: AWS KMS, GCP KMS (SaaS); age or HashiCorp Vault (self-hosted).
- Decryption only inside `apps/edge` and `packages/db` provisioner contexts;
  never in `apps/web` request handlers, never sent to the browser, never
  written to logs (assert via lint rule or test).
- Daily re-validation cron (a thin `Buendia.health()` ping per backend) feeds
  ticket 61.

## Out of scope

- Reconnect UX (ticket 61), key rotation UX (ticket 62).

## Acceptance criteria

- [ ] Credentials round-trip cleanly through encrypt / decrypt.
- [ ] No log line in any environment contains plaintext keys (verified by
      automated scan).
- [ ] Service-role key cannot be reached from any route in `apps/web`.
- [ ] Disconnect (ticket 52) successfully zeroes the encrypted columns.
