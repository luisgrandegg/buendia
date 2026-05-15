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

const statusMessages: Record<string, { tone: "ok" | "warn"; text: string }> = {
  ok: { tone: "ok", text: "Supabase connected. Project provisioning lands in ticket 11." },
  denied: {
    tone: "warn",
    text: "You declined the Supabase authorization. You can retry whenever you're ready.",
  },
  error: {
    tone: "warn",
    text: "Something went wrong during the Supabase handshake. Please try again.",
  },
};

interface PageProps {
  searchParams: Promise<{ supabase?: string }>;
}

export default async function SettingsPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const status = user ? await getOwnerBackendStatus(user.id) : null;
  const { supabase: supabaseParam } = await searchParams;
  const banner = supabaseParam ? statusMessages[supabaseParam] : undefined;

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

        {status?.exists ? <ConnectedBackendDetails status={status} /> : <ConnectSupabaseCta />}
      </section>
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
        <dd style={{ margin: 0 }}>
          {status.hasProject
            ? "Connected · project provisioned"
            : "OAuth complete · project provisioning pending"}
        </dd>
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
      <button
        type="submit"
        style={{
          padding: "0.5rem 1rem",
          borderRadius: "0.375rem",
          border: "1px solid #111827",
          background: "#111827",
          color: "white",
          fontSize: "0.9375rem",
          cursor: "pointer",
        }}
      >
        Connect Supabase
      </button>
    </form>
  );
}
