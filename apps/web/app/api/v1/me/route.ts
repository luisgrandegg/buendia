import { NextResponse } from "next/server";
import { authenticateApi } from "@/lib/api-auth";

/**
 * `GET /api/v1/me`
 *
 * Returns the authenticated user's id and email, plus — for the
 * session-authenticated dashboard — a summary of the connected
 * backend. PAT-authenticated callers (e.g. the MCP server) get only
 * `{ id, email }`: backend grant_status and connection timestamps are
 * incidental dashboard surface, not API contract, and a leaked PAT
 * shouldn't disclose whether the user has provisioned a backend.
 * See SECURITY_AUDIT.md §M3.
 */
export async function GET(req: Request) {
  const auth = await authenticateApi(req);
  if (!auth.ok) return auth.response;

  const { user, supabase, authPath } = auth.context;

  if (authPath === "pat") {
    return NextResponse.json({
      id: user.id,
      email: user.email || null,
      auth: { path: authPath },
    });
  }

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
    auth: { path: authPath },
  });
}
