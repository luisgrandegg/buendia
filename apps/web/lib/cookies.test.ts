import { describe, expect, it } from "vitest";

import { cookieSecureFromHeaders } from "./cookies";

function h(map: Record<string, string>): Headers {
  return new Headers(map);
}

describe("cookieSecureFromHeaders", () => {
  it("trusts x-forwarded-proto=https", () => {
    expect(cookieSecureFromHeaders(h({ "x-forwarded-proto": "https" }))).toBe(true);
  });

  it("trusts x-forwarded-proto=http (dev tunnels, plain HTTP staging)", () => {
    expect(cookieSecureFromHeaders(h({ "x-forwarded-proto": "http" }))).toBe(false);
  });

  it("treats localhost as insecure when no proto header is set", () => {
    expect(cookieSecureFromHeaders(h({ host: "localhost:3000" }))).toBe(false);
    expect(cookieSecureFromHeaders(h({ "x-forwarded-host": "127.0.0.1" }))).toBe(false);
  });

  it("fails closed for everything else (no headers, weird hosts)", () => {
    expect(cookieSecureFromHeaders(h({}))).toBe(false); // empty host → unknown; treat as insecure dev
    expect(cookieSecureFromHeaders(h({ host: "buendia.app" }))).toBe(true);
    expect(cookieSecureFromHeaders(h({ "x-forwarded-host": "preview.vercel.app" }))).toBe(true);
  });

  it("prefers x-forwarded-host over host when both are present", () => {
    expect(
      cookieSecureFromHeaders(
        h({ host: "internal-proxy:8080", "x-forwarded-host": "buendia.app" }),
      ),
    ).toBe(true);
  });

  it("prefers proto header over host inference", () => {
    expect(cookieSecureFromHeaders(h({ host: "buendia.app", "x-forwarded-proto": "http" }))).toBe(
      false,
    );
    expect(
      cookieSecureFromHeaders(h({ host: "localhost:3000", "x-forwarded-proto": "https" })),
    ).toBe(true);
  });
});
