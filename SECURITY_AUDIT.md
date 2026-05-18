# Security Audit — May 2026

Branch: `claude/security-audit-4ncg4`. Scope: full repo at `b40cf13`.

Audited surfaces: auth & token issuance, control-plane DB / RLS, schema provisioner, HTTP API v1, edge serve route (`/a/<slug>`), server actions, SDK, MCP package, build config and secrets hygiene.

Findings are ordered by severity. Each lists file:line, the concrete issue, and a fix.

---

## CRITICAL

### C1. `app_members` view bypasses RLS — every authenticated user can enumerate every app

`packages/db/migrations/0007_app_shares.sql:68-84`, `packages/db/migrations/0008_app_members_with_app_fields.sql:9-33`

The view is created with `create or replace view ... as ...` with no view options. In PostgreSQL ≥15 the default is `security_invoker = false`, so the view executes with the view owner's privileges (typically `postgres`/superuser) and **bypasses RLS on the underlying `apps` and `app_shares` tables**. The view exposes `app_id`, `owner_id`, `slug`, `name`, `schema_name`, `team_id`, `html_storage_path`, `user_id`, `role`.

Impact: any holder of a Supabase publishable-key + JWT (i.e. any signed-up user) can run

```ts
supabase.from("app_members").select("*");
```

and obtain the slug, schema, owner, team and storage path of every app in the system. The application-layer `.eq("user_id", user.id)` in `apps/web/app/a/[slug]/route.ts:43` is voluntary — Supabase clients can omit it. Same problem affects `lib/operations/apps.ts:listAppsForUser`.

This also breaks Principle 8 (open-protocol substitutes) and Hard Invariant _"Every table in an app schema gets RLS"_ in spirit: the platform itself is leaking its registry.

Fix: recreate the view with `security_invoker`, **and** widen `public.apps`'s SELECT policy so collaborators can read shared rows through the view:

```sql
alter view public.app_members set (security_invoker = true);

create policy "shared user reads shared apps"
  on public.apps for select
  using (
    exists (select 1 from public.app_shares s
            where s.app_id = apps.id and s.user_id = auth.uid())
  );

-- Repeat for app_versions if collaborators need version history.
```

Add a regression test that queries `app_members` as a non-member and asserts zero rows.

### C2. User-uploaded HTML at `/a/<slug>` is served same-origin as the dashboard with no isolation

`apps/web/app/a/[slug]/route.ts:121-149` (`htmlHeaders()` returns only `Content-Type: text/html; charset=utf-8`).

The HTML is rendered on the **same origin** as the Buendia dashboard, with `window.__APP_CONFIG__` injected inline. Response headers set: only `Content-Type` and `Cache-Control`. There is **no** CSP, no `X-Frame-Options`, no `X-Content-Type-Options`, no `Referrer-Policy`, no sandboxing.

The threat is not the owner attacking themselves — it's an owner attacking a sharee. After C5 below, a sharee opens `/a/<slug>` while logged in to Buendia. The owner's HTML runs JavaScript in the `buendia.com` origin with the sharee's first-party cookies and same-origin policy. It can:

- `fetch("/api/v1/apps", { credentials: "include" })` — list & manipulate the sharee's own apps via PATs they've authenticated as.
- Hit Next server actions on the sharee's behalf (rename/delete their apps, invite collaborators, mint PATs).
- Read the sharee's IndexedDB / `localStorage` (including any standalone-mode publishable keys; see M9).
- Iframe the dashboard and clickjack confirmations.

This blows up Principle 7 (sharing is access, not ownership transfer) — a malicious owner gains effective control of every account they can persuade to open the app.

Fix (in order of strength):

1. **Serve apps on a separate, cookieless origin.** Use a sandbox domain (e.g. `*.apps.buendia.app` or per-app `<slug>.apps.buendia.app`). Dashboard cookies are scoped to `buendia.app` only; the app origin has no ambient authority and only the injected JWT. This is the only durable fix and matches what every shared-app platform converges on (Glitch, Replit deploys, Vercel preview blobs).
2. **Until (1) ships,** add restrictive headers and consider serving via a CSP-sandboxed iframe wrapper at the dashboard origin:
   - `Content-Security-Policy: sandbox allow-scripts; default-src 'self'; connect-src https://<owner-supabase-host>; script-src 'unsafe-inline' 'self' https://cdn.jsdelivr.net …`
   - `X-Frame-Options: DENY` on dashboard pages; embed `/a/<slug>` only inside an explicit iframe.
   - `Referrer-Policy: no-referrer`.
   - `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp` on the dashboard so the app HTML can't `window.opener` back into it.
3. Move app HTML out of the cookie session — drop `credentials: "include"` in the SDK refresh flow (see H4) so the app stops needing first-party cookies entirely.

Add an ADR documenting the chosen isolation model before shipping public sharing.

### C3. Open redirect in `/auth/callback`

`apps/web/app/auth/callback/route.ts:7,13`

```ts
const next = url.searchParams.get("next") ?? "/";
…
return NextResponse.redirect(new URL(next, url.origin));
```

`new URL("https://attacker.example/", "https://buendia.app")` evaluates to `https://attacker.example/` — the base is ignored when the input is absolute. A crafted `/auth/callback?code=…&next=https://attacker.example` redirects an authenticated user off-domain. Standard phishing primitive (steal OAuth code via referrer, harvest credentials on look-alike domain).

Fix:

```ts
const raw = url.searchParams.get("next") ?? "/";
const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
return NextResponse.redirect(new URL(next, url.origin));
```

Apply the same allowlist to every `next`/`redirect`-style parameter (`/invite` route also takes a redirect target — audit it under the same rule).

---

## HIGH

### H1. Schema provisioner interpolates schema identifier into SQL with regex-only defence

`apps/web/lib/schema-provisioner.ts:103-152`

The schema name is validated against `^app_[a-z0-9_]+$` and then **string-concatenated** into `drop schema if exists ${schemaName}`, `create schema ${schemaName}`, `set local search_path = ${schemaName}, public`. The regex currently makes this safe; if anyone ever relaxes it (e.g. to support unicode or `-`), it becomes SQL injection on the user's own Supabase project (a project Buendia connects to with elevated grants).

Fix: quote identifiers explicitly. Use `pg-format` or wrap in `format('%I', $1)` on the SQL side:

```sql
execute format('create schema %I', schema_name);
```

Or send the schema name as a parameter to a `security definer` provisioning function on the owner backend, with `quote_ident` inside.

### H2. Cron secret compared with `!==`, not constant-time

`apps/web/app/api/cron/validate-backends/route.ts:31-35`

```ts
if (request.headers.get("authorization") !== expected) { … }
```

Timing leak on the secret. Even at 32 bytes the risk is small, but the fix is one import.

```ts
import { timingSafeEqual } from "node:crypto";
const a = Buffer.from(request.headers.get("authorization") ?? "");
const b = Buffer.from(expected);
if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response("…", { status: 401 });
```

### H3. `next` redirect in `/invite` accepts DB-controlled slug without revalidation

`apps/web/app/invite/route.ts` redirects to `/a/${slug}` after acceptance. The slug is generated server-side today (`slugify` + random suffix) so this is currently safe. Worth defending in depth: re-validate `^[a-z0-9-]{1,64}$` on the slug before using it in a redirect path so future code paths can't poison it.

### H4. SDK refresh fetch uses `credentials: "include"`

`packages/sdk/src/index.ts:405-407`

```ts
res = await fetch(refreshUrl, { method: "POST", credentials: "include" });
```

This is the bridge that ties the app-HTML origin (currently same as dashboard, see C2) to the dashboard session cookie. Two reasons it should go away:

1. While same-origin, it makes the cookie session the de facto auth boundary, defeating the goal of moving auth to the short-lived JWT.
2. The moment apps move to an isolated origin (recommended in C2), the `include` will silently stop working and you'll be tempted to add CORS allowlists for the cookie — don't.

Fix: change `/api/jwt/refresh` to accept the current JWT in `Authorization: Bearer …` and look up the membership server-side from `sub`/`app_id` claims; the SDK passes the current JWT instead of cookies. `credentials: "omit"`, `redirect: "error"`.

### H5. PAT reveal cookie + OAuth state cookie `Secure` flag conditional on `NODE_ENV`

`apps/web/app/actions/personal-access-tokens.ts:76`, `apps/web/app/api/auth/supabase/start/route.ts:45`

`secure: process.env.NODE_ENV === "production"` (and similar inversion in the OAuth start route). In any non-production deployment over plain HTTP, the PAT plaintext and the OAuth state are sent in clear. Most teams hit this when they spin up a staging deploy with `NODE_ENV=development` or when running behind a misconfigured proxy that strips HTTPS.

Fix: drive `Secure` from a single env-derived flag (`isHttps` resolved against `NEXT_PUBLIC_SITE_URL`), defaulting to `true`, and only allow `false` when the host is literally `localhost`.

### H6. Missing membership check on `/api/jwt/refresh` rate / scope

`apps/web/app/api/jwt/refresh/route.ts`

The refresh route mints a fresh app JWT on each call. There is no rate limit. Decrypting the owner JWT secret on every refresh (AES-GCM with a master key) means a hot loop also turns into a CPU amplification target on the master-key path. Cache the decrypted secret per `owner_id` in an in-process LRU with a 60-second TTL; rate-limit refresh to ~1/min per (user, app).

---

## MEDIUM

### M1. No CSRF check on Next.js server actions

`apps/web/app/actions/*.ts`

Next 15 ships an Origin/Host check for server actions invoked via form POST, but it is gated on `experimental.serverActions.allowedOrigins` being set. `next.config.ts` should be audited — if not configured, an attacker page can POST a multipart form to the action endpoint with the user's cookie attached and trigger destructive actions (delete app, invite collaborator).

Fix: set `experimental.serverActions.allowedOrigins` to the dashboard host(s) in `next.config.ts`. Add a manual `headers().get("origin")` check in destructive actions (`apps.delete`, `shares.invite`, `personal-access-tokens.mint`).

### M2. No rate limit on signup, invite, share, PAT mint, JWT refresh

Mass-invitation spam from a signed-up account, PAT-grinding, and signup brute-force are all open. Vercel KV + a simple sliding window in a small helper covers it. Tie limits to user ID where authenticated, IP otherwise.

### M3. `/api/v1/me` returns owner-backend status to PAT callers

`apps/web/app/api/v1/me/route.ts`

A leaked PAT learns whether the user has a connected backend and when. Minor info leak; consider gating backend metadata on session-authenticated callers only.

### M4. Audit log has no UPDATE/DELETE policy _and_ no CHECK on `action`

`packages/db/migrations/0003_audit_log.sql:26-34`

The audit log enables RLS with only an `INSERT` policy bound to `actor_id = auth.uid()`. With RLS on and no SELECT/UPDATE/DELETE policies, reads and tampering are denied to authenticated users — that part is fine, the upstream auditor flagging this as "Critical" was incorrect. **But** there is no `check (action in (…))` constraint, so any authenticated user can spam-insert audit rows with arbitrary `action` strings against themselves. This pollutes incident response and lets an attacker create misleading entries before/after they exploit something else.

Fix: add a `check` constraint enumerating valid actions, or move the action column to an enum/foreign key with whitelisted values. Also add `using (false)` policies for SELECT/UPDATE/DELETE explicitly so the intent is documented in the migration (defense-in-depth and Supabase advisor will stop complaining).

### M5. `audit.ts` action union out of sync with call sites

`packages/db/src/audit.ts` exports `AUDIT_ACTIONS`, but `apps/web/app/api/cron/validate-backends/route.ts:94` records `backend.credentials_refreshed` which is not in the list. Either the test build is filtering it out or TS strictness is relaxed somewhere — confirm and add the missing action(s). Without the type guard the audit trail silently grows new strings.

### M6. SDK trusts `window.__APP_CONFIG__` unconditionally

`packages/sdk/src/index.ts:76-77` reads `__APP_CONFIG__` with no schema validation. If a user-authored HTML accidentally (or maliciously) overrides the global before the SDK bootstraps, the SDK will connect to an attacker-controlled Supabase URL and send the issued JWT there.

Fix: define a Zod (or hand-rolled) schema for `BuendiaAppConfig`, validate eagerly, and refuse to bootstrap if `supabaseUrl` doesn't match `https://<expected>` (you can pin the host via a meta tag the edge route writes alongside the config). Also freeze the global on first read.

### M7. `app_versions` lacks a sharing read policy

`packages/db/migrations/0005_apps.sql:59-66`

Same issue as C1 for collaborators: they can't read `app_versions`, only the owner can. If you ever surface version history to collaborators, you'll need a policy that mirrors C1's fix.

### M8. Schema provisioner has no "refuse if RLS disabled" check, despite the Constitution requiring it

The provisioner creates tables with RLS enabled. Once provisioned, **nothing prevents** the user from later running `alter table … disable row level security` in their own Supabase project, leaving the SDK to read everything. The cron-validate route should also check RLS is still enabled on every table in each app schema, and flip `grant_status` to `degraded` if not.

### M9. Standalone-mode SDK persists publishable key to `localStorage`

`packages/sdk/src/index.ts:209-217`

Acceptable for true standalone use (no Buendia involvement), but worth a note in the README: any XSS in the host page exfiltrates the key. Keep schema there if you must; drop the key on a `beforeunload` or write to `sessionStorage`.

### M10. Revocation overlay is removable by host code

`packages/sdk/src/index.ts:465-531`

The revocation overlay is a DOM node appended to `document.body`. A malicious app (the C2 scenario) can `remove()` it. Because the SDK also stops querying when revoked (the `stopped` flag), the user is _protected from new requests_ — but they may not realise their session is dead. Acceptable in the short term; the real fix is C2 (run the app in a sandboxed origin so the host can't manipulate dashboard-owned UI).

---

## LOW

- **L1.** `loadMasterKey` (`packages/db/src/credentials.ts:41-52`) doesn't pre-validate base64 — a malformed `BUENDIA_MASTER_KEY` throws a generic decode error. One-line fix.
- **L2.** Credential envelope encryption (`packages/db/src/credentials.ts`) uses fresh IVs (good) but no AAD. Bind the version byte as AAD so a format upgrade can't be downgraded.
- **L3.** Invitation tokens are stored verbatim in `invitations`. PATs are correctly stored as SHA-256 hashes; do the same for invitations so a DB read doesn't yield live links.
- **L4.** `auth-token.ts` PAT lookup notes that "the database does the constant-time work" — the comment is fine, just add a short test that confirms hashed-prefix-only lookup (so the index is over the prefix, not the secret).
- **L5.** Slug paths are validated on creation but not bounded on reads. Add a server-side `slug.length <= 64` assertion at `/a/[slug]/route.ts` entry and any API v1 slug param parsing.
- **L6.** `middleware.ts` matcher excludes static assets correctly but not `.txt`/`.json`/`.xml`. If you ever serve a `robots.txt` or sitemap, ensure middleware doesn't try to attach a session to it. Today this is harmless.
- **L7.** Service-role admin client is correctly scoped (`autoRefreshToken: false, persistSession: false`) — flagging as a positive.
- **L8.** No `.env` files committed; no hard-coded secrets in source — positive.
- **L9.** Next.js version (per `package.json`) should be confirmed as ≥ 15.1.6 to dodge CVE-2025-29927.

---

## Suggested remediation order

1. **C1** — single SQL migration, lowest-risk highest-impact fix.
2. **C3** — three-line patch.
3. **C2** — design work first (ADR for the cookieless app origin), then implementation. Land H4 in the same release so the SDK stops needing dashboard cookies.
4. **H1, H2, H5, H6, M1, M2** — small, mostly independent patches.
5. The rest can ride normal backlog tickets.

Suggested follow-ups outside this audit's scope:

- Threat-model the MCP server's local PAT storage on contributor laptops.
- Add `pnpm audit` and a Supabase RLS lint (e.g. `supabase db lint`) to CI.
- Document the access-removal window's interaction with cached JWTs (already addressed in `backlog/done/33`, but worth cross-linking from `CONSTITUTION.md`).
