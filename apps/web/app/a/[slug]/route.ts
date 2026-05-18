import { NextResponse } from "next/server";
import { decrypt, loadMasterKey } from "@buendia/db";
import type { BuendiaAppConfig } from "@buendia/shared";
import { mintAppJwt, type AppRole } from "@/lib/jwt-mint";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * The edge serve route: GET `/a/<slug>` returns the user's HTML with
 * `window.__APP_CONFIG__` injected before `</head>`. Constitution refs:
 *
 *   - §4 (real auth): every render carries a fresh JWT signed with the
 *     owner's Supabase project JWT secret.
 *   - Architecture Invariants §JWT scope is the security boundary.
 *
 * The middleware already redirects unauthenticated requests to
 * `/signin?next=/a/<slug>`, so by the time we run we have a session.
 *
 * Member lookup goes through the requester's session (RLS-bound, via the
 * `app_members` view). Owner-backend credentials and the HTML blob are
 * read through the admin client because collaborators can't see the
 * owner's storage objects or owner_backends row via publishable-key RLS.
 */

const HTML_BUCKET = "app-html";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Middleware should have caught this; defensive.
    return new NextResponse(notFoundHtml(), { status: 404, headers: htmlHeaders() });
  }

  const { data: member } = await supabase
    .from("app_members")
    .select("app_id, owner_id, slug, name, schema_name, team_id, html_storage_path, role")
    .eq("slug", slug)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) {
    return new NextResponse(forbiddenHtml(), { status: 403, headers: htmlHeaders() });
  }

  const admin = createAdminClient();

  const { data: backend } = await admin
    .from("owner_backends")
    .select("supabase_url, supabase_jwt_secret_encrypted, supabase_publishable_key_encrypted")
    .eq("user_id", member.owner_id)
    .maybeSingle();

  if (
    !backend?.supabase_url ||
    !backend.supabase_jwt_secret_encrypted ||
    !backend.supabase_publishable_key_encrypted
  ) {
    return new NextResponse(notReadyHtml(), { status: 502, headers: htmlHeaders() });
  }

  let jwtSecret: string;
  let publishableKey: string;
  try {
    const masterKey = loadMasterKey();
    jwtSecret = decrypt(bufferFromBytea(backend.supabase_jwt_secret_encrypted), masterKey);
    publishableKey = decrypt(
      bufferFromBytea(backend.supabase_publishable_key_encrypted),
      masterKey,
    );
  } catch (err) {
    console.error("[buendia] failed to decrypt owner credentials:", err);
    return new NextResponse(notReadyHtml(), { status: 500, headers: htmlHeaders() });
  }

  const { jwt, exp } = mintAppJwt({
    jwtSecret,
    userId: user.id,
    appId: member.app_id,
    appSchema: member.schema_name,
    teamId: member.team_id,
    role: member.role as AppRole,
  });

  const { data: blob, error: downloadError } = await admin.storage
    .from(HTML_BUCKET)
    .download(member.html_storage_path);
  if (downloadError || !blob) {
    console.error("[buendia] html download failed:", downloadError);
    return new NextResponse(notReadyHtml(), { status: 502, headers: htmlHeaders() });
  }
  const rawHtml = await blob.text();

  const config: BuendiaAppConfig = {
    hosted: true,
    supabaseUrl: backend.supabase_url,
    publishableKey,
    jwt,
    jwtExp: exp,
    user: {
      id: user.id,
      email: user.email ?? "",
      role: member.role as AppRole,
    },
    app: {
      id: member.app_id,
      name: member.name,
      slug: member.slug,
      schema: member.schema_name,
      teamId: member.team_id,
    },
    refreshUrl: `/api/jwt/refresh?app=${encodeURIComponent(member.app_id)}`,
  };

  const html = injectAppConfig(rawHtml, config);

  return new NextResponse(html, {
    status: 200,
    headers: {
      ...htmlHeaders(),
      // Each render carries a fresh, short-lived JWT — no caching layer
      // should hold onto this output.
      "Cache-Control": "no-store",
    },
  });
}

function injectAppConfig(html: string, config: BuendiaAppConfig): string {
  // Escape `</script>` inside the JSON so the inline script can't be closed
  // early by a value that happens to contain that sequence.
  const payload = JSON.stringify(config).replace(/<\/script>/gi, "<\\/script>");
  const tag = `<script>window.__APP_CONFIG__=${payload};</script>`;

  // Case-insensitive search for </head>; fall back to prepending the tag
  // to the body if there's no <head> (legitimate for minimal HTML).
  const match = /<\/head\s*>/i.exec(html);
  if (match) {
    return html.slice(0, match.index) + tag + html.slice(match.index);
  }
  return tag + html;
}

function htmlHeaders(): Record<string, string> {
  return { "Content-Type": "text/html; charset=utf-8" };
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

function forbiddenHtml(): string {
  return basicHtml(
    "Access denied",
    "You don't have access to this app. If you think that's a mistake, ask the owner to re-invite you.",
  );
}

function notFoundHtml(): string {
  return basicHtml("App not found", "We couldn't find this app.");
}

function notReadyHtml(): string {
  return basicHtml(
    "App not ready",
    "The owner hasn't finished setting up this app's backend yet. Please try again in a moment.",
  );
}

function basicHtml(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title} · Buendia</title>
    <link rel="preconnect" href="https://rsms.me/" />
    <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
    <style>
      :root { font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      *, *::before, *::after { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body {
        min-height: 100vh;
        background: #f8fafc;
        color: #0f172a;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.5rem;
        -webkit-font-smoothing: antialiased;
      }
      .card {
        max-width: 28rem;
        width: 100%;
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 0.75rem;
        padding: 2rem 2.25rem;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04);
      }
      .eyebrow {
        font-size: 0.75rem;
        font-weight: 500;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #64748b;
        margin-bottom: 0.5rem;
      }
      h1 { font-size: 1.5rem; margin: 0 0 0.75rem 0; letter-spacing: -0.015em; font-weight: 600; }
      p { color: #475569; line-height: 1.6; margin: 0 0 1rem 0; }
      a {
        display: inline-block;
        margin-top: 0.5rem;
        padding: 0.5rem 1rem;
        background: #0f172a;
        color: #ffffff;
        border-radius: 0.375rem;
        text-decoration: none;
        font-size: 0.9375rem;
        font-weight: 500;
      }
      a:hover { background: #1e293b; }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="eyebrow">Buendia</div>
      <h1>${title}</h1>
      <p>${body}</p>
      <a href="/">← Back to dashboard</a>
    </main>
  </body>
</html>`;
}
