# Backlog

One file per ticket. Filenames are `NN-slug.md`, where `NN` is a sortable
two-digit prefix that loosely groups by MVP phase:

- `0x` — Phase 0, skeleton
- `1x` — Phase 1, Supabase OAuth + provisioning
- `2x` — Phase 2, upload + serve
- `3x` — Phase 3, sharing
- `4x` — Phase 4, project-tracker canary (MVP acceptance test)
- `5x` — Phase 5, polish
- `6x` — Cross-cutting (audit, OAuth health, key rotation)

Each ticket states its phase, dependencies, constitution references, scope,
out-of-scope, and acceptance criteria. Keep them tight — these are tickets,
not specs. Specs live in [MVP.md](../MVP.md) and the constitution.

## Closing a ticket

Move the file to `backlog/done/` in the same commit that lands the work.
Do not delete; the closed file is the audit trail of what the ticket meant
when it was implemented.

## Adding a ticket

Pick the next free number in the right phase range. If the work is genuinely
new (not in MVP.md), open an ADR in [decisions/](../decisions) first and
reference it from the ticket.
