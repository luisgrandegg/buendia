import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "../_components/empty-state";

export const metadata = { title: "Shared with me · Buendia" };

export default async function SharedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // app_members surfaces both owner and collaborator rows. RLS restricts
  // it to the requester's own memberships. We filter out the owner role
  // here to leave only "shared with me" apps.
  const { data: memberships } = user
    ? await supabase
        .from("app_members")
        .select("app_id, slug, name, role")
        .eq("user_id", user.id)
        .neq("role", "owner")
    : { data: null };

  return (
    <div>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Shared with me</h1>
      </header>

      {!memberships || memberships.length === 0 ? (
        <EmptyState
          title="Nothing shared with you yet"
          body="When someone invites you to an app, it shows up here."
        />
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {memberships.map((m) => (
            <li
              key={m.app_id}
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
                <div style={{ fontWeight: 500 }}>{m.name}</div>
                <div style={{ color: "#6b7280", fontSize: "0.8125rem" }}>
                  slug: <code>{m.slug}</code> · your role: {m.role}
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Link
                  href={`/apps/${m.slug}`}
                  style={{
                    padding: "0.375rem 0.75rem",
                    borderRadius: "0.375rem",
                    border: "1px solid #d1d5db",
                    background: "white",
                    color: "#111827",
                    fontSize: "0.875rem",
                    textDecoration: "none",
                  }}
                >
                  Details
                </Link>
                <a
                  href={`/a/${m.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    padding: "0.375rem 0.75rem",
                    borderRadius: "0.375rem",
                    border: "1px solid #111827",
                    background: "#111827",
                    color: "white",
                    fontSize: "0.875rem",
                    textDecoration: "none",
                  }}
                >
                  Open ↗
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
