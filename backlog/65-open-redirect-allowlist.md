# 65 — Open-redirect allowlist on `next` parameters

**Phase:** 6
**Severity:** Critical
**Audit ref:** SECURITY_AUDIT.md §C3, §H3
**Constitution refs:** Principle 4 (real auth, not URL obscurity).

## Goal

Stop accepting absolute URLs in `next` / redirect-target query parameters. Today `apps/web/app/auth/callback/route.ts` does `new URL(next, url.origin)`, which silently returns the absolute URL when `next` is already absolute — a textbook open redirect after a successful auth code exchange.

## Scope

- Add a tiny helper `lib/safe-next.ts`:
  ```ts
  export function safeNextPath(raw: string | null | undefined): string {
    if (!raw) return "/";
    return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  }
  ```
- Use it in:
  - `apps/web/app/auth/callback/route.ts`
  - `apps/web/app/invite/route.ts` (for any user-supplied next)
  - Any other `searchParams.get("next" | "redirect" | "return_to")` reader.
- Re-validate the DB-controlled `slug` in `invite` before composing `/a/${slug}` (defence in depth — slug today is server-generated, but format-validate anyway: `^[a-z0-9-]{1,64}$`).
- Vitest:
  - `safeNextPath("https://attacker.example/")` → `"/"`
  - `safeNextPath("//attacker.example/")` → `"/"`
  - `safeNextPath("/dashboard")` → `"/dashboard"`
  - `safeNextPath(null)` → `"/"`

## Out of scope

- Building a more elaborate allowlist of internal paths.

## Acceptance criteria

- [ ] Every `searchParams.get("next" | "redirect" | "return_to")` call goes through `safeNextPath`.
- [ ] Unit tests cover the helper.
- [ ] Manual check: `/auth/callback?code=…&next=https://attacker.example` redirects to `/`, not off-domain.
