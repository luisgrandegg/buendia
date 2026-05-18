import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAudit, decrypt, loadMasterKey } from "@buendia/db";
import { env } from "@/lib/env";
import { Errors, fail, ok, type OpResult } from "@/lib/api-errors";
import { executeSql, ManagementApiError } from "@/lib/management-api";
import { refreshAccessToken } from "@/lib/oauth";
import { buildDropSchemaSql, buildProvisionSql, validateSchemaSql } from "@/lib/schema-provisioner";

/**
 * Business-logic functions for the `apps` resource. Both the dashboard's
 * server actions and the `/api/v1/apps/*` HTTP handlers route through
 * here, so the audit trail and behaviour are transport-agnostic.
 *
 * Contract: every function takes an admin Supabase client + an explicit
 * `userId`. Operations MUST filter by `userId` themselves; RLS is not
 * the security boundary here.
 */

const MAX_HTML_BYTES = 5 * 1024 * 1024;
const HTML_BUCKET = "app-html";

const HTML_BUCKET_NAME = HTML_BUCKET;
export { HTML_BUCKET_NAME as APP_HTML_BUCKET };

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

async function safeRemove(supabase: SupabaseClient, path: string): Promise<void> {
  try {
    await supabase.storage.from(HTML_BUCKET).remove([path]);
  } catch (err) {
    console.error("[buendia] failed to clean up orphan html blob:", err);
  }
}

function bufferFromBytea(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") {
    return value.startsWith("\\x")
      ? Buffer.from(value.slice(2), "hex")
      : Buffer.from(value, "base64");
  }
  throw new Error(`Unexpected bytea representation: ${typeof value}`);
}

async function refreshTokenFor(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("owner_backends")
    .select("supabase_oauth_refresh_token_encrypted")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data?.supabase_oauth_refresh_token_encrypted) return null;
  const blob = bufferFromBytea(data.supabase_oauth_refresh_token_encrypted);
  return decrypt(blob, loadMasterKey());
}

/* ----------------------------------------------------------------------
 * Upload
 * -------------------------------------------------------------------- */

export interface UploadAppInput {
  /** Optional display name; defaults to the file name minus `.html`. */
  name?: string;
  /** Raw HTML bytes. */
  html: ArrayBuffer | Uint8Array | Buffer;
  /** Hint used when no `name` is supplied (typically the original filename). */
  filename?: string;
  /** Optional `schema.sql` body to provision against the user's project later. */
  schemaSql?: string | null;
}

export interface UploadedApp {
  id: string;
  slug: string;
  name: string;
}

export async function uploadApp(
  supabase: SupabaseClient,
  userId: string,
  input: UploadAppInput,
): Promise<OpResult<UploadedApp>> {
  const buffer =
    input.html instanceof Buffer
      ? input.html
      : input.html instanceof Uint8Array
        ? Buffer.from(input.html)
        : Buffer.from(new Uint8Array(input.html));
  if (buffer.byteLength === 0) {
    return fail(Errors.badRequest("HTML body is empty."));
  }
  if (buffer.byteLength > MAX_HTML_BYTES) {
    return fail(
      Errors.badRequest(`HTML must be smaller than ${MAX_HTML_BYTES} bytes.`, {
        max_bytes: MAX_HTML_BYTES,
      }),
    );
  }
  const sniff = buffer.subarray(0, 512).toString("utf8").toLowerCase();
  if (!sniff.includes("<html") && !sniff.includes("<!doctype")) {
    return fail(Errors.badRequest("Body doesn't look like an HTML document."));
  }

  const baseName =
    (input.name && input.name.trim()) ||
    (input.filename && input.filename.replace(/\.html$/i, "")) ||
    "app";
  const slugBase = slugify(baseName) || "app";
  const slug = `${slugBase}-${randomSuffix()}`;
  const schemaName = `app_${slug.replace(/-/g, "_")}`;
  const storagePath = `${userId}/${slug}/v1.html`;

  const { error: uploadError } = await supabase.storage
    .from(HTML_BUCKET)
    .upload(storagePath, buffer, { contentType: "text/html", upsert: false });
  if (uploadError) {
    console.error("[buendia] html upload failed:", uploadError);
    return fail(Errors.upstream("Couldn't store the HTML blob."));
  }

  const schemaSql =
    typeof input.schemaSql === "string" && input.schemaSql.trim() ? input.schemaSql : null;

  const { data: app, error: appError } = await supabase
    .from("apps")
    .insert({
      owner_id: userId,
      slug,
      name: baseName,
      schema_name: schemaName,
      html_storage_path: storagePath,
      current_version: 1,
    })
    .select("id, slug, name")
    .single();

  if (appError || !app) {
    console.error("[buendia] apps insert failed:", appError);
    await safeRemove(supabase, storagePath);
    return fail(Errors.internal("Couldn't register the app."));
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
    return fail(Errors.internal("Couldn't register the app version."));
  }

  await recordAudit(supabase, {
    actorId: userId,
    action: "app.created",
    targetAppId: app.id,
    metadata: { slug: app.slug, name: app.name },
  });

  return ok({ id: app.id, slug: app.slug, name: app.name });
}

/* ----------------------------------------------------------------------
 * List + read
 * -------------------------------------------------------------------- */

export interface AppSummary {
  id: string;
  slug: string;
  name: string;
  role: "owner" | "editor" | "viewer";
  created_at: string | null;
  updated_at: string | null;
  schema_provisioned_at: string | null;
}

export async function listAppsForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<OpResult<{ owned: AppSummary[]; shared: AppSummary[] }>> {
  const { data: owned, error: ownedError } = await supabase
    .from("apps")
    .select("id, slug, name, created_at, updated_at, schema_provisioned_at")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });
  if (ownedError) {
    console.error("[buendia] list owned apps failed:", ownedError);
    return fail(Errors.internal("Couldn't read your apps."));
  }

  // Shared apps via app_members (excludes the user's own apps).
  const { data: sharedRows, error: sharedError } = await supabase
    .from("app_members")
    .select("app_id, slug, name, role")
    .eq("user_id", userId)
    .neq("role", "owner");
  if (sharedError) {
    console.error("[buendia] list shared apps failed:", sharedError);
    return fail(Errors.internal("Couldn't read shared apps."));
  }

  // The view doesn't include timestamps; reuse what we have, leave nulls
  // where we don't (good enough for the list response — the detail
  // endpoint joins back to apps for the full record).
  const shared: AppSummary[] = (sharedRows ?? []).map((row) => ({
    id: row.app_id,
    slug: row.slug,
    name: row.name,
    role: row.role as AppSummary["role"],
    created_at: null,
    updated_at: null,
    schema_provisioned_at: null,
  }));

  return ok({
    owned: (owned ?? []).map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      role: "owner" as const,
      created_at: row.created_at,
      updated_at: row.updated_at,
      schema_provisioned_at: row.schema_provisioned_at,
    })),
    shared,
  });
}

export interface AppDetail extends AppSummary {
  schema_name: string;
  current_version: number;
  collaborators: Array<{
    user_id: string;
    email: string | null;
    role: "owner" | "editor" | "viewer";
  }>;
  pending_invitations: Array<{
    id: string;
    email: string;
    role: "editor" | "viewer";
    expires_at: string;
  }>;
}

export async function getAppForUser(
  supabase: SupabaseClient,
  userId: string,
  slug: string,
): Promise<OpResult<AppDetail>> {
  const { data: app, error } = await supabase
    .from("apps")
    .select(
      "id, slug, name, schema_name, current_version, owner_id, created_at, updated_at, schema_provisioned_at",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    console.error("[buendia] apps lookup failed:", error);
    return fail(Errors.internal("Couldn't read the app."));
  }
  if (!app) return fail(Errors.notFound("App not found."));

  let role: AppDetail["role"];
  if (app.owner_id === userId) {
    role = "owner";
  } else {
    const { data: share } = await supabase
      .from("app_shares")
      .select("role")
      .eq("app_id", app.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!share) return fail(Errors.forbidden("You don't have access to that app."));
    role = share.role as AppDetail["role"];
  }

  const { data: shareRows } = await supabase
    .from("app_shares")
    .select("user_id, role, users:user_id ( email )")
    .eq("app_id", app.id);

  const collaborators: AppDetail["collaborators"] = [
    {
      user_id: app.owner_id,
      email: null,
      role: "owner",
    },
  ];
  for (const row of shareRows ?? []) {
    const userRel = row.users as { email?: string | null } | { email?: string | null }[] | null;
    const email = Array.isArray(userRel) ? (userRel[0]?.email ?? null) : (userRel?.email ?? null);
    collaborators.push({
      user_id: row.user_id,
      email,
      role: row.role as AppDetail["collaborators"][number]["role"],
    });
  }

  // Owner email — admin-level lookup since the owner's own RLS-visible
  // users row is fine but a shared-with user wouldn't see it.
  if (role === "owner") {
    collaborators[0]!.email = null;
  } else {
    const { data: ownerRow } = await supabase
      .from("users")
      .select("email")
      .eq("id", app.owner_id)
      .maybeSingle();
    if (ownerRow) collaborators[0]!.email = ownerRow.email ?? null;
  }

  const { data: pending } =
    role === "owner"
      ? await supabase
          .from("invitations")
          .select("id, email, role, expires_at")
          .eq("app_id", app.id)
      : { data: [] };

  return ok({
    id: app.id,
    slug: app.slug,
    name: app.name,
    role,
    created_at: app.created_at,
    updated_at: app.updated_at,
    schema_provisioned_at: app.schema_provisioned_at,
    schema_name: app.schema_name,
    current_version: app.current_version,
    collaborators,
    pending_invitations: (pending ?? []).map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role as "editor" | "viewer",
      expires_at: row.expires_at,
    })),
  });
}

/* ----------------------------------------------------------------------
 * Rename
 * -------------------------------------------------------------------- */

export async function renameApp(
  supabase: SupabaseClient,
  userId: string,
  slug: string,
  name: string,
): Promise<OpResult<{ slug: string; name: string }>> {
  const trimmed = name.trim();
  if (!trimmed) return fail(Errors.badRequest("Name is required."));

  const { data: app } = await supabase
    .from("apps")
    .select("id, owner_id")
    .eq("slug", slug)
    .maybeSingle();
  if (!app) return fail(Errors.notFound("App not found."));
  if (app.owner_id !== userId) return fail(Errors.forbidden("Only the owner can rename an app."));

  const { error } = await supabase
    .from("apps")
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq("id", app.id);
  if (error) {
    console.error("[buendia] apps rename failed:", error);
    return fail(Errors.internal("Couldn't rename the app."));
  }

  await recordAudit(supabase, {
    actorId: userId,
    action: "app.renamed",
    targetAppId: app.id,
    metadata: { slug, name: trimmed },
  });

  return ok({ slug, name: trimmed });
}

/* ----------------------------------------------------------------------
 * Delete
 * -------------------------------------------------------------------- */

export async function deleteApp(
  supabase: SupabaseClient,
  userId: string,
  slug: string,
): Promise<OpResult<{ slug: string }>> {
  const { data: app } = await supabase
    .from("apps")
    .select("id, slug, owner_id, schema_name, html_storage_path")
    .eq("slug", slug)
    .maybeSingle();
  if (!app) return fail(Errors.notFound("App not found."));
  if (app.owner_id !== userId) return fail(Errors.forbidden("Only the owner can delete an app."));

  // Best-effort drop of the user-side schema. If they revoked OAuth or
  // never provisioned a project, we still proceed to clear the
  // control-plane rows.
  const refreshToken = await refreshTokenFor(supabase, userId);
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
        .eq("user_id", userId)
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
    }
  }

  // Storage cleanup — the user's folder may have multiple versions.
  const folder = `${userId}/${app.slug}/`;
  const { data: objects } = await supabase.storage.from(HTML_BUCKET).list(folder);
  if (objects && objects.length > 0) {
    const paths = objects.map((o) => `${folder}${o.name}`);
    await supabase.storage.from(HTML_BUCKET).remove(paths);
  }

  const { error: delError } = await supabase.from("apps").delete().eq("id", app.id);
  if (delError) {
    console.error("[buendia] apps delete failed:", delError);
    return fail(Errors.internal("Couldn't delete the app."));
  }

  await recordAudit(supabase, {
    actorId: userId,
    action: "app.deleted",
    targetAppId: app.id,
    metadata: { slug: app.slug, schema: app.schema_name },
  });

  return ok({ slug: app.slug });
}

/* ----------------------------------------------------------------------
 * Provision schema
 * -------------------------------------------------------------------- */

export async function provisionAppSchema(
  supabase: SupabaseClient,
  userId: string,
  slug: string,
): Promise<OpResult<{ slug: string; schema: string }>> {
  const { data: app } = await supabase
    .from("apps")
    .select("id, slug, schema_name, current_version, owner_id")
    .eq("slug", slug)
    .maybeSingle();
  if (!app) return fail(Errors.notFound("App not found."));
  if (app.owner_id !== userId)
    return fail(Errors.forbidden("Only the owner can provision an app's schema."));

  const { data: version } = await supabase
    .from("app_versions")
    .select("schema_sql")
    .eq("app_id", app.id)
    .eq("version", app.current_version)
    .maybeSingle();
  if (!version) return fail(Errors.notFound("Current app version is missing."));
  if (!version.schema_sql || !version.schema_sql.trim()) {
    return fail(Errors.badRequest("This version doesn't include a schema.sql."));
  }

  const validation = validateSchemaSql(version.schema_sql);
  if (!validation.ok) {
    console.error(`[buendia] schema validation failed for app ${app.slug}:`, validation.findings);
    return fail(
      Errors.badRequest("schema.sql failed safety checks.", { findings: validation.findings }),
    );
  }

  const refreshToken = await refreshTokenFor(supabase, userId);
  if (!refreshToken) {
    return fail(Errors.badRequest("Connect Supabase first.", { reason: "not_connected" }));
  }

  let access;
  try {
    access = await refreshAccessToken({
      refreshToken,
      clientId: env.supabaseOauthClientId,
      clientSecret: env.supabaseOauthClientSecret,
    });
  } catch (err) {
    console.error("[buendia] oauth refresh failed during schema provision:", err);
    return fail(Errors.upstream("Supabase refused the stored OAuth grant."));
  }

  const { data: backend } = await supabase
    .from("owner_backends")
    .select("supabase_project_ref")
    .eq("user_id", userId)
    .maybeSingle();
  if (!backend?.supabase_project_ref) {
    return fail(Errors.badRequest("Provision your Supabase project first."));
  }

  const sql = buildProvisionSql(app.schema_name, version.schema_sql);
  try {
    await executeSql(access.accessToken, backend.supabase_project_ref, sql);
  } catch (err) {
    console.error(
      `[buendia] schema provision SQL failed for app ${app.slug}:`,
      err instanceof ManagementApiError ? err.body : err,
    );
    return fail(Errors.upstream("Supabase rejected the schema SQL."));
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
    return fail(Errors.internal("Schema applied but couldn't update metadata."));
  }

  await recordAudit(supabase, {
    actorId: userId,
    action: "app.version.uploaded",
    targetAppId: app.id,
    metadata: { slug: app.slug, schema: app.schema_name, action: "schema_provisioned" },
  });

  return ok({ slug: app.slug, schema: app.schema_name });
}
