import { createHmac } from "node:crypto";

/**
 * Hand-rolled HS256 JWT minter. Used by `/api/jwt/refresh` to sign tokens
 * with the *owner's* Supabase project JWT secret so the user's project
 * (PostgREST + Realtime + GoTrue) accepts them natively.
 *
 * Constitution refs:
 *   - §4 (real auth)
 *   - Architecture Invariants §JWT scope is the security boundary
 *
 * Adding a `jsonwebtoken` dependency for one HMAC sign is not worth it;
 * the spec is small and we avoid pulling in a sprawling library.
 */

export const JWT_TTL_SECONDS = 15 * 60;

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
