import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Hand-rolled HS256 JWT minter + verifier. Used by `/api/jwt/refresh`
 * to sign tokens with the *owner's* Supabase project JWT secret so the
 * user's project (PostgREST + Realtime + GoTrue) accepts them natively.
 *
 * Constitution refs:
 *   - §4 (real auth)
 *   - Architecture Invariants §JWT scope is the security boundary
 *
 * Adding a `jsonwebtoken` dependency for one HMAC sign is not worth it;
 * the spec is small and we avoid pulling in a sprawling library.
 */

export const JWT_TTL_SECONDS = 15 * 60;

/**
 * How far past `exp` we still accept a JWT on the refresh path. Lets the
 * SDK's background refresh recover from a sleeping tab without a hard
 * sign-out cliff; long enough for a normal network blip, short enough
 * that a revoked session is observably broken. See SECURITY_AUDIT.md §H4.
 */
export const REFRESH_GRACE_SECONDS = 60;

export type AppRole = "owner" | "editor" | "viewer";

export interface BuendiaJwtClaims {
  /** Buendia user id; surfaces as `auth.uid()` in the project. */
  sub: string;
  /** PostgREST role — `authenticated` to clear RLS, never `service_role`. */
  role: "authenticated";
  /** Required by Supabase Auth tokens. */
  aud: "authenticated";
  /** Required by Supabase Auth tokens. */
  iss: "buendia";

  app_id: string;
  app_schema: string;
  team_id: string;
  buendia_role: AppRole;

  iat: number;
  exp: number;
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export interface MintParams {
  jwtSecret: string;
  userId: string;
  appId: string;
  appSchema: string;
  teamId: string;
  role: AppRole;
  /** Seconds since epoch. Defaults to `Date.now() / 1000`. */
  now?: number;
}

export interface MintedJwt {
  jwt: string;
  exp: number;
}

export function mintAppJwt({
  jwtSecret,
  userId,
  appId,
  appSchema,
  teamId,
  role,
  now,
}: MintParams): MintedJwt {
  if (!jwtSecret) {
    throw new Error("mintAppJwt requires a non-empty jwtSecret");
  }

  const iat = Math.floor(now ?? Date.now() / 1000);
  const exp = iat + JWT_TTL_SECONDS;

  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));

  const claims: BuendiaJwtClaims = {
    sub: userId,
    role: "authenticated",
    aud: "authenticated",
    iss: "buendia",
    app_id: appId,
    app_schema: appSchema,
    team_id: teamId,
    buendia_role: role,
    iat,
    exp,
  };

  const payload = base64UrlEncode(JSON.stringify(claims));
  const signingInput = `${header}.${payload}`;
  const signature = base64UrlEncode(createHmac("sha256", jwtSecret).update(signingInput).digest());

  return { jwt: `${signingInput}.${signature}`, exp };
}

/**
 * Decode a Buendia JWT's claims *without* verifying the signature. The
 * refresh route uses this to peek at `app_id` so it can look up which
 * owner secret to verify the JWT against. Never trust a decoded-only
 * claim for authorization decisions — always pair with {@link verifyAppJwt}.
 */
export function unsafeDecodeClaims(jwt: string): Partial<BuendiaJwtClaims> | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(base64UrlDecode(parts[1]!).toString("utf8")) as Partial<BuendiaJwtClaims>;
  } catch {
    return null;
  }
}

export type VerifyResult =
  | { ok: true; claims: BuendiaJwtClaims }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "wrong_alg" };

export interface VerifyParams {
  jwt: string;
  jwtSecret: string;
  /** Seconds since epoch. Defaults to `Date.now() / 1000`. */
  now?: number;
  /**
   * Allow tokens this many seconds past `exp` (refresh grace).
   * Defaults to {@link REFRESH_GRACE_SECONDS}.
   */
  graceSeconds?: number;
}

/**
 * Verify an HS256 JWT minted by {@link mintAppJwt}. Constant-time
 * signature compare; explicit `alg` check (no `"none"`-alg downgrades);
 * `exp` enforcement with a small grace window so the refresh route can
 * accept a token that's just-now expired in flight.
 */
export function verifyAppJwt({ jwt, jwtSecret, now, graceSeconds }: VerifyParams): VerifyResult {
  if (!jwtSecret) return { ok: false, reason: "malformed" };
  const parts = jwt.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  let header: { alg?: string; typ?: string };
  let claims: Partial<BuendiaJwtClaims>;
  try {
    header = JSON.parse(base64UrlDecode(headerB64).toString("utf8")) as {
      alg?: string;
      typ?: string;
    };
    claims = JSON.parse(base64UrlDecode(payloadB64).toString("utf8")) as Partial<BuendiaJwtClaims>;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (header.alg !== "HS256") {
    // Explicit guard against "none"-alg downgrades and confused-algorithm
    // tricks. Only HS256 ever leaves mintAppJwt.
    return { ok: false, reason: "wrong_alg" };
  }

  const expectedSig = createHmac("sha256", jwtSecret).update(`${headerB64}.${payloadB64}`).digest();
  const actualSig = base64UrlDecode(sigB64);
  if (actualSig.length !== expectedSig.length || !timingSafeEqual(actualSig, expectedSig)) {
    return { ok: false, reason: "bad_signature" };
  }

  const nowSec = Math.floor(now ?? Date.now() / 1000);
  const grace = graceSeconds ?? REFRESH_GRACE_SECONDS;
  if (typeof claims.exp !== "number" || nowSec > claims.exp + grace) {
    return { ok: false, reason: "expired" };
  }

  // Required claims: sub, app_id, app_schema, team_id, buendia_role.
  if (
    typeof claims.sub !== "string" ||
    typeof claims.app_id !== "string" ||
    typeof claims.app_schema !== "string" ||
    typeof claims.team_id !== "string" ||
    typeof claims.buendia_role !== "string" ||
    typeof claims.iat !== "number"
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (
    claims.role !== "authenticated" ||
    claims.aud !== "authenticated" ||
    claims.iss !== "buendia"
  ) {
    return { ok: false, reason: "malformed" };
  }

  return { ok: true, claims: claims as BuendiaJwtClaims };
}
