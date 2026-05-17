import { randomBytes } from "node:crypto";

/**
 * Generate a URL-safe random token for an invitation.
 *
 * 32 random bytes → 43-char base64url string. Stored verbatim on the
 * invitations table. Never logged.
 */
export function generateInvitationToken(): string {
  return randomBytes(32)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const TOKEN_TTL_DAYS = 14;

export function invitationExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function invitationUrl(origin: string, token: string): string {
  return `${origin}/invite?token=${encodeURIComponent(token)}`;
}
