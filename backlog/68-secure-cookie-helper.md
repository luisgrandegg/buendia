# 68 — Centralised `Secure` cookie flag helper

**Phase:** 6
**Severity:** High
**Audit ref:** SECURITY_AUDIT.md §H5

## Goal

Stop driving cookie `Secure` flags off `NODE_ENV` per call-site. One helper, one source of truth, defaulting to `true`.

## Background

Today:
- `apps/web/app/actions/personal-access-tokens.ts:76` sets `secure: process.env.NODE_ENV === "production"`.
- `apps/web/app/api/auth/supabase/start/route.ts:45` uses an inverted-localhost check.

Any non-production deployment over plain HTTP (staging behind a misconfigured proxy, preview build with `NODE_ENV=development`) ships PAT plaintext and OAuth state cookies in the clear.

## Scope

- Add `apps/web/lib/cookies.ts`:
  ```ts
  import { env } from "@/lib/env";
  export const cookieSecure = (() => {
    try {
      return new URL(env.siteUrl).protocol === "https:";
    } catch {
      return true; // fail closed
    }
  })();
  ```
- Replace every `secure:` setting on cookies in:
  - `app/actions/personal-access-tokens.ts`
  - `app/api/auth/supabase/start/route.ts`
  - `lib/pat-reveal-cookie.ts`
  - Anywhere else `cookies().set` / `response.cookies.set` runs.
- Confirm `SameSite` is set on every cookie too (`lax` default for sessions, `strict` for state/PAT).
- Unit test: with `NEXT_PUBLIC_SITE_URL=http://localhost:3000`, helper returns `false`; with `https://buendia.app`, returns `true`.

## Out of scope

- Rotating any leaked tokens (assume not breached; nothing to rotate).

## Acceptance criteria

- [ ] No `secure: process.env.NODE_ENV === …` patterns remain in the repo.
- [ ] Helper unit-tested.
- [ ] Documented in `decisions/` or inline comment why the flag is anchored to `siteUrl`.
