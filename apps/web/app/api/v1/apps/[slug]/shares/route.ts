import { NextResponse } from "next/server";
import { apiError, authenticateApi } from "@/lib/api-auth";
import { Errors } from "@/lib/api-errors";
import { addCollaborator } from "@/lib/operations/shares";

/**
 * `POST /api/v1/apps/:slug/shares`
 *
 * Body: `{ email: string, role?: "viewer" | "editor" }`
 *
 * Returns either:
 *   - `{ kind: "share", user_id, role, previous_role }` if the email
 *     belongs to an existing Buendia account, or
 *   - `{ kind: "invitation", invitation_id, email, role, url, expires_at }`
 *     with a sharable link the caller can deliver however it likes.
 */

interface RouteContext {
  params: Promise<{ slug: string }>;
}

interface CreateShareBody {
  email?: string;
  role?: string;
}

export async function POST(req: Request, { params }: RouteContext) {
  const auth = await authenticateApi(req);
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth.context;

  let body: CreateShareBody;
  try {
    body = (await req.json()) as CreateShareBody;
  } catch {
    return apiError(Errors.badRequest("Request body must be JSON."));
  }
  if (typeof body.email !== "string" || !body.email.trim()) {
    return apiError(Errors.badRequest("`email` is required."));
  }

  const { slug } = await params;
  const origin = new URL(req.url).origin;

  const result = await addCollaborator(supabase, user.id, user.email, slug, {
    email: body.email,
    role: body.role ?? null,
    origin,
  });
  if (!result.ok) return apiError(result.error);
  return NextResponse.json(result.data, { status: 201 });
}
