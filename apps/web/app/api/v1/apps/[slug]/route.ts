import { NextResponse } from "next/server";
import { apiError, authenticateApi } from "@/lib/api-auth";
import { deleteApp, getAppForUser } from "@/lib/operations/apps";

/**
 * `GET /api/v1/apps/:slug` — single app metadata + collaborators.
 * `DELETE /api/v1/apps/:slug` — owner-only delete (mirror of ticket 50).
 */

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(req: Request, { params }: RouteContext) {
  const auth = await authenticateApi(req);
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth.context;

  const { slug } = await params;
  const result = await getAppForUser(supabase, user.id, slug);
  if (!result.ok) return apiError(result.error);
  return NextResponse.json(result.data);
}

export async function DELETE(req: Request, { params }: RouteContext) {
  const auth = await authenticateApi(req);
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth.context;

  const { slug } = await params;
  const result = await deleteApp(supabase, user.id, slug);
  if (!result.ok) return apiError(result.error);
  return NextResponse.json({ deleted: true, slug: result.data.slug });
}
