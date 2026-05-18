import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyPersonalAccessToken } from "@/lib/auth-token";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Shared authentication for `/api/v1/*`.
 *
 * Accepts either:
 *   - The browser's Supabase session cookie (same path the dashboard
 *     uses), or
 *   - `Authorization: Bearer buendia_pat_...` — a personal access token
 *     from ticket 70.
 *
 * Both paths resolve to the same `{ user, supabase }` shape, where
 * `supabase` is the control-plane admin client. Operations downstream
 * MUST filter by `user.id` explicitly — they cannot rely on RLS as the
 * security boundary, since the admin client bypasses it. The dashboard
 * already follows this pattern (every action does an explicit `owner_id
 * === user.id` check), so the operation layer just makes that contract
 * mandatory.
 *
 * Why use admin even for the cookie path? So a single operation function
 * works for both transports without taking two different clients. The
 * cookie-path tradeoff is losing RLS as defence-in-depth — acceptable
 * given how thoroughly the existing actions already check ownership.
 */

export interface ApiAuthContext {
  user: { id: string; email: string };
  supabase: SupabaseClient;
  /** Which auth path the request came through. Useful for audit metadata. */
  authPath: "session" | "pat";
  /** PAT row id when `authPath === "pat"`, otherwise undefined. */
  tokenId?: string;
}

export type ApiAuthResult =
  | { ok: true; context: ApiAuthContext }
  | { ok: false; response: NextResponse };

function unauthorized(reason: string): { ok: false; response: NextResponse } {
  return {
    ok: false,
    response: NextResponse.json(
      { error: "unauthenticated", message: reason },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="buendia"' } },
    ),
  };
}

export async function authenticateApi(req: Request): Promise<ApiAuthResult> {
  // PAT auth first — explicit bearer header overrides any drive-by session
  // cookie. This matters for tooling that happens to share a browser
  // session with the user but wants to act through a scoped, revocable
  // token.
  if (req.headers.get("authorization")) {
    const verification = await verifyPersonalAccessToken(req.headers);
    if (verification === null) {
      // Header was present but didn't look like a Buendia PAT. Don't fall
      // through to cookie auth — the caller explicitly tried to assert an
      // identity and got it wrong.
      return unauthorized("Authorization header is not a valid Buendia token.");
    }
    if (!verification.ok) {
      return unauthorized(
        verification.reason === "revoked" ? "Token has been revoked." : "Token not recognized.",
      );
    }

    const admin = createAdminClient();
    const { data: userRow, error } = await admin
      .from("users")
      .select("id, email")
      .eq("id", verification.userId)
      .maybeSingle();
    if (error || !userRow) {
      console.error("[buendia] pat user lookup failed:", error);
      return unauthorized("Token owner not found.");
    }

    return {
      ok: true,
      context: {
        user: { id: userRow.id, email: userRow.email ?? "" },
        supabase: admin,
        authPath: "pat",
        tokenId: verification.tokenId,
      },
    };
  }

  // Cookie path — the dashboard's normal session.
  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) {
    return unauthorized("No session cookie or Authorization header.");
  }
  return {
    ok: true,
    context: {
      user: { id: user.id, email: user.email ?? "" },
      supabase: createAdminClient(),
      authPath: "session",
    },
  };
}

/** Build a JSON error response from an `OpError`. */
export function apiError(error: {
  code: string;
  message: string;
  status: number;
  details?: unknown;
}): NextResponse {
  const body: Record<string, unknown> = { error: error.code, message: error.message };
  if (error.details) body.details = error.details;
  return NextResponse.json(body, { status: error.status });
}
