import { headers } from "next/headers";

/**
 * Single source of truth for the cookie `Secure` flag.
 *
 * Previously each call site did `secure: process.env.NODE_ENV === "production"`
 * (or an ad-hoc inverted-localhost check). Both leak: any non-production
 * deployment served over HTTPS still wants `Secure=true`, and a misconfigured
 * staging deploy with `NODE_ENV=development` would ship PAT plaintext and
 * OAuth state cookies in clear.
 *
 * The signal we trust is the request itself:
 *   - `x-forwarded-proto: https` → Secure=true.
 *   - `x-forwarded-proto: http`  → Secure=false (dev).
 *   - No proto header but host is localhost / 127.0.0.1 → Secure=false.
 *   - Anything else → Secure=true (fail closed).
 *
 * See SECURITY_AUDIT.md §H5 and backlog/done/68-secure-cookie-helper.md.
 */
export async function cookieSecure(): Promise<boolean> {
  return cookieSecureFromHeaders(await headers());
}

/**
 * Test-friendly variant — supply the request `Headers` directly. The
 * async wrapper above is what production callers reach for.
 */
export function cookieSecureFromHeaders(h: Headers): boolean {
  const proto = h.get("x-forwarded-proto");
  if (proto === "https") return true;
  if (proto === "http") return false;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1") || host === "") {
    return false;
  }
  return true;
}
