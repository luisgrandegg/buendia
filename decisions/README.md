# Architectural Decision Records

Numbered ADRs in the form `NNNN-title.md`, starting at `0001`.

Open an ADR before:

- Changing `CONSTITUTION.md`, `CLAUDE.md`, or any existing ADR.
- Adding a capability that isn't already in the Platform Registry.
- Introducing a dependency that couples Buendia to a single vendor's
  non-standard capability.
- Any architectural choice that is hard to reverse (storage location,
  encryption envelope, transport protocol, etc.).

## Template

```
# NNNN — Title

**Status:** Proposed | Accepted | Superseded by NNNN
**Date:** YYYY-MM-DD

## Context
What problem is this ADR solving? What constraints apply?

## Decision
What we are doing.

## Consequences
What this enables, what it costs, what it forecloses.

## Alternatives considered
Other options and why we passed.
```
