import { createClient } from "@/lib/supabase/server";
import { getOwnerBackendStatus } from "@/lib/owner-backend";
import { UploadForm } from "./_components/upload-form";
import { EmptyState } from "./_components/empty-state";

export const metadata = { title: "My apps · Buendia" };

interface PageProps {
  searchParams: Promise<{ upload?: string; slug?: string }>;
}

const bannerMessages: Record<string, { tone: "ok" | "warn"; text: (slug?: string) => string }> = {
  ok: {
    tone: "ok",
    text: (slug) => `Uploaded${slug ? ` (slug: ${slug})` : ""}. Serving lands in ticket 22.`,
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

export default async function MyAppsPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const backend = user ? await getOwnerBackendStatus(user.id) : null;

  const { data: apps } = await supabase
    .from("apps")
    .select("id, slug, name, current_version, created_at")
    .order("created_at", { ascending: false });

  const { upload, slug } = await searchParams;
  const banner = upload ? bannerMessages[upload] : undefined;

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
          {banner.text(slug)}
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
          }}
        >
          <div>
            <div style={{ fontWeight: 500 }}>{app.name}</div>
            <div style={{ color: "#6b7280", fontSize: "0.8125rem" }}>
              slug: <code>{app.slug}</code> · v{app.current_version} ·{" "}
              {new Date(app.created_at).toLocaleString()}
            </div>
          </div>
          <span
            style={{
              fontSize: "0.8125rem",
              color: "#6b7280",
              fontStyle: "italic",
            }}
            title="The /a/<slug> serve route lands in ticket 22."
          >
            Open arrives in ticket 22
          </span>
        </li>
      ))}
    </ul>
  );
}
