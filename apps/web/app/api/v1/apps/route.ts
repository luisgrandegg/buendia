import { NextResponse } from "next/server";
import { apiError, authenticateApi } from "@/lib/api-auth";
import { Errors } from "@/lib/api-errors";
import { listAppsForUser, uploadApp } from "@/lib/operations/apps";

/**
 * `GET /api/v1/apps` — apps owned + apps shared with the caller.
 *
 * `POST /api/v1/apps` — create a new app from a JSON body
 *   `{ html: string, name?: string, schema_sql?: string, filename?: string }`
 *
 *   We accept the HTML as a base64-encoded string OR a raw UTF-8 string
 *   so multipart isn't a hard requirement for scripted callers. Most
 *   apps will be small enough that either is fine.
 */

export async function GET(req: Request) {
  const auth = await authenticateApi(req);
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth.context;

  const result = await listAppsForUser(supabase, user.id);
  if (!result.ok) return apiError(result.error);
  return NextResponse.json(result.data);
}

interface CreateAppBody {
  html?: string;
  html_base64?: string;
  name?: string;
  filename?: string;
  schema_sql?: string;
}

export async function POST(req: Request) {
  const auth = await authenticateApi(req);
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth.context;

  let body: CreateAppBody;
  try {
    body = (await req.json()) as CreateAppBody;
  } catch {
    return apiError(Errors.badRequest("Request body must be JSON."));
  }

  let html: Buffer;
  if (typeof body.html_base64 === "string" && body.html_base64) {
    try {
      html = Buffer.from(body.html_base64, "base64");
    } catch {
      return apiError(Errors.badRequest("`html_base64` is not valid base64."));
    }
  } else if (typeof body.html === "string" && body.html) {
    html = Buffer.from(body.html, "utf8");
  } else {
    return apiError(Errors.badRequest("Provide `html` or `html_base64`."));
  }

  const result = await uploadApp(supabase, user.id, {
    name: body.name,
    filename: body.filename,
    html,
    schemaSql: typeof body.schema_sql === "string" ? body.schema_sql : null,
  });
  if (!result.ok) return apiError(result.error);

  const origin = new URL(req.url).origin;
  return NextResponse.json(
    {
      id: result.data.id,
      slug: result.data.slug,
      name: result.data.name,
      url: `${origin}/a/${result.data.slug}`,
    },
    { status: 201 },
  );
}
