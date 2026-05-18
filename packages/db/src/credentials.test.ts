import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { decrypt, encrypt, generateMasterKey, loadMasterKey } from "./credentials";

/**
 * Coverage for PR #10 / #12 (credential storage + envelope encryption).
 * Sensitive owner-backend values are stored encrypted-at-rest under a
 * per-row DEK that is itself wrapped by the operator's KEK.
 */

const KEY_BYTES = 32;

function freshMasterKey(): Buffer {
  return randomBytes(KEY_BYTES);
}

describe("loadMasterKey", () => {
  it("decodes a base64 32-byte key from env", () => {
    const raw = randomBytes(KEY_BYTES).toString("base64");
    const key = loadMasterKey({ BUENDIA_MASTER_KEY: raw });
    expect(key.length).toBe(KEY_BYTES);
  });

  it("throws when the env var is missing", () => {
    expect(() => loadMasterKey({})).toThrow(/BUENDIA_MASTER_KEY/);
  });

  it("throws when the key decodes to the wrong byte length", () => {
    const short = randomBytes(16).toString("base64");
    expect(() => loadMasterKey({ BUENDIA_MASTER_KEY: short })).toThrow(/32 bytes/);
  });
});

describe("encrypt / decrypt round-trip", () => {
  it("decrypts back to the original UTF-8 plaintext", () => {
    const key = freshMasterKey();
    const plaintext = "sb_secret_rotated_value_with_unicode_🔑";
    const blob = encrypt(plaintext, key);
    expect(decrypt(blob, key)).toBe(plaintext);
  });

  it("produces a versioned, self-contained blob", () => {
    const key = freshMasterKey();
    const blob = encrypt("anything", key);
    // version + DEK IV(12) + wrappedDEK(32) + DEK tag(16) + value IV(12) + ct + value tag(16)
    expect(blob[0]).toBe(0x01);
    expect(blob.length).toBeGreaterThanOrEqual(1 + 12 + 32 + 16 + 12 + 16);
  });

  it("generates a fresh DEK + IVs each call (ciphertext differs for the same plaintext)", () => {
    const key = freshMasterKey();
    const a = encrypt("same secret", key);
    const b = encrypt("same secret", key);
    expect(Buffer.compare(a, b)).not.toBe(0);
    expect(decrypt(a, key)).toBe("same secret");
    expect(decrypt(b, key)).toBe("same secret");
  });

  it("handles empty-string plaintexts", () => {
    const key = freshMasterKey();
    const blob = encrypt("", key);
    expect(decrypt(blob, key)).toBe("");
  });

  it("rejects encryption with a wrongly-sized master key", () => {
    expect(() => encrypt("foo", Buffer.alloc(16))).toThrow(/32 bytes/);
  });

  it("rejects decryption with a wrongly-sized master key", () => {
    const key = freshMasterKey();
    const blob = encrypt("foo", key);
    expect(() => decrypt(blob, Buffer.alloc(16))).toThrow(/32 bytes/);
  });
});

describe("decrypt failure modes", () => {
  it("rejects a different KEK (auth tag mismatch on the DEK)", () => {
    const blob = encrypt("payload", freshMasterKey());
    expect(() => decrypt(blob, freshMasterKey())).toThrow();
  });

  it("rejects an unsupported version byte", () => {
    const key = freshMasterKey();
    const blob = encrypt("hi", key);
    const tampered = Buffer.from(blob);
    tampered[0] = 0x02;
    expect(() => decrypt(tampered, key)).toThrow(/version/);
  });

  it("rejects blobs that are too short to be valid", () => {
    const key = freshMasterKey();
    expect(() => decrypt(Buffer.alloc(10), key)).toThrow(/too short/);
  });

  it("rejects a tampered ciphertext (value tag mismatch)", () => {
    const key = freshMasterKey();
    const blob = encrypt("payload", key);
    const tampered = Buffer.from(blob);
    // Flip a bit in the ciphertext region (well past the wrapped DEK / IVs).
    const flipAt = blob.length - 20;
    tampered[flipAt] = tampered[flipAt]! ^ 0xff;
    expect(() => decrypt(tampered, key)).toThrow();
  });
});

describe("generateMasterKey", () => {
  it("returns a base64-encoded 32-byte key that loadMasterKey accepts", () => {
    const raw = generateMasterKey();
    const decoded = Buffer.from(raw, "base64");
    expect(decoded.length).toBe(KEY_BYTES);
    expect(() => loadMasterKey({ BUENDIA_MASTER_KEY: raw })).not.toThrow();
  });

  it("returns a different value on each call", () => {
    expect(generateMasterKey()).not.toBe(generateMasterKey());
  });
});
