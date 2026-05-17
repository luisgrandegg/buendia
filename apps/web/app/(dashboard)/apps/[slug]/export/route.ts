import JSZip from "jszip";
import { recordAudit } from "@buendia/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * `GET /apps/<slug>/export` — bundle the latest version of an app into
 * a downloadable zip. Owner only. Constitution refs:
 *
 *   - §1 (portability over convenience): the HTML is the durable
 *     artifact. The export gives the user everything they need to run
 *     their app outside Buendia.
 *
 * Bundle layout:
 *   - index.html
 *   - schema.sql   (only if the latest version had one)
 *   - README.md    (standalone-mode setup instructions)
 *
 * Buendia never holds app *data* — that lives in the user's Supabase
 * project, which they can export directly using Supabase's own tools.
 * We don't pull a data dump into this bundle by design: doing so would
 * touch app data, which §3 says we never read.
 */

const HTML_BUCKET = "app-html";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("unauthenticated", { status: 401 });

  const { data: app } = await supabase
    .from("apps")
    .select("id, slug, name, schema_name, owner_id, html_storage_path, current_version, created_at")
    .eq("slug", slug)
    .maybeSingle();
  if (!app) return new Response("not found", { status: 404 });
  if (app.owner_id !== user.id) return new Response("forbidden", { status: 403 });

  const { data: version } = await supabase
    .from("app_versions")
    .select("schema_sql")
    .eq("app_id", app.id)
    .eq("version", app.current_version)
    .maybeSingle();

  const admin = createAdminClient();
  const { data: blob, error: blobError } = await admin.storage
    .from(HTML_BUCKET)
    .download(app.html_storage_path);
  if (blobError || !blob) {
    console.error("[buendia] export html download failed:", blobError);
    return new Response("html missing", { status: 502 });
  }
  const html = await blob.text();
  const schemaSql = version?.schema_sql ?? null;

  const zip = new JSZip();
  zip.file("index.html", html);
  if (schemaSql) {
    zip.file("schema.sql", schemaSql);
  }
  zip.file(
    "README.md",
    buildReadme({
      name: app.name,
      schemaName: app.schema_name,
      hasSchema: Boolean(schemaSql),
      exportedAt: new Date().toISOString(),
    }),
  );

  const buffer = await zip.generateAsync({ type: "uint8array" });
  // Re-wrap into a fresh Uint8Array backed by an ArrayBuffer so the
  // Response constructor accepts it without TS complaining about the
  // node-globals shape of Uint8Array.
  const body = new Uint8Array(buffer).buffer;

  await recordAudit(supabase, {
    actorId: user.id,
    action: "app.version.uploaded",
    targetAppId: app.id,
    metadata: { slug: app.slug, action: "exported", version: app.current_version },
  });

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${app.slug}.zip"`,
      "Content-Length": String(body.byteLength),
    },
  });
}

interface ReadmeParams {
  name: string;
  schemaName: string;
  hasSchema: boolean;
  exportedAt: string;
}

function buildReadme({ name, schemaName, hasSchema, exportedAt }: ReadmeParams): string {
  return `# ${name}

Exported from Buendia on ${exportedAt}.

## What's in this bundle

- \`index.html\` — your app, exactly as Buendia serves it.
${
  hasSchema
    ? `- \`schema.sql\` — the schema that ran in \`${schemaName}\` on your Supabase project.`
    : "- (no schema.sql — this app didn't define one)"
}

## Running standalone

1. Open \`index.html\` in a browser (\`file://\` works) or host it on any
   static host (Cloudflare Pages, GitHub Pages, S3 + a static-site
   hostname, etc.).
2. The Buendia SDK detects no \`window.__APP_CONFIG__\` and prompts for:
   - Your Supabase project URL
   - The publishable key for that project (Project Settings → API Keys → \`sb_publishable_...\`)
   - The schema name to use (use the same \`${schemaName}\` if you want to point at
     existing data, or a fresh schema name if you want to start clean)
3. The credentials are stored in \`localStorage\` under \`buendia:standalone\`
   and persisted across reloads. Clear them in DevTools to re-prompt.
${
  hasSchema
    ? `4. If you're starting from a fresh Supabase project, apply \`schema.sql\` first.
   Paste it into the SQL editor or pipe it through \`psql\`:

   \`\`\`bash
   psql "$YOUR_PROJECT_DB_URL" -f schema.sql
   \`\`\`
`
    : ""
}

## Standalone vs hosted

Standalone mode uses the publishable key directly. Security depends
entirely on your project's RLS policies. To get back per-user auth,
revocation, and managed sharing, re-host on Buendia.

## What stays on Buendia

Nothing of yours. Buendia doesn't keep app data — that lives in your
Supabase project, which keeps running whether you use Buendia or not.
`;
}
