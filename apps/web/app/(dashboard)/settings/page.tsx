import { provisionProjectAction } from "@/app/actions/owner-backend";
import { createClient } from "@/lib/supabase/server";
import { getOwnerBackendStatus } from "@/lib/owner-backend";

export const metadata = { title: "Settings · Buendia" };

const rowStyle = {
  display: "grid",
  gridTemplateColumns: "12rem 1fr",
  padding: "1rem 0",
  borderBottom: "1px solid #e5e7eb",
  fontSize: "0.9375rem",
};

const labelStyle = { color: "#6b7280" };

const supabaseMessages: Record<string, { tone: "ok" | "warn"; text: string }> = {
  ok: { tone: "ok", text: "Supabase connected. Provision your project to finish." },
  denied: {
    tone: "warn",
    text: "You declined the Supabase authorization. You can retry whenever you're ready.",
  },
  error: {
    tone: "warn",
    text: "Something went wrong during the Supabase handshake. Please try again.",
  },
};

const provisionMessages: Record<string, { tone: "ok" | "warn"; text: string }> = {
  ok: { tone: "ok", text: "Your Buendia Apps project is ready." },
  unauthenticated: { tone: "warn", text: "Sign in and try again." },
  not_connected: {
    tone: "warn",
    text: "Connect Supabase before provisioning a project.",
  },
  oauth_refresh_failed: {
    tone: "warn",
    text: "Supabase refused the stored credentials. Disconnect and reconnect to retry.",
  },
  list_orgs_failed: {
    tone: "warn",
    text: "Couldn't read your Supabase organizations. Please try again.",
  },
  no_organization: {
    tone: "warn",
    text: "Create a Supabase organization first, then provision again.",
  },
  free_tier_limit: {
    tone: "warn",
    text: "Your Supabase organization is at the free-tier project limit. Free up a slot or upgrade in Supabase, then try again.",
  },
  create_project_failed: {
    tone: "warn",
    text: "Supabase rejected the project creation. Please try again.",
  },
  project_unhealthy: {
    tone: "warn",
    text: "The new project didn't reach a healthy state. Try again or check Supabase's status.",
  },
  still_provisioning: {
    tone: "warn",
    text: "Supabase is still preparing your project. Refresh this page in a moment.",
  },
  fetch_keys_failed: {
    tone: "warn",
    text: "Project created, but Buendia couldn't read its API keys. Try the provision step again.",
  },
  persist_failed: {
    tone: "warn",
    text: "Project created, but Buendia couldn't save its credentials. Try again.",
  },
};

const disconnectMessages: Record<string, { tone: "ok" | "warn"; text: string }> = {
  ok: {
    tone: "ok",
    text: "Disconnected. Your Supabase project + data are untouched and will keep running.",
  },
  write_failed: {
    tone: "warn",
    text: "Couldn't clear the stored credentials. Please try again.",
  },
};

interface PageProps {
  searchParams: Promise<{ supabase?: string; provision?: string; disconnect?: string }>;
}

export default async function SettingsPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const status = user ? await getOwnerBackendStatus(user.id) : null;
  const {
    supabase: supabaseParam,
    provision: provisionParam,
    disconnect: disconnectParam,
  } = await searchParams;
  const banner =
    (disconnectParam && disconnectMessages[disconnectParam]) ||
    (provisionParam && provisionMessages[provisionParam]) ||
    (supabaseParam && supabaseMessages[supabaseParam]) ||
    undefined;

  return (
    <div>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Settings</h1>
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
          {banner.text}
        </div>
      ) : null}

      <section>
        <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Account</h2>
        <dl style={{ margin: 0 }}>
          <div style={rowStyle}>
            <dt style={labelStyle}>Email</dt>
            <dd style={{ margin: 0 }}>{user?.email ?? "—"}</dd>
          </div>
          <div style={rowStyle}>
            <dt style={labelStyle}>User ID</dt>
            <dd style={{ margin: 0, fontFamily: "ui-monospace, monospace" }}>{user?.id ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Connected backend</h2>

        {!status?.exists ? (
          <ConnectSupabaseCta />
        ) : status.hasProject ? (
          <ConnectedBackendDetails status={status} />
        ) : (
          <ProvisionProjectCta connectedAt={status.connectedAt} />
        )}
      </section>

      {status?.exists ? (
        <section style={{ marginTop: "2.5rem" }}>
          <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem", color: "#991b1b" }}>
            Danger zone
          </h2>
          <p style={{ color: "#4b5563", fontSize: "0.9375rem", margin: "0 0 0.75rem 0" }}>
            Disconnect Buendia from your Supabase account. Your project and data stay; we just stop
            being involved.
          </p>
          <a
            href="/settings/disconnect"
            style={{
              display: "inline-block",
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              border: "1px solid #fecaca",
              background: "white",
              color: "#b91c1c",
              fontSize: "0.9375rem",
              textDecoration: "none",
            }}
          >
            Disconnect Buendia…
          </a>
        </section>
      ) : null}
    </div>
  );
}

function ConnectedBackendDetails({
  status,
}: {
  status: Awaited<ReturnType<typeof getOwnerBackendStatus>>;
}) {
  return (
    <dl style={{ margin: 0 }}>
      <div style={rowStyle}>
        <dt style={labelStyle}>Supabase</dt>
        <dd style={{ margin: 0 }}>Connected · project provisioned</dd>
      </div>
      <div style={rowStyle}>
        <dt style={labelStyle}>Connected at</dt>
        <dd style={{ margin: 0 }}>
          {status.connectedAt ? new Date(status.connectedAt).toLocaleString() : "—"}
        </dd>
      </div>
    </dl>
  );
}

function ConnectSupabaseCta() {
  return (
    <form action="/api/auth/supabase/start" method="post">
      <p style={{ color: "#4b5563", margin: "0 0 1rem 0" }}>
        To host your apps, Buendia needs to manage projects in your Supabase organization. You stay
        the owner; Buendia drops out cleanly if you disconnect.
      </p>
      <button type="submit" style={primaryButtonStyle}>
        Connect Supabase
      </button>
    </form>
  );
}

function ProvisionProjectCta({ connectedAt }: { connectedAt: string | null }) {
  return (
    <div>
      <dl style={{ margin: "0 0 1rem 0" }}>
        <div style={rowStyle}>
          <dt style={labelStyle}>Supabase</dt>
          <dd style={{ margin: 0 }}>OAuth complete · project not yet provisioned</dd>
        </div>
        <div style={rowStyle}>
          <dt style={labelStyle}>Connected at</dt>
          <dd style={{ margin: 0 }}>
            {connectedAt ? new Date(connectedAt).toLocaleString() : "—"}
          </dd>
        </div>
      </dl>
      <p style={{ color: "#4b5563", margin: "0 0 1rem 0" }}>
        Buendia will create one project named "Buendia Apps" in your first Supabase organization.
        This takes 30–60 seconds. You can keep using the dashboard while it runs.
      </p>
      <form action={provisionProjectAction}>
        <button type="submit" style={primaryButtonStyle}>
          Provision project
        </button>
      </form>
    </div>
  );
}

const primaryButtonStyle = {
  padding: "0.5rem 1rem",
  borderRadius: "0.375rem",
  border: "1px solid #111827",
  background: "#111827",
  color: "white",
  fontSize: "0.9375rem",
  cursor: "pointer",
} as const;
