"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { recordAudit } from "@buendia/db";
import { env } from "@/lib/env";
import { executeSql, ManagementApiError } from "@/lib/management-api";
import { refreshAccessToken } from "@/lib/oauth";
import { getOwnerRefreshToken } from "@/lib/owner-backend";
import { buildProvisionSql, validateSchemaSql } from "@/lib/schema-provisioner";
import { createClient } from "@/lib/supabase/server";

const MAX_HTML_BYTES = 5 * 1024 * 1024; // 5 MB
const HTML_BUCKET = "app-html";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function randomSuffix(): string {
  return randomBytes(3).toString("hex");
}

function uploadOutcome(status: string, extra?: Record<string, string>): never {
  const params = new URLSearchParams({ upload: status, ...(extra ?? {}) });
  redirect(`/?${params.toString()}`);
}

export async function uploadAppAction(formData: FormData): Promise<void> {
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
  if (file.size > MAX_HTML_BYTES) {
    uploadOutcome("too_big");
  }

  const buffer = await file.arrayBuffer();
  const sniff = new TextDecoder().decode(buffer.slice(0, 512)).toLowerCase();
  if (!sniff.includes("<html") && !sniff.includes("<!doctype")) {
    uploadOutcome("not_html");
  }

  const nameInput = formData.get("name");
  const baseName =
    typeof nameInput === "string" && nameInput.trim()
      ? nameInput.trim()
      : file.name.replace(/\.html$/i, "");
  const slugBase = slugify(baseName) || "app";
  const slug = `${slugBase}-${randomSuffix()}`;
  const schemaName = `app_${slug.replace(/-/g, "_")}`;
  const storagePath = `${user.id}/${slug}/v1.html`;

  const { error: uploadError } = await supabase.storage
    .from(HTML_BUCKET)
    .upload(storagePath, buffer, { contentType: "text/html", upsert: false });
  if (uploadError) {
    console.error("[buendia] html upload failed:", uploadError);
    uploadOutcome("storage_failed");
  }

  const schemaSqlInput = formData.get("schema_sql");
  const schemaSql =
    typeof schemaSqlInput === "string" && schemaSqlInput.trim() ? schemaSqlInput : null;

  const { data: app, error: appError } = await supabase
    .from("apps")
    .insert({
      owner_id: user.id,
      slug,
      name: baseName,
      schema_name: schemaName,
      html_storage_path: storagePath,
      current_version: 1,
    })
    .select("id, slug")
    .single();

  if (appError || !app) {
    console.error("[buendia] apps insert failed:", appError);
    await safeRemove(supabase, storagePath);
    uploadOutcome("db_failed");
  }

  const { error: versionError } = await supabase.from("app_versions").insert({
    app_id: app.id,
    version: 1,
    html_storage_path: storagePath,
    schema_sql: schemaSql,
  });
  if (versionError) {
    console.error("[buendia] app_versions insert failed:", versionError);
    await supabase.from("apps").delete().eq("id", app.id);
    await safeRemove(supabase, storagePath);
    uploadOutcome("db_failed");
  }

  await recordAudit(supabase, {
    actorId: user.id,
    action: "app.created",
    targetAppId: app.id,
    metadata: { slug: app.slug, name: baseName },
  });

  uploadOutcome("ok", { slug: app.slug });
}

async function safeRemove(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string,
): Promise<void> {
  try {
    await supabase.storage.from(HTML_BUCKET).remove([path]);
  } catch (err) {
    console.error("[buendia] failed to clean up orphan html blob:", err);
  }
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
  // Prefer the app detail page if we have a slug; otherwise fall back to
  // the dashboard, which also surfaces the provision_schema banner.
  if (slug) {
    const params = new URLSearchParams({ provision_schema: status });
    redirect(`/apps/${slug}?${params.toString()}`);
  }
  const params = new URLSearchParams({ provision_schema: status });
  redirect(`/?${params.toString()}`);
}

/**
 * Take the schema_sql stored on the app's latest version, validate it,
 * and apply it to the `app_<slug>` schema in the owner's Supabase
 * project via the Management API. Stamps `schema_provisioned_at` on
 * success and emits an audit row.
 */
export async function provisionSchemaAction(formData: FormData): Promise<void> {
  const appIdRaw = formData.get("app_id");
  if (typeof appIdRaw !== "string" || !appIdRaw) {
    provisionRedirect("not_found");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) provisionRedirect("unauthenticated");

  const { data: app, error: appError } = await supabase
    .from("apps")
    .select("id, slug, schema_name, current_version, owner_id")
    .eq("id", appIdRaw)
    .maybeSingle();
  if (appError || !app || app.owner_id !== user.id) {
    provisionRedirect("not_found");
  }

  const { data: version, error: versionError } = await supabase
    .from("app_versions")
    .select("schema_sql")
    .eq("app_id", app.id)
    .eq("version", app.current_version)
    .maybeSingle();
  if (versionError || !version) {
    provisionRedirect("not_found");
  }
  const schemaSql = version.schema_sql;
  if (!schemaSql || !schemaSql.trim()) {
    provisionRedirect("no_schema", app.slug);
  }

  const validation = validateSchemaSql(schemaSql);
  if (!validation.ok) {
    console.error(`[buendia] schema validation failed for app ${app.slug}:`, validation.findings);
    provisionRedirect("schema_invalid", app.slug);
  }

  const refreshToken = await getOwnerRefreshToken(user.id);
  if (!refreshToken) provisionRedirect("not_connected");

  let access;
  try {
    access = await refreshAccessToken({
      refreshToken,
      clientId: env.supabaseOauthClientId,
      clientSecret: env.supabaseOauthClientSecret,
    });
  } catch (err) {
    console.error("[buendia] oauth refresh failed during schema provision:", err);
    provisionRedirect("oauth_refresh_failed");
  }

  const { data: backend } = await supabase
    .from("owner_backends")
    .select("supabase_project_ref")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!backend?.supabase_project_ref) provisionRedirect("not_connected");

  const sql = buildProvisionSql(app.schema_name, schemaSql);

  try {
    await executeSql(access.accessToken, backend.supabase_project_ref, sql);
  } catch (err) {
    console.error(
      `[buendia] schema provision SQL failed for app ${app.slug}:`,
      err instanceof ManagementApiError ? err.body : err,
    );
    provisionRedirect("sql_failed", app.slug);
  }

  const { error: stampError } = await supabase
    .from("apps")
    .update({
      schema_provisioned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", app.id);
  if (stampError) {
    console.error("[buendia] failed to stamp schema_provisioned_at:", stampError);
    provisionRedirect("sql_failed", app.slug);
  }

  await recordAudit(supabase, {
    actorId: user.id,
    action: "app.version.uploaded",
    targetAppId: app.id,
    metadata: { slug: app.slug, schema: app.schema_name, action: "schema_provisioned" },
  });

  provisionRedirect("ok", app.slug);
}
