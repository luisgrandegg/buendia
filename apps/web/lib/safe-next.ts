/**
 * Validate a redirect target read from a `next` / `return_to` / `redirect`
 * query parameter. Returns the path verbatim if it's an unambiguous
 * same-origin path; otherwise returns `"/"`.
 *
 * Rules:
 *   - Must start with `"/"`.
 *   - Must not start with `"//"` or `"/\\"` — those are protocol-relative
 *     URLs that browsers happily resolve against `https:`.
 *
 * Why this matters: `new URL(absolute, base)` returns `absolute` when
 * `absolute` is itself a valid URL. So
 * `new URL("https://attacker.example/", "https://buendia.app")` evaluates
 * to `https://attacker.example/`, and any redirect built that way
 * becomes an open redirect — a textbook phishing primitive after a
 * successful auth-code exchange.
 *
 * See SECURITY_AUDIT.md §C3 and backlog/done/65-open-redirect-allowlist.md.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw.length === 0) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}
