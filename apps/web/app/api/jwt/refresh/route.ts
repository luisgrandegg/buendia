import { NextResponse } from "next/server";
import { decrypt, loadMasterKey } from "@buendia/db";
import { mintAppJwt, type AppRole, unsafeDecodeClaims, verifyAppJwt } from "@/lib/jwt-mint";
import { jwtSecretCache } from "@/lib/jwt-secret-cache";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Mint a short-lived JWT scoped to a single app, signed with the *owner's*
 * Supabase project JWT secret. Called by the SDK's background refresh.
 *
 * Auth model — see SECURITY_AUDIT.md §H4 and decisions/0014-… (TBD).
 *
 *   - Caller authenticates by presenting the *current* JWT in
 *     `Authorization: Bearer <jwt>`. We verify it against the owner's
 *     stored signing secret and re-check membership before minting a
 *     fresh JWT. No session cookie is consulted, so the route works
 *     identically whether the app is served from the dashboard origin
 *     (today) or a future cookieless sandbox origin (ticket 75).
 *   - The bearer JWT must be the same shape mintAppJwt issues
 *     (HS256, role=authenticated, aud=authenticated, iss=buendia).
 *   - A small grace window (REFRESH_GRACE_SECONDS) past `exp` is
 *     accepted so a token expiring in flight can still refresh.
 *
 * Returns:
 *   - 400 if the `app` query param is missing or doesn't match the
 *     JWT's `app_id` claim.
 *   - 401 if the Authorization header is missing or malformed.
 *   - 403 if the JWT fails signature / claim / membership checks.
 *   - 502 if the owner's backend isn't fully provisioned.
 *   - 200 `{ jwt, exp }` on success.
 *
 * The TTL is hard-capped at 15 minutes in `lib/jwt-mint.ts`. No knob.
 *
 * The decrypted owner JWT secret is cached in process (60s TTL, LRU
 * capped) so a hot refresh path doesn't AES-decrypt on every call.
 * See SECURITY_AUDIT.md §H6.
 */
export async function POST(request: Request) {
  const appId = new URL(request.url).searchParams.get("app");
  if (!appId) {
    return NextResponse.json({ error: "missing_app" }, { status: 400 });
  }

  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : null;
  if (!bearer) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Peek at the claims to find the owner whose secret signed this token.
  // We don't trust the claim yet — verifyAppJwt below validates the
  // signature, then we cross-check `app_id` against the query param.
  const peek = unsafeDecodeClaims(bearer);
  if (!peek?.app_id || peek.app_id !== appId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: app } = await admin
    .from("apps")
    .select("id, owner_id, schema_name, team_id")
    .eq("id", appId)
    .maybeSingle();
  if (!app) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let jwtSecret: string;
  try {
    jwtSecret = await jwtSecretCache.get(app.owner_id, async () => {
      const { data: backend } = await admin
        .from("owner_backends")
        .select("supabase_jwt_secret_encrypted")
        .eq("user_id", app.owner_id)
        .maybeSingle();
      if (!backend?.supabase_jwt_secret_encrypted) {
        throw new BackendNotReadyError();
      }
      const blob = bufferFromBytea(backend.supabase_jwt_secret_encrypted);
      return decrypt(blob, loadMasterKey());
    });
  } catch (err) {
    if (err instanceof BackendNotReadyError) {
      return NextResponse.json({ error: "backend_not_ready" }, { status: 502 });
    }
    console.error("[buendia] failed to decrypt owner jwt secret:", err);
    return NextResponse.json({ error: "decrypt_failed" }, { status: 500 });
  }

  const verified = verifyAppJwt({ jwt: bearer, jwtSecret });
  if (!verified.ok) {
    // Tokens signed by a different secret (owner rotated their key, or
    // the cache is stale) come back as `bad_signature`. Drop the cached
    // secret so the next attempt re-reads the row — covers the rotation
    // case without a process restart.
    if (verified.reason === "bad_signature") {
      jwtSecretCache.invalidate(app.owner_id);
    }
    return NextResponse.json({ error: "forbidden", reason: verified.reason }, { status: 403 });
  }

  // Membership recheck. The JWT's `sub` is asserting "I am user X with
  // role Y", but the user might have been removed from the share since
  // the token was minted. The view + RLS enforce this for us.
  const { data: member } = await admin
    .from("app_members")
    .select("role, schema_name, team_id")
    .eq("app_id", appId)
    .eq("user_id", verified.claims.sub)
    .maybeSingle();
  if (!member) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { jwt, exp } = mintAppJwt({
    jwtSecret,
    userId: verified.claims.sub,
    appId,
    appSchema: member.schema_name,
    teamId: member.team_id,
    role: member.role as AppRole,
  });

  return NextResponse.json({ jwt, exp });
}

class BackendNotReadyError extends Error {
  constructor() {
    super("backend_not_ready");
    this.name = "BackendNotReadyError";
  }
}

function bufferFromBytea(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") {
    return value.startsWith("\\x")
      ? Buffer.from(value.slice(2), "hex")
      : Buffer.from(value, "base64");
  }
  throw new Error(`Unexpected bytea representation: ${typeof value}`);
}
