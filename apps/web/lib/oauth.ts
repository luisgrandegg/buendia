import { createHash, randomBytes } from "node:crypto";

/**
 * Supabase Management OAuth helpers.
 *
 * Reference: https://supabase.com/docs/guides/integrations/build-a-supabase-integration
 *
 * Flow:
 *   start    → /api/auth/supabase/start    redirects to AUTHORIZE_URL
 *   approve  → user authorises in Supabase
 *   callback → /api/auth/supabase/callback exchanges `code` for tokens
 */

export const SUPABASE_OAUTH_AUTHORIZE_URL = "https://api.supabase.com/v1/oauth/authorize";
export const SUPABASE_OAUTH_TOKEN_URL = "https://api.supabase.com/v1/oauth/token";

/**
 * The scopes Buendia needs on the user's Supabase organization. We ask only
 * for what tickets 10 and 11 need today; rotation logic (62) and disconnect
 * (52) ride on the same grant.
 */
export const SUPABASE_OAUTH_SCOPES = [
  "organizations.read",
  "projects.read",
  "projects.write",
  "secrets.read",
];

const VERIFIER_BYTES = 48;
const STATE_BYTES = 24;

export function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateCodeVerifier(): string {
  return base64UrlEncode(randomBytes(VERIFIER_BYTES));
}

export function codeChallengeFor(verifier: string): string {
  return base64UrlEncode(createHash("sha256").update(verifier).digest());
}

export function generateState(): string {
  return base64UrlEncode(randomBytes(STATE_BYTES));
}

export interface AuthorizeUrlParams {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scopes?: string[];
}

export function buildAuthorizeUrl({
  clientId,
  redirectUri,
  state,
  codeChallenge,
  scopes = SUPABASE_OAUTH_SCOPES,
}: AuthorizeUrlParams): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    scope: scopes.join(" "),
  });
  return `${SUPABASE_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

export interface TokenExchangeResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface ExchangeCodeParams {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  codeVerifier: string;
}

export async function exchangeCodeForTokens({
  code,
  clientId,
  clientSecret,
  redirectUri,
  codeVerifier,
}: ExchangeCodeParams): Promise<TokenExchangeResult> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(SUPABASE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${basic}`,
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Supabase OAuth token exchange failed (${response.status}): ${text}`);
  }

  const json = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
  };

  if (!json.access_token || !json.refresh_token) {
    throw new Error("Supabase OAuth token response missing access_token or refresh_token");
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in ?? 0,
    tokenType: json.token_type ?? "Bearer",
  };
}

/**
 * Resolve the absolute origin of the current request — needed to build the
 * `redirect_uri` so Supabase sends the user back to the same host. This must
 * match the redirect URI registered in the OAuth app exactly.
 */
export function originFromHeaders(h: Headers): string {
  const forwardedHost = h.get("x-forwarded-host");
  const host = forwardedHost ?? h.get("host");
  if (!host) {
    throw new Error("Cannot determine request host");
  }
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export function supabaseCallbackUrl(origin: string): string {
  return `${origin}/api/auth/supabase/callback`;
}

export interface RefreshAccessTokenParams {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}

/**
 * Trade a stored refresh token for a fresh access token. Supabase rotates
 * refresh tokens on every exchange, so callers must persist the new
 * `refreshToken` if the call succeeds.
 */
export async function refreshAccessToken({
  refreshToken,
  clientId,
  clientSecret,
}: RefreshAccessTokenParams): Promise<TokenExchangeResult> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(SUPABASE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${basic}`,
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Supabase OAuth refresh failed (${response.status}): ${text}`);
  }

  const json = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
  };

  if (!json.access_token) {
    throw new Error("Supabase OAuth refresh response missing access_token");
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
    expiresIn: json.expires_in ?? 0,
    tokenType: json.token_type ?? "Bearer",
  };
}
