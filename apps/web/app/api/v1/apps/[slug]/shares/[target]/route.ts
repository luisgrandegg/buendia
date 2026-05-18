import { NextResponse } from "next/server";
import { apiError, authenticateApi } from "@/lib/api-auth";
import { cancelInvitation, removeCollaborator } from "@/lib/operations/shares";

/**
 * `DELETE /api/v1/apps/:slug/shares/:target`
 *
 * `:target` can be either:
 *   - A user id (UUID) — removes that user's `app_shares` row.
 *   - An email (contains `@`) — cancels the matching pending invitation.
 *
 * Owner-only. Mirrors the dashboard's remove + cancel-invitation actions.
 */

interface RouteContext {
  params: Promise<{ slug: string; target: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(req: Request, { params }: RouteContext) {
  const auth = await authenticateApi(req);
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth.context;

  const { slug, target } = await params;
  const decoded = decodeURIComponent(target);

  const isUuid = UUID_RE.test(decoded);
  const looksLikeEmail = decoded.includes("@");

  if (isUuid) {
    const result = await removeCollaborator(supabase, user.id, slug, decoded);
    if (!result.ok) return apiError(result.error);
    return NextResponse.json({ removed: "share", user_id: result.data.user_id });
  }
  if (looksLikeEmail) {
    const result = await cancelInvitation(supabase, user.id, slug, decoded);
    if (!result.ok) return apiError(result.error);
    return NextResponse.json({ removed: "invitation", invitation_id: result.data.invitation_id });
  }

  // Fallback: try invitation id (the dashboard's hidden field).
  const result = await cancelInvitation(supabase, user.id, slug, decoded);
  if (!result.ok) return apiError(result.error);
  return NextResponse.json({ removed: "invitation", invitation_id: result.data.invitation_id });
}
