import { headers } from "next/headers";

/**
 * Guard against cross-origin invocation of a server action.
 *
 * Next 15 already does an internal Origin/Host check for form-action
 * POSTs, but that protection is implicit and easy to lose track of when
 * the framework upgrades. This helper is an explicit, defence-in-depth
 * check at the top of each destructive action: a malicious page on
 * `attacker.example` cannot piggy-back on the user's session cookie
 * and trigger a `delete_app` / `mint_pat` / `disconnect` flow.
 *
 * Audit ref: SECURITY_AUDIT.md §M1.
 * See backlog/done/72-server-action-origin-allowlist.md.
 *
 * Rules:
 *   - Missing `Origin` header is allowed. Some browsers omit it for
 *     same-origin form POSTs, and Next's own framework guard catches
 *     hostile cross-site POSTs at the framework layer regardless.
 *   - If `Origin` is present, it must match the request's effective host
 *     (with the right scheme) or appear in the optional
 *     `BUENDIA_ALLOWED_ORIGINS` allowlist (comma-separated absolute
 *     origins, useful for preview deployments that change hostnames).
 *
 * Throws on cross-origin invocation. The thrown error surfaces as a
 * generic Next server-action failure to the client (no info leak).
 */

const ALLOWED = (process.env.BUENDIA_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export async function assertSameOrigin(): Promise<void> {
  const h = await headers();
  assertSameOriginFromHeaders(h);
}

export function assertSameOriginFromHeaders(h: Headers): void {
  const origin = h.get("origin");
  if (!origin) return;

  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) {
    throw new Error("forbidden: no host header");
  }

  const proto = h.get("x-forwarded-proto");
  const expectedHttps = `https://${host}`;
  const expectedHttp = `http://${host}`;

  if (origin === expectedHttps) return;
  if (origin === expectedHttp && (proto === "http" || host.startsWith("localhost"))) {
    return;
  }
  if (ALLOWED.includes(origin)) return;

  throw new Error("forbidden: cross-origin server-action invocation");
}
