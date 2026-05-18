# 67 — Timing-safe cron secret comparison

**Phase:** 6
**Severity:** High (low impact at 32-byte secret length; trivial fix)
**Audit ref:** SECURITY_AUDIT.md §H2

## Goal

Compare the cron `Authorization` header against the expected bearer value in constant time.

## Scope

- In `apps/web/app/api/cron/validate-backends/route.ts`, replace:
  ```ts
  if (request.headers.get("authorization") !== expected) { … }
  ```
  with `crypto.timingSafeEqual` on equal-length buffers:
  ```ts
  import { timingSafeEqual } from "node:crypto";
  const a = Buffer.from(request.headers.get("authorization") ?? "");
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response("…", { status: 401 });
  }
  ```
- Add a tiny helper `lib/timing-safe.ts` if/when other routes need the same.
- Unit test: equal vs different-length inputs both return false without throwing.

## Out of scope

- Migrating to Vercel Cron's native auth header (covered by ticket 75's environment work).

## Acceptance criteria

- [ ] No `!==` / `==` comparisons of secrets anywhere in the auth-adjacent paths.
- [ ] Unit test in place.
