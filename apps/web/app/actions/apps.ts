"use server";

import { redirect } from "next/navigation";
import { assertSameOrigin } from "@/lib/assert-origin";
import { deleteApp, provisionAppSchema, renameApp, uploadApp } from "@/lib/operations/apps";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Thin form-action wrappers around `lib/operations/apps`. Each one
 * resolves the caller from the Supabase session cookie, calls the
 * shared operation, and translates the discriminated-union result into
 * a redirect that the dashboard's banner-driven UX can render.
 *
 * The HTTP API (`/api/v1/apps/*`) calls the same operation functions
 * and just renders JSON instead — see decisions/0012-http-api-v1.md.
 */

function uploadOutcome(status: string, extra?: Record<string, string>): never {
  const params = new URLSearchParams({ upload: status, ...(extra ?? {}) });
  redirect(`/?${params.toString()}`);
}

/**
 * Map an OpError code to the dashboard's upload-flow status string. Codes
 * the operation doesn't emit fall through to a generic bucket.
 */
function uploadStatusFor(code: string, message: string): string {
  if (code === "bad_request") {
    if (message.includes("HTML body is empty")) return "missing_file";
    if (message.includes("smaller than")) return "too_big";
    if (message.includes("HTML document")) return "not_html";
  }
  if (code === "upstream_failed") return "storage_failed";
  return "db_failed";
}

export async function uploadAppAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/signin");
  }

  const file = formData.get("html");
  if (!(file instanceof File) || file.size === 0) {
    uploadOutcome("missing_file");
  }
  if (!file.name.toLowerCase().endsWith(".html")) {
    uploadOutcome("not_html");
  }

  const nameInput = formData.get("name");
  const name = typeof nameInput === "string" && nameInput.trim() ? nameInput.trim() : undefined;
  const schemaSqlInput = formData.get("schema_sql");
  const schemaSql =
    typeof schemaSqlInput === "string" && schemaSqlInput.trim() ? schemaSqlInput : null;

  const html = await file.arrayBuffer();

  const result = await uploadApp(createAdminClient(), user.id, {
    name,
    filename: file.name,
    html,
    schemaSql,
  });

  if (!result.ok) {
    uploadOutcome(uploadStatusFor(result.error.code, result.error.message));
  }
  uploadOutcome("ok", { slug: result.data.slug });
}

type ProvisionStatus =
  | "ok"
  | "unauthenticated"
  | "not_found"
  | "not_connected"
  | "no_schema"
  | "schema_invalid"
  | "oauth_refresh_failed"
  | "sql_failed";

function provisionRedirect(status: ProvisionStatus, slug?: string): never {
  const params = new URLSearchParams({ provision_schema: status });
  redirect(slug ? `/apps/${slug}?${params.toString()}` : `/?${params.toString()}`);
}

function provisionStatusFor(code: string, message: string): ProvisionStatus {
  if (code === "not_found") return "not_found";
  if (code === "forbidden") return "not_found";
  if (code === "bad_request") {
    if (message.includes("Connect Supabase")) return "not_connected";
    if (message.includes("Provision your Supabase")) return "not_connected";
    if (message.includes("schema.sql failed safety")) return "schema_invalid";
    if (message.includes("doesn't include a schema.sql")) return "no_schema";
  }
  if (code === "upstream_failed") {
    if (message.includes("OAuth grant")) return "oauth_refresh_failed";
    return "sql_failed";
  }
  return "sql_failed";
}

export async function provisionSchemaAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const appIdRaw = formData.get("app_id");
  if (typeof appIdRaw !== "string" || !appIdRaw) {
    provisionRedirect("not_found");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) provisionRedirect("unauthenticated");

  const admin = createAdminClient();
  const { data: app } = await admin
    .from("apps")
    .select("slug, owner_id")
    .eq("id", appIdRaw)
    .maybeSingle();
  if (!app) provisionRedirect("not_found");
  if (app.owner_id !== user.id) provisionRedirect("not_found");

  const result = await provisionAppSchema(admin, user.id, app.slug);
  if (!result.ok) {
    provisionRedirect(provisionStatusFor(result.error.code, result.error.message), app.slug);
  }
  provisionRedirect("ok", app.slug);
}

type RenameStatus = "ok" | "unauthenticated" | "not_found" | "not_owner" | "empty" | "write_failed";

function renameRedirect(slug: string, status: RenameStatus): never {
  redirect(`/apps/${slug}?rename=${status}`);
}

export async function renameAppAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const slug = String(formData.get("slug") ?? "");
  const nameRaw = formData.get("name");
  const name = typeof nameRaw === "string" ? nameRaw : "";
  if (!slug) renameRedirect(slug, "not_found");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) renameRedirect(slug, "unauthenticated");

  const result = await renameApp(createAdminClient(), user.id, slug, name);
  if (!result.ok) {
    const status: RenameStatus =
      result.error.code === "not_found"
        ? "not_found"
        : result.error.code === "forbidden"
          ? "not_owner"
          : result.error.code === "bad_request"
            ? "empty"
            : "write_failed";
    renameRedirect(slug, status);
  }
  renameRedirect(slug, "ok");
}

type DeleteStatus =
  | "ok"
  | "unauthenticated"
  | "not_found"
  | "not_owner"
  | "not_connected"
  | "schema_drop_failed"
  | "db_delete_failed";

function deleteOutcome(status: DeleteStatus): never {
  redirect(`/?delete=${status}`);
}

export async function deleteAppAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const slug = String(formData.get("slug") ?? "");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) deleteOutcome("unauthenticated");

  const result = await deleteApp(createAdminClient(), user.id, slug);
  if (!result.ok) {
    const status: DeleteStatus =
      result.error.code === "not_found"
        ? "not_found"
        : result.error.code === "forbidden"
          ? "not_owner"
          : "db_delete_failed";
    deleteOutcome(status);
  }
  deleteOutcome("ok");
}
