import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Personal access tokens — generation, parsing, hashing.
 *
 * Token format: `buendia_pat_<base64url-32-bytes>`. The base64url body is
 * 32 bytes (43 chars unpadded) of cryptographic randomness. We show the
 * full token to the user once on creation; only its SHA-256 hash plus a
 * short prefix make it into the database.
 *
 * See decisions/0011-personal-access-tokens.md.
 */

const PREFIX = "buendia_pat_";
const SECRET_BYTES = 32;
/** First N characters of the base64url body that we surface in the UI. */
export const DISPLAY_PREFIX_LEN = 12;

export interface MintedToken {
  /** Full plaintext token. Shown to the user once; never stored. */
  plaintext: string;
  /** Display prefix persisted to the row. Not a secret. */
  prefix: string;
  /** SHA-256 of the plaintext. Stored in `token_hash`. */
  hash: Buffer;
}

export function mintPersonalAccessToken(): MintedToken {
  const secret = randomBytes(SECRET_BYTES).toString("base64url");
  const plaintext = `${PREFIX}${secret}`;
  return {
    plaintext,
    prefix: secret.slice(0, DISPLAY_PREFIX_LEN),
    hash: hashToken(plaintext),
  };
}

export function hashToken(plaintext: string): Buffer {
  return createHash("sha256").update(plaintext, "utf8").digest();
}

/**
 * Parse an `Authorization: Bearer …` header value. Returns the plaintext
 * token (still secret — handle with care) only if it looks structurally
 * like a Buendia PAT. Returns null otherwise so callers can decide whether
 * to fall through to a different auth scheme.
 */
export function parseBearerPat(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/.exec(header);
  if (!match) return null;
  const token = match[1]!;
  if (!token.startsWith(PREFIX)) return null;
  // Reject anything that isn't url-safe base64 of the expected length, so
  // we don't waste a DB round-trip on obvious garbage.
  const body = token.slice(PREFIX.length);
  if (!/^[A-Za-z0-9_-]{43}$/.test(body)) return null;
  return token;
}

/**
 * Constant-time hash compare. Lengths are fixed (SHA-256 = 32 bytes) so a
 * length-mismatch path never triggers on real input, but we still guard.
 */
export function hashesEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
