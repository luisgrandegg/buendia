import { describe, expect, it } from "vitest";

import { appHtmlHeaders } from "./app-html-headers";

describe("appHtmlHeaders", () => {
  it("includes the CSP sandbox directive (the load-bearing isolation)", () => {
    const csp = appHtmlHeaders()["Content-Security-Policy"]!;
    // The directive must be present and must not include `allow-same-origin`,
    // which would put the document back into the dashboard origin and
    // defeat the whole point.
    expect(csp).toMatch(/(^|;\s*)sandbox\b/);
    expect(csp).toContain("allow-scripts");
    expect(csp).not.toContain("allow-same-origin");
  });

  it("sets the standard hardening headers", () => {
    const h = appHtmlHeaders();
    expect(h["Content-Type"]).toBe("text/html; charset=utf-8");
    expect(h["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("no-referrer");
    expect(h["Cross-Origin-Opener-Policy"]).toBe("same-origin");
  });

  it("allows Supabase realtime (wss:) in connect-src", () => {
    const csp = appHtmlHeaders()["Content-Security-Policy"]!;
    expect(csp).toMatch(/connect-src[^;]*\bwss:/);
  });

  it("merges caller overrides (e.g. Cache-Control on success)", () => {
    const h = appHtmlHeaders({ "Cache-Control": "no-store" });
    expect(h["Cache-Control"]).toBe("no-store");
    // Base headers still present.
    expect(h["Content-Security-Policy"]).toContain("sandbox");
  });
});
