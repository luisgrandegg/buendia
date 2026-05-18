import { NextResponse } from "next/server";
import { apiError, authenticateApi } from "@/lib/api-auth";
import { provisionAppSchema } from "@/lib/operations/apps";

/**
 * `POST /api/v1/apps/:slug/provision`
 *
 * Re-runs the ticket-21 schema provisioner against the current
 * version's stored `schema_sql`. Owner-only.
 */

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function POST(req: Request, { params }: RouteContext) {
  const auth = await authenticateApi(req);
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth.context;

  const { slug } = await params;
  const result = await provisionAppSchema(supabase, user.id, slug);
  if (!result.ok) return apiError(result.error);
  return NextResponse.json({
    provisioned: true,
    slug: result.data.slug,
    schema: result.data.schema,
  });
}
