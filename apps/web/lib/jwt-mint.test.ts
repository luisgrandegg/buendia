import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  JWT_TTL_SECONDS,
  REFRESH_GRACE_SECONDS,
  mintAppJwt,
  unsafeDecodeClaims,
  verifyAppJwt,
} from "./jwt-mint";

/**
 * Coverage for PR #14 (JWT mint endpoint). The minter signs HS256 tokens
 * with the *owner's* Supabase JWT secret so the user's project accepts
 * them natively. The token claims are the security boundary — every claim
 * here is load-bearing.
 */

function base64UrlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function decodeClaims(jwt: string): Record<string, unknown> {
  const parts = jwt.split(".");
  expect(parts.length).toBe(3);
  return JSON.parse(base64UrlDecode(parts[1]!).toString("utf8")) as Record<string, unknown>;
}

const BASE_PARAMS = {
  jwtSecret: "super-secret-jwt-key",
  userId: "user-1",
  appId: "app-1",
  appSchema: "app_my_slug",
  teamId: "team-1",
  role: "editor" as const,
};

describe("mintAppJwt", () => {
  it("issues a three-part HS256 JWT with the expected header", () => {
    const { jwt } = mintAppJwt({ ...BASE_PARAMS, now: 1_700_000_000 });
    const [headerB64] = jwt.split(".");
    const header = JSON.parse(base64UrlDecode(headerB64!).toString("utf8"));
    expect(header).toEqual({ alg: "HS256", typ: "JWT" });
  });

  it("sets the constitutionally-required claims", () => {
    const { jwt, exp } = mintAppJwt({ ...BASE_PARAMS, now: 1_700_000_000 });
    const claims = decodeClaims(jwt);
    // §4 / Auth invariants:
    expect(claims.role).toBe("authenticated"); // never service_role
    expect(claims.aud).toBe("authenticated");
    expect(claims.iss).toBe("buendia");
    expect(claims.sub).toBe("user-1");
    // Buendia-specific claims drive RLS in the owner's schema.
    expect(claims.app_id).toBe("app-1");
    expect(claims.app_schema).toBe("app_my_slug");
    expect(claims.team_id).toBe("team-1");
    expect(claims.buendia_role).toBe("editor");
    // exp = iat + TTL.
    expect(claims.iat).toBe(1_700_000_000);
    expect(claims.exp).toBe(1_700_000_000 + JWT_TTL_SECONDS);
    expect(exp).toBe(claims.exp);
  });

  it("defaults iat to Math.floor(Date.now() / 1000)", () => {
    const before = Math.floor(Date.now() / 1000);
    const { jwt } = mintAppJwt(BASE_PARAMS);
    const after = Math.floor(Date.now() / 1000);
    const claims = decodeClaims(jwt);
    expect(typeof claims.iat).toBe("number");
    expect(claims.iat as number).toBeGreaterThanOrEqual(before);
    expect(claims.iat as number).toBeLessThanOrEqual(after + 1);
  });

  it("signs with HMAC-SHA256 over `header.payload` using the owner's JWT secret", () => {
    const { jwt } = mintAppJwt({ ...BASE_PARAMS, now: 1_700_000_000 });
    const [h, p, sig] = jwt.split(".");
    const expected = createHmac("sha256", BASE_PARAMS.jwtSecret)
      .update(`${h}.${p}`)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(sig).toBe(expected);
  });

  it("rejects a verifier that swaps the secret (signature mismatch)", () => {
    const { jwt } = mintAppJwt({ ...BASE_PARAMS, now: 1 });
    const [h, p, sig] = jwt.split(".");
    const otherSig = createHmac("sha256", "different-secret")
      .update(`${h}.${p}`)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(sig).not.toBe(otherSig);
  });

  it("throws on an empty jwtSecret to avoid silently signing with empty key material", () => {
    expect(() => mintAppJwt({ ...BASE_PARAMS, jwtSecret: "" })).toThrow(/non-empty jwtSecret/);
  });

  it("produces different tokens for different roles or team_ids", () => {
    const owner = mintAppJwt({ ...BASE_PARAMS, role: "owner", now: 1 }).jwt;
    const editor = mintAppJwt({ ...BASE_PARAMS, role: "editor", now: 1 }).jwt;
    const team2 = mintAppJwt({ ...BASE_PARAMS, teamId: "team-2", now: 1 }).jwt;
    expect(owner).not.toBe(editor);
    expect(team2).not.toBe(editor);
  });
});

describe("verifyAppJwt", () => {
  const now = 1_700_000_000;
  function fresh(overrides: Partial<typeof BASE_PARAMS> = {}) {
    return mintAppJwt({ ...BASE_PARAMS, ...overrides, now }).jwt;
  }

  it("accepts a freshly-minted JWT signed with the same secret", () => {
    const res = verifyAppJwt({ jwt: fresh(), jwtSecret: BASE_PARAMS.jwtSecret, now });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.claims.sub).toBe(BASE_PARAMS.userId);
      expect(res.claims.app_id).toBe(BASE_PARAMS.appId);
    }
  });

  it("rejects a JWT signed with a different secret (constant-time compare)", () => {
    const res = verifyAppJwt({ jwt: fresh(), jwtSecret: "different-secret", now });
    expect(res).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects tampered claims (signature no longer matches)", () => {
    const jwt = fresh();
    const [h, , s] = jwt.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({ ...BASE_PARAMS, sub: "attacker" }))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const tampered = `${h}.${tamperedPayload}.${s}`;
    expect(verifyAppJwt({ jwt: tampered, jwtSecret: BASE_PARAMS.jwtSecret, now })).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("rejects an alg=none downgrade", () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" }))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const payload = Buffer.from(
      JSON.stringify({
        sub: "u",
        role: "authenticated",
        aud: "authenticated",
        iss: "buendia",
        app_id: "a",
        app_schema: "s",
        team_id: "t",
        buendia_role: "owner",
        iat: now,
        exp: now + 60,
      }),
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const noSig = `${header}.${payload}.`;
    expect(verifyAppJwt({ jwt: noSig, jwtSecret: BASE_PARAMS.jwtSecret, now })).toEqual({
      ok: false,
      reason: "wrong_alg",
    });
  });

  it("rejects expired JWTs past the grace window", () => {
    const jwt = fresh();
    const past = now + JWT_TTL_SECONDS + REFRESH_GRACE_SECONDS + 1;
    expect(verifyAppJwt({ jwt, jwtSecret: BASE_PARAMS.jwtSecret, now: past })).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("accepts JWTs just past exp within the grace window", () => {
    const jwt = fresh();
    const justAfter = now + JWT_TTL_SECONDS + 10;
    const res = verifyAppJwt({ jwt, jwtSecret: BASE_PARAMS.jwtSecret, now: justAfter });
    expect(res.ok).toBe(true);
  });

  it("rejects malformed JWTs", () => {
    expect(verifyAppJwt({ jwt: "not.a.jwt", jwtSecret: "s" })).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(verifyAppJwt({ jwt: "one.two", jwtSecret: "s" })).toEqual({
      ok: false,
      reason: "malformed",
    });
  });
});

describe("unsafeDecodeClaims", () => {
  it("returns claims without verifying the signature", () => {
    const jwt = mintAppJwt({ ...BASE_PARAMS, now: 1 }).jwt;
    const claims = unsafeDecodeClaims(jwt);
    expect(claims?.app_id).toBe("app-1");
    expect(claims?.sub).toBe("user-1");
  });

  it("returns null on malformed input", () => {
    expect(unsafeDecodeClaims("garbage")).toBeNull();
    expect(unsafeDecodeClaims("a.b")).toBeNull();
  });
});
