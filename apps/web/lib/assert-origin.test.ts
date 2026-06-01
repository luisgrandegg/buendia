import { describe, expect, it } from "vitest";

import { assertSameOriginFromHeaders } from "./assert-origin";

function h(map: Record<string, string>): Headers {
  return new Headers(map);
}

describe("assertSameOriginFromHeaders", () => {
  it("allows requests with no Origin header (same-origin form POST)", () => {
    expect(() => assertSameOriginFromHeaders(h({ host: "buendia.app" }))).not.toThrow();
  });

  it("allows Origin that matches host over https", () => {
    expect(() =>
      assertSameOriginFromHeaders(h({ host: "buendia.app", origin: "https://buendia.app" })),
    ).not.toThrow();
  });

  it("allows Origin over http only for localhost", () => {
    expect(() =>
      assertSameOriginFromHeaders(h({ host: "localhost:3000", origin: "http://localhost:3000" })),
    ).not.toThrow();
    expect(() =>
      assertSameOriginFromHeaders(h({ host: "buendia.app", origin: "http://buendia.app" })),
    ).toThrow(/forbidden/);
  });

  it("rejects cross-origin invocation", () => {
    expect(() =>
      assertSameOriginFromHeaders(h({ host: "buendia.app", origin: "https://attacker.example" })),
    ).toThrow(/forbidden/);
  });

  it("prefers x-forwarded-host over host", () => {
    expect(() =>
      assertSameOriginFromHeaders(
        h({
          host: "internal-proxy:8080",
          "x-forwarded-host": "buendia.app",
          origin: "https://buendia.app",
        }),
      ),
    ).not.toThrow();
  });

  it("rejects when host is missing", () => {
    expect(() => assertSameOriginFromHeaders(h({ origin: "https://buendia.app" }))).toThrow(
      /forbidden/,
    );
  });
});
