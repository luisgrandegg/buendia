import { NextResponse } from "next/server";
import { authenticateApi } from "@/lib/api-auth";

/**
 * `GET /api/v1/me`
 *
 * Returns the authenticated user's id, email, and connected-backend
 * summary. Cheapest endpoint to probe with a fresh PAT to confirm wiring.
 */
export async function GET(req: Request) {
  const auth = await authenticateApi(req);
  if (!auth.ok) return auth.response;

  const { user, supabase } = auth.context;

  const { data: backend } = await supabase
    .from("owner_backends")
    .select("supabase_project_ref, connected_at, grant_status, last_validated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    id: user.id,
    email: user.email || null,
    backend: {
      connected: Boolean(backend),
      has_project: Boolean(backend?.supabase_project_ref),
      grant_status: (backend?.grant_status as string | null) ?? null,
      connected_at: backend?.connected_at ?? null,
      last_validated_at: backend?.last_validated_at ?? null,
    },
    auth: { path: auth.context.authPath },
  });
}
