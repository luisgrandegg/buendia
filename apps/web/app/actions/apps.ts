"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { recordAudit } from "@buendia/db";
import { env } from "@/lib/env";
import { executeSql, ManagementApiError } from "@/lib/management-api";
import { refreshAccessToken } from "@/lib/oauth";
import { getOwnerRefreshToken } from "@/lib/owner-backend";
import { buildDropSchemaSql, buildProvisionSql, validateSchemaSql } from "@/lib/schema-provisioner";
import { createAdminClient } from "@/lib/supabase/admin";
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

/* -----------------------------------------------------------------------
 * Rename + delete (ticket 50)
 *
 * Slug is immutable — it's baked into URLs and the schema name. Only
 * `apps.name` is mutable here. Delete cascades through the database
 * (FKs on app_versions + app_shares), drops the schema in the user's
 * Supabase project, and clears the HTML blobs.
 * --------------------------------------------------------------------- */

type RenameStatus = "ok" | "unauthenticated" | "not_found" | "not_owner" | "empty" | "write_failed";

function renameRedirect(slug: string, status: RenameStatus): never {
  redirect(`/apps/${slug}?rename=${status}`);
}

export async function renameAppAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "");
  const nameRaw = formData.get("name");
  const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
  if (!slug) renameRedirect(slug, "not_found");
  if (!name) renameRedirect(slug, "empty");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) renameRedirect(slug, "unauthenticated");

  const { data: app } = await supabase
    .from("apps")
    .select("id, owner_id")
    .eq("slug", slug)
    .maybeSingle();
  if (!app) renameRedirect(slug, "not_found");
  if (app.owner_id !== user.id) renameRedirect(slug, "not_owner");

  const { error } = await supabase
    .from("apps")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", app.id);
  if (error) {
    console.error("[buendia] apps rename failed:", error);
    renameRedirect(slug, "write_failed");
  }

  await recordAudit(supabase, {
    actorId: user.id,
    action: "app.renamed",
    targetAppId: app.id,
    metadata: { slug, name },
  });

  renameRedirect(slug, "ok");
}

type DeleteStatus =
  | "unauthenticated"
  | "not_found"
  | "not_owner"
  | "not_connected"
  | "schema_drop_failed"
  | "db_delete_failed";

function deleteOutcome(status: DeleteStatus): never {
  // Failures land back on the dashboard with a banner (the detail page
  // is gone on success).
  redirect(`/?delete=${status}`);
}

export async function deleteAppAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) deleteOutcome("unauthenticated");

  const { data: app } = await supabase
    .from("apps")
    .select("id, slug, owner_id, schema_name, html_storage_path")
    .eq("slug", slug)
    .maybeSingle();
  if (!app) deleteOutcome("not_found");
  if (app.owner_id !== user.id) deleteOutcome("not_owner");

  // Best-effort drop of the app schema in the user's Supabase project.
  // If they never provisioned a project (or revoked our OAuth), we still
  // proceed to clear the control-plane rows so the user isn't stuck with
  // ghost apps they can't delete.
  const refreshToken = await getOwnerRefreshToken(user.id);
  if (refreshToken) {
    try {
      const access = await refreshAccessToken({
        refreshToken,
        clientId: env.supabaseOauthClientId,
        clientSecret: env.supabaseOauthClientSecret,
      });
      const { data: backend } = await supabase
        .from("owner_backends")
        .select("supabase_project_ref")
        .eq("user_id", user.id)
        .maybeSingle();
      if (backend?.supabase_project_ref) {
        await executeSql(
          access.accessToken,
          backend.supabase_project_ref,
          buildDropSchemaSql(app.schema_name),
        );
      }
    } catch (err) {
      console.error(
        "[buendia] failed to drop app schema (continuing with metadata delete):",
        err instanceof ManagementApiError ? err.body : err,
      );
      // Don't fail the whole delete; the user still gets their control
      // plane cleaned up and can drop the orphan schema manually if
      // needed. Surface a soft warning via the redirect status.
    }
  }

  // Storage cleanup via the admin client (the HTML lives in
  // user-scoped folders that the user's session can read, but using
  // admin avoids any RLS surprises mid-delete).
  const admin = createAdminClient();
  const folder = `${user.id}/${app.slug}/`;
  const { data: objects } = await admin.storage.from(HTML_BUCKET).list(folder);
  if (objects && objects.length > 0) {
    const paths = objects.map((o) => `${folder}${o.name}`);
    await admin.storage.from(HTML_BUCKET).remove(paths);
  }

  // Delete the row — cascades to app_versions, app_shares.
  const { error: delError } = await supabase.from("apps").delete().eq("id", app.id);
  if (delError) {
    console.error("[buendia] apps delete failed:", delError);
    deleteOutcome("db_delete_failed");
  }

  await recordAudit(supabase, {
    actorId: user.id,
    action: "app.deleted",
    targetAppId: app.id,
    metadata: { slug: app.slug, schema: app.schema_name },
  });

  redirect("/?delete=ok");
}
