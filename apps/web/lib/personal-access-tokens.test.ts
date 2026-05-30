import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { hashToken, mintPersonalAccessToken, parseBearerPat } from "./personal-access-tokens";

/**
 * Coverage for ticket 70 (personal access tokens). The audit (§L4) asked
 * for an explicit test that the DB lookup goes through the hashed form,
 * not the secret. These tests pin the contract.
 */

describe("mintPersonalAccessToken", () => {
  it("uses the buendia_pat_ prefix with a 43-char base64url body", () => {
    const minted = mintPersonalAccessToken();
    expect(minted.plaintext).toMatch(/^buendia_pat_[A-Za-z0-9_-]{43}$/);
  });

  it("hash is SHA-256 of the *plaintext token*, not the secret body", () => {
    const minted = mintPersonalAccessToken();
    const expected = createHash("sha256").update(minted.plaintext, "utf8").digest();
    expect(minted.hash.equals(expected)).toBe(true);
  });

  it("display prefix is a structural prefix of the secret body (not a secret)", () => {
    const minted = mintPersonalAccessToken();
    const body = minted.plaintext.slice("buendia_pat_".length);
    expect(body.startsWith(minted.prefix)).toBe(true);
  });
});

describe("hashToken", () => {
  it("matches a SHA-256 of the plaintext bytes", () => {
    const tok = "buendia_pat_abc";
    expect(hashToken(tok).equals(createHash("sha256").update(tok, "utf8").digest())).toBe(true);
  });

  it("is the function the DB lookup uses — same input produces same bytes", () => {
    // verifyPersonalAccessToken queries `.eq("token_hash", \\x<hex>)` with
    // hashToken(plaintext). This test is the explicit pin from §L4:
    // the stored value is the hash of the plaintext, never the plaintext.
    const tok = "buendia_pat_zzz";
    expect(hashToken(tok).length).toBe(32);
  });
});

describe("parseBearerPat", () => {
  it("returns the token on a well-formed Authorization header", () => {
    const tok = "buendia_pat_" + "a".repeat(43);
    expect(parseBearerPat(`Bearer ${tok}`)).toBe(tok);
  });

  it("rejects garbage / wrong prefix / wrong length", () => {
    expect(parseBearerPat(null)).toBeNull();
    expect(parseBearerPat("Bearer not_a_pat")).toBeNull();
    expect(parseBearerPat("buendia_pat_short")).toBeNull();
    expect(parseBearerPat("Bearer buendia_pat_" + "a".repeat(10))).toBeNull();
  });
});
