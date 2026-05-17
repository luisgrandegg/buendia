import Link from "next/link";
import { redirect } from "next/navigation";
import { disconnectBuendiaAction } from "@/app/actions/owner-backend";
import { createClient } from "@/lib/supabase/server";
import { getOwnerBackendStatus } from "@/lib/owner-backend";

export const metadata = { title: "Disconnect Buendia · Buendia" };

export default async function DisconnectPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin?next=/settings/disconnect");

  const status = await getOwnerBackendStatus(user.id);
  if (!status.exists) redirect("/settings");

  const { data: apps } = await supabase
    .from("apps")
    .select("id, slug, name")
    .order("created_at", { ascending: false });

  return (
    <div>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Disconnect Buendia</h1>
      </header>

      <section style={{ marginBottom: "2rem", fontSize: "0.9375rem", lineHeight: "1.6" }}>
        <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>What will happen</h2>
        <ul style={{ paddingLeft: "1.25rem", color: "#374151" }}>
          <li>
            Your encrypted Supabase credentials will be deleted from Buendia. We won't be able to
            mint JWTs or run schema operations on your behalf.
          </li>
          <li>
            Apps you uploaded will stay in your dashboard, but opening them via{" "}
            <code>/a/&lt;slug&gt;</code> will return "App not ready" until you reconnect.
          </li>
          <li>
            Your Supabase project, its schemas, and all the app data inside it stay untouched. They
            keep running whether Buendia is involved or not.
          </li>
          <li>Sharing grants stay in the database but become inert until you reconnect.</li>
        </ul>
      </section>

      {apps && apps.length > 0 ? (
        <section
          style={{
            marginBottom: "2rem",
            padding: "1rem 1.25rem",
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: "0.375rem",
            color: "#78350f",
          }}
        >
          <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem 0" }}>Export your apps first?</h2>
          <p style={{ fontSize: "0.9375rem", margin: "0 0 0.75rem 0", lineHeight: "1.5" }}>
            Each export bundles <code>index.html</code> + <code>schema.sql</code> + a README so the
            app can run on any static host pointed at your Supabase project.
          </p>
          <ul style={{ paddingLeft: "0", listStyle: "none", margin: 0 }}>
            {apps.map((app) => (
              <li key={app.id} style={{ marginBottom: "0.375rem" }}>
                <a
                  href={`/apps/${app.slug}/export`}
                  style={{ color: "#78350f", textDecoration: "underline" }}
                >
                  Download {app.name}.zip
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Confirm</h2>
        <p style={{ color: "#4b5563", fontSize: "0.9375rem" }}>
          Reconnecting is one click on the Settings page if you change your mind.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
          <Link
            href="/settings"
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              border: "1px solid #d1d5db",
              background: "white",
              color: "#111827",
              fontSize: "0.9375rem",
              textDecoration: "none",
            }}
          >
            Cancel
          </Link>
          <form action={disconnectBuendiaAction}>
            <button
              type="submit"
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "0.375rem",
                border: "1px solid #b91c1c",
                background: "#b91c1c",
                color: "white",
                fontSize: "0.9375rem",
                cursor: "pointer",
              }}
            >
              Disconnect Buendia
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
