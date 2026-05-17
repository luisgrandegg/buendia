import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getOwnerBackendStatus } from "@/lib/owner-backend";
import { UploadForm } from "./_components/upload-form";
import { EmptyState } from "./_components/empty-state";

export const metadata = { title: "My apps · Buendia" };

interface PageProps {
  searchParams: Promise<{
    upload?: string;
    provision_schema?: string;
    slug?: string;
  }>;
}

const uploadMessages: Record<string, { tone: "ok" | "warn"; text: (slug?: string) => string }> = {
  ok: {
    tone: "ok",
    text: (slug) =>
      slug ? `Uploaded. Open it from /a/${slug}, or click Open below.` : "Uploaded.",
  },
  missing_file: { tone: "warn", text: () => "Pick an HTML file before submitting." },
  not_html: { tone: "warn", text: () => "Only single .html files are accepted." },
  too_big: { tone: "warn", text: () => "HTML files must be 5 MB or smaller." },
  storage_failed: {
    tone: "warn",
    text: () => "Buendia couldn't store the file. Please try again.",
  },
  db_failed: { tone: "warn", text: () => "Buendia couldn't register the app. Please try again." },
};

const provisionMessages: Record<string, { tone: "ok" | "warn"; text: (slug?: string) => string }> =
  {
    ok: {
      tone: "ok",
      text: (slug) => `Schema provisioned${slug ? ` for ${slug}` : ""}.`,
    },
    unauthenticated: { tone: "warn", text: () => "Sign in and try again." },
    not_found: { tone: "warn", text: () => "Couldn't find that app." },
    not_connected: {
      tone: "warn",
      text: () => "Provision a Supabase project in Settings before running schemas.",
    },
    no_schema: {
      tone: "warn",
      text: (slug) =>
        `The latest version of ${slug ?? "this app"} has no schema.sql. Upload a new version with one to provision.`,
    },
    schema_invalid: {
      tone: "warn",
      text: (slug) =>
        `The schema.sql for ${slug ?? "this app"} contains a forbidden statement (RLS disable, GRANT, role manipulation, etc.). Fix and re-upload.`,
    },
    oauth_refresh_failed: {
      tone: "warn",
      text: () => "Supabase refused the stored credentials. Reconnect from Settings.",
    },
    sql_failed: {
      tone: "warn",
      text: (slug) =>
        `Supabase rejected the schema for ${slug ?? "this app"}. Check the server logs for the SQL error.`,
    },
  };

export default async function MyAppsPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const backend = user ? await getOwnerBackendStatus(user.id) : null;

  const { data: apps } = await supabase
    .from("apps")
    .select("id, slug, name, current_version, created_at, schema_provisioned_at")
    .order("created_at", { ascending: false });

  const params = await searchParams;
  const banner =
    (params.provision_schema && provisionMessages[params.provision_schema]) ||
    (params.upload && uploadMessages[params.upload]) ||
    undefined;

  return (
    <div>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>My apps</h1>
      </header>

      {banner ? (
        <div
          role="status"
          style={{
            padding: "0.75rem 1rem",
            marginBottom: "1.5rem",
            borderRadius: "0.375rem",
            border: `1px solid ${banner.tone === "ok" ? "#bbf7d0" : "#fecaca"}`,
            background: banner.tone === "ok" ? "#f0fdf4" : "#fef2f2",
            color: banner.tone === "ok" ? "#166534" : "#991b1b",
            fontSize: "0.9375rem",
          }}
        >
          {banner.text(params.slug)}
        </div>
      ) : null}

      {!backend?.hasProject ? (
        <EmptyState
          title="Connect a Supabase project first"
          body="Buendia stores app HTML on the control plane, but each app's data lives in a Supabase project you own. Set that up in Settings, then come back here to upload."
        />
      ) : !apps || apps.length === 0 ? (
        <section>
          <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Upload your first app</h2>
          <UploadForm />
        </section>
      ) : (
        <>
          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Your apps</h2>
            <AppList apps={apps} />
          </section>
          <section>
            <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Upload another</h2>
            <UploadForm />
          </section>
        </>
      )}
    </div>
  );
}

interface AppRow {
  id: string;
  slug: string;
  name: string;
  current_version: number;
  created_at: string;
  schema_provisioned_at: string | null;
}

function AppList({ apps }: { apps: AppRow[] }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {apps.map((app) => (
        <li
          key={app.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0.75rem 1rem",
            border: "1px solid #e5e7eb",
            borderRadius: "0.375rem",
            marginBottom: "0.5rem",
            fontSize: "0.9375rem",
            gap: "1rem",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Link
              href={`/apps/${app.slug}`}
              style={{ fontWeight: 500, textDecoration: "none", color: "inherit" }}
            >
              {app.name}
            </Link>
            <div style={{ color: "#6b7280", fontSize: "0.8125rem" }}>
              slug: <code>{app.slug}</code> · v{app.current_version} ·{" "}
              {new Date(app.created_at).toLocaleString()}
            </div>
            <div style={{ color: "#6b7280", fontSize: "0.8125rem", marginTop: "0.125rem" }}>
              {app.schema_provisioned_at
                ? `schema provisioned ${new Date(app.schema_provisioned_at).toLocaleString()}`
                : "schema not yet provisioned"}
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <Link
              href={`/apps/${app.slug}`}
              style={{ ...secondaryButtonStyle, textDecoration: "none", display: "inline-block" }}
            >
              Manage
            </Link>
            <a
              href={`/a/${app.slug}`}
              target="_blank"
              rel="noreferrer"
              style={{
                ...secondaryButtonStyle,
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              Open ↗
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}

const secondaryButtonStyle = {
  padding: "0.375rem 0.75rem",
  borderRadius: "0.375rem",
  border: "1px solid #d1d5db",
  background: "white",
  color: "#111827",
  fontSize: "0.875rem",
  cursor: "pointer",
} as const;
