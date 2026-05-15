import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { recordAudit } from "@buendia/db";
import { env } from "@/lib/env";
import { exchangeCodeForTokens, originFromHeaders, supabaseCallbackUrl } from "@/lib/oauth";
import { persistOauthRefreshToken } from "@/lib/owner-backend";
import { createClient } from "@/lib/supabase/server";
import { OAUTH_STATE_COOKIE } from "../start/route";

function settingsRedirect(origin: string, status: "ok" | "denied" | "error"): NextResponse {
  const url = new URL("/settings", origin);
  url.searchParams.set("supabase", status);
  return NextResponse.redirect(url, { status: 303 });
}

export async function GET(request: Request) {
  const origin = originFromHeaders(await headers());
  const url = new URL(request.url);

  const errorParam = url.searchParams.get("error");
  if (errorParam) {
    // User denied or Supabase returned an error.
    return settingsRedirect(origin, errorParam === "access_denied" ? "denied" : "error");
  }

  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  if (!code || !stateParam) {
    return settingsRedirect(origin, "error");
  }

  const cookieStore = await cookies();
  const raw = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(OAUTH_STATE_COOKIE);
  if (!raw) {
    return settingsRedirect(origin, "error");
  }

  let stored: { state: string; codeVerifier: string };
  try {
    stored = JSON.parse(raw) as { state: string; codeVerifier: string };
  } catch {
    return settingsRedirect(origin, "error");
  }

  if (stored.state !== stateParam) {
    return settingsRedirect(origin, "error");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return settingsRedirect(origin, "error");
  }

  let tokens;
  try {
    tokens = await exchangeCodeForTokens({
      code,
      clientId: env.supabaseOauthClientId,
      clientSecret: env.supabaseOauthClientSecret,
      redirectUri: supabaseCallbackUrl(origin),
      codeVerifier: stored.codeVerifier,
    });
  } catch (err) {
    console.error("[buendia] supabase oauth token exchange failed:", err);
    return settingsRedirect(origin, "error");
  }

  const persistResult = await persistOauthRefreshToken(user.id, tokens.refreshToken);
  if (persistResult.error) {
    console.error("[buendia] failed to persist supabase refresh token:", persistResult.error);
    return settingsRedirect(origin, "error");
  }

  await recordAudit(supabase, { actorId: user.id, action: "backend.connected" });

  return settingsRedirect(origin, "ok");
}
