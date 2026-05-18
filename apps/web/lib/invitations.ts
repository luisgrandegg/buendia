import { createHash, randomBytes } from "node:crypto";

/**
 * Generate a URL-safe random token for an invitation.
 *
 * 32 random bytes → 43-char base64url string. The plaintext is sent
 * in the invitation URL and **never** persisted; the database stores
 * only its SHA-256 hash (see {@link hashInvitationToken}). Never log.
 */
export function generateInvitationToken(): string {
  return randomBytes(32)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * SHA-256 of the plaintext token, as a 32-byte Buffer.
 *
 * Mirrors the PAT pattern from `lib/personal-access-tokens.ts`: write
 * the hash, look up by the hash, compare in constant time at the
 * unique-index layer. A DB read no longer yields a live link.
 * See SECURITY_AUDIT.md §L3.
 */
export function hashInvitationToken(plaintext: string): Buffer {
  return createHash("sha256").update(plaintext, "utf8").digest();
}

const TOKEN_TTL_DAYS = 14;

export function invitationExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function invitationUrl(origin: string, token: string): string {
  return `${origin}/invite?token=${encodeURIComponent(token)}`;
}
