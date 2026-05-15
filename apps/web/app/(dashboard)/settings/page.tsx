import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Settings · Buendia" };

const rowStyle = {
  display: "grid",
  gridTemplateColumns: "12rem 1fr",
  padding: "1rem 0",
  borderBottom: "1px solid #e5e7eb",
  fontSize: "0.9375rem",
};

const labelStyle = { color: "#6b7280" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Settings</h1>
      </header>

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
        <p style={{ color: "#4b5563", margin: 0 }}>
          Supabase OAuth and the user-owned project provisioning land with tickets 10 and 11.
        </p>
      </section>
    </div>
  );
}
