import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import {
  buildAuthorizeUrl,
  codeChallengeFor,
  generateCodeVerifier,
  generateState,
  originFromHeaders,
  supabaseCallbackUrl,
} from "@/lib/oauth";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const OAUTH_STATE_COOKIE = "buendia_supabase_oauth";
const COOKIE_TTL_SECONDS = 10 * 60;

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = codeChallengeFor(codeVerifier);

  const origin = originFromHeaders(await headers());
  const redirectUri = supabaseCallbackUrl(origin);

  const authorizeUrl = buildAuthorizeUrl({
    clientId: env.supabaseOauthClientId,
    redirectUri,
    state,
    codeChallenge,
  });

  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, JSON.stringify({ state, codeVerifier }), {
    httpOnly: true,
    sameSite: "lax",
    secure: !origin.startsWith("http://localhost"),
    path: "/",
    maxAge: COOKIE_TTL_SECONDS,
  });

  return NextResponse.redirect(authorizeUrl, { status: 303 });
}
