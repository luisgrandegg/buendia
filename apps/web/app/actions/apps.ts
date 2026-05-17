"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { recordAudit } from "@buendia/db";
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
