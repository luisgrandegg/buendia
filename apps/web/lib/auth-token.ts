import { recordAudit } from "@buendia/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken, parseBearerPat } from "@/lib/personal-access-tokens";

/**
 * Result of resolving an `Authorization: Bearer …` PAT.
 *
 * - `ok`: the token is valid and not revoked; `userId` identifies the
 *   owning user.
 * - `null`: header is absent, malformed, or doesn't look like a PAT —
 *   the caller may fall through to a different auth scheme.
 * - everything else: a recognised PAT that failed validation. The caller
 *   should turn this into a 401 with no further detail (to avoid leaking
 *   which tokens exist).
 */
export type PatVerification =
  | { ok: true; userId: string; tokenId: string }
  | { ok: false; reason: "unknown" | "revoked" }
  | null;

/**
 * Look up a PAT from the request's Authorization header and resolve it to
 * the owning user. Side effects on success:
 *
 *   - Stamps `last_used_at = now()` on the row.
 *
 * Implementation note: we hash the plaintext with SHA-256 and look up by
 * the resulting `bytea`. The unique index on `token_hash` keeps this an
 * O(1) lookup, and a constant-time compare isn't needed at this layer —
 * we never branch on per-byte equality; the database does the match for
 * us via the unique index.
 */
export async function verifyPersonalAccessToken(headers: Headers): Promise<PatVerification> {
  const plaintext = parseBearerPat(headers.get("authorization"));
  if (!plaintext) return null;

  const hash = hashToken(plaintext);
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("personal_access_tokens")
    .select("id, user_id, revoked_at, last_used_at")
    .eq("token_hash", `\\x${hash.toString("hex")}`)
    .maybeSingle();

  if (error) {
    console.error("[buendia] pat lookup failed:", error);
    return { ok: false, reason: "unknown" };
  }
  if (!data) return { ok: false, reason: "unknown" };
  if (data.revoked_at) return { ok: false, reason: "revoked" };

  const firstUse = data.last_used_at === null;

  // Best-effort timestamp; failure here doesn't invalidate the auth.
  void admin
    .from("personal_access_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(({ error: updateErr }) => {
      if (updateErr) {
        console.error("[buendia] pat last_used_at update failed:", updateErr);
      }
    });

  if (firstUse) {
    // Emit a single audit row the first time each token is used. Per-call
    // audits would drown the log; first-use is enough signal to spot
    // unexpected activation.
    await recordAudit(admin, {
      actorId: data.user_id,
      action: "pat.used",
      metadata: { token_id: data.id },
    });
  }

  return { ok: true, userId: data.user_id, tokenId: data.id };
}
