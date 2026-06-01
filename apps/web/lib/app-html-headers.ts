/**
 * Response headers for `/a/<slug>`.
 *
 * Constitution refs: Principle 7 (sharing is access, not ownership
 * transfer). Audit ref: SECURITY_AUDIT.md §C2.
 *
 * The load-bearing header is `Content-Security-Policy: sandbox …`. CSP
 * sandbox puts the response document into a unique opaque origin (the
 * same posture an `<iframe sandbox>` gets without `allow-same-origin`).
 * Scripts can still run because we keep `allow-scripts`, but the
 * document can no longer:
 *
 *   - Read the Buendia dashboard's first-party cookies, `localStorage`,
 *     `IndexedDB`, or service workers (different origin).
 *   - Call `fetch("/api/v1/…", { credentials: "include" })` and have
 *     cookies attached.
 *   - Iframe the dashboard and clickjack it (`frame-ancestors 'self'`
 *     plus `X-Frame-Options`).
 *
 * This is the short-term fix. The durable fix (ticket 75) is to serve
 * apps from a separate, cookieless origin — at which point CSP sandbox
 * is belt-and-braces.
 *
 * SDK considerations: the hosted Buendia SDK uses `persistSession:
 * false`, so it doesn't touch storage APIs — the sandbox doesn't break
 * realtime or auth flows.
 *
 * `script-src` keeps `'unsafe-inline'` because the edge route injects
 * `<script>window.__APP_CONFIG__=…</script>` inline. `https:` lets the
 * app HTML load the SDK from a CDN (jsdelivr / unpkg) without us
 * pinning a specific host here. `connect-src` allows `wss:` for
 * Supabase realtime.
 */
export function appHtmlHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": [
      // The sandbox directive — the actual isolation.
      "sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads",
      "default-src 'self' https: data: blob:",
      "script-src 'self' 'unsafe-inline' https:",
      "style-src 'self' 'unsafe-inline' https:",
      "connect-src 'self' https: wss:",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https:",
      "frame-ancestors 'self'",
    ].join("; "),
    "X-Frame-Options": "SAMEORIGIN",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin",
    ...extra,
  };
}
