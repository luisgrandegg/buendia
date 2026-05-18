import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  generateInvitationToken,
  hashInvitationToken,
  invitationExpiry,
  invitationUrl,
} from "./invitations";

/**
 * Coverage for PR #17 (share invite UI) and PR #26 (pending-invitation flow).
 * The token is unguessable and the expiry stays at the documented 14 days.
 */

describe("generateInvitationToken", () => {
  it("is URL-safe base64 (no padding, no +, no /)", () => {
    const t = generateInvitationToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("is 43 chars (32 random bytes, base64url-encoded)", () => {
    expect(generateInvitationToken().length).toBe(43);
  });

  it("is unique across calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 64; i++) {
      seen.add(generateInvitationToken());
    }
    expect(seen.size).toBe(64);
  });
});

describe("invitationExpiry", () => {
  it("returns now + 14 days", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const exp = invitationExpiry(now);
    expect(exp.toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });

  it("defaults to the current time", () => {
    const before = Date.now();
    const exp = invitationExpiry();
    const after = Date.now();
    const delta = exp.getTime();
    expect(delta).toBeGreaterThanOrEqual(before + 14 * 24 * 60 * 60 * 1000 - 50);
    expect(delta).toBeLessThanOrEqual(after + 14 * 24 * 60 * 60 * 1000 + 50);
  });
});

describe("hashInvitationToken (audit §L3)", () => {
  it("is SHA-256 of the plaintext bytes", () => {
    const tok = generateInvitationToken();
    const expected = createHash("sha256").update(tok, "utf8").digest();
    expect(hashInvitationToken(tok).equals(expected)).toBe(true);
  });

  it("is deterministic — same input, same hash", () => {
    const tok = "abc";
    expect(hashInvitationToken(tok).equals(hashInvitationToken(tok))).toBe(true);
  });

  it("returns a 32-byte buffer (SHA-256 width)", () => {
    expect(hashInvitationToken("x").length).toBe(32);
  });
});

describe("invitationUrl", () => {
  it("builds the invite link with the token query param", () => {
    expect(invitationUrl("https://app.example.com", "abc")).toBe(
      "https://app.example.com/invite?token=abc",
    );
  });

  it("URL-encodes the token", () => {
    const url = invitationUrl("https://x", "a/b+c");
    expect(url).toBe("https://x/invite?token=a%2Fb%2Bc");
  });
});
