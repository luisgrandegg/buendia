# 0002 — Credential envelope encryption (master-key, KMS later)

**Status:** Accepted
**Date:** 2026-05-15

## Context

Ticket 12 (`backlog/done/12-credential-storage.md`) requires that the
owner-backend credentials Buendia stores — publishable key, secret key,
JWT secret, OAuth refresh token — are encrypted at rest. The constitution
(§3, §Architecture Invariants §The platform never holds app data) calls
this out as the most security-sensitive surface in the system.

The MVP brief names KMS-backed envelope encryption (AWS / GCP / Vault) as
the eventual destination. We are not there yet — we have no KMS adapter,
no infra, no operator runbook — and we need credential storage to land
before tickets 10 (OAuth) and 11 (project provisioning) can persist
anything.

## Decision

Implement the **envelope shape now** with a single operator-supplied
master key (KEK) wrapping per-row data keys (DEKs). The KEK lives in the
`BUENDIA_MASTER_KEY` env var as base64-encoded 32 bytes. KMS-backed wrap
is a future step that swaps only the wrap function, not the schema or the
call sites.

Algorithm: **AES-256-GCM** for both DEK wrap and value encryption. Every
call to `encrypt()` generates a fresh DEK and a fresh IV; the auth tag
detects tampering and rejects wrong keys.

Implementation lives in `packages/db/src/credentials.ts`. Storage is the
encrypted columns on `public.owner_backends` (`bytea`).

Blob layout, version 1:

```
[0]            version (0x01)
[1..12]        DEK IV       (12 bytes)
[13..44]       wrapped DEK  (32 bytes, GCM ciphertext of the 32-byte DEK)
[45..60]       DEK auth tag (16 bytes)
[61..72]       value IV     (12 bytes)
[73..73+N]     ciphertext   (N bytes)
[73+N..89+N]   value tag    (16 bytes)
```

Overhead: 89 bytes per encrypted value. For the credentials we store
(URLs, keys, refresh tokens), that's a small constant cost.

## Consequences

**Enables**

- Tickets 10 and 11 can persist credentials immediately.
- Compromise of any single ciphertext does not reveal others (per-row
  DEKs).
- Tampering is detected (GCM auth tags) and surfaces as a thrown
  exception, not a silent decrypt to garbage.
- KMS migration changes only the wrap step (`encrypt`/`decrypt` of the
  DEK). The schema, the call sites, and the blob layout stay put.

**Costs**

- The master key sits in plaintext in `BUENDIA_MASTER_KEY`. An attacker
  who can read the process env has every owner-backend credential. KMS
  raises that bar significantly; we'll do it when an operator profile
  emerges that needs it (or before charging anyone for hosted SaaS).
- Rotating the master key is a manual, all-at-once re-encrypt. We don't
  have key-versioning yet (the version byte in the blob is there for the
  day we do).

**Forecloses**

- Nothing material. The data layer treats the encrypted column as opaque
  bytes; we can switch to a different cipher or upgrade to KMS without
  touching anything outside `packages/db/src/credentials.ts`.

## Alternatives considered

- **Plaintext (signed) storage.** Rejected: the constitution requires
  encryption, and "signed but readable" gives an attacker who reads the
  table the full keys.
- **Postgres `pgsodium` / Supabase Vault.** Considered. Pushes the
  crypto into the database with key handling tied to the database
  superuser. We may revisit; the master-key approach keeps decryption
  inside our Node processes and out of any path that has database admin
  credentials, which fits the "decryption only in `apps/edge` and the
  provisioner" rule cleanly. ADR for the swap if/when we make it.
- **KMS from day one.** Rejected for MVP velocity. The cost of swapping
  the wrap function later is small; the cost of building three KMS
  adapters before shipping is large.

## Operator setup

Generate a master key once and store it as a deploy secret:

```bash
openssl rand -base64 32
```

Set the result as `BUENDIA_MASTER_KEY` in:

- Vercel project env (Production + Preview) for SaaS.
- The `.env` file consumed by `docker compose` for self-hosted.

**Do not commit the key.** **Do not rotate it without re-encrypting every
row in `public.owner_backends` first.** The rotation runbook lands when
we have rows to rotate.
