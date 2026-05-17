import { notFound, redirect } from "next/navigation";
import { inviteCollaboratorAction, removeCollaboratorAction } from "@/app/actions/shares";
import { provisionSchemaAction } from "@/app/actions/apps";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ share?: string; provision_schema?: string }>;
}

const shareMessages: Record<string, { tone: "ok" | "warn"; text: string }> = {
  ok_invited: { tone: "ok", text: "Invitation added." },
  ok_role_changed: { tone: "ok", text: "Role updated." },
  ok_removed: { tone: "ok", text: "Collaborator removed." },
  unauthenticated: { tone: "warn", text: "Sign in and try again." },
  missing_email: { tone: "warn", text: "Enter an email to invite." },
  user_not_found: {
    tone: "warn",
    text: "No Buendia account uses that email yet. Email invitations land with ticket 31; for now, ask them to sign up first.",
  },
  self_invite: {
    tone: "warn",
    text: "You're the owner of this app — there's nothing to invite yourself to.",
  },
  not_owner: { tone: "warn", text: "Only the owner can manage sharing." },
  not_found: { tone: "warn", text: "Couldn't find that share." },
  already_member: { tone: "warn", text: "They already have access." },
  write_failed: { tone: "warn", text: "Couldn't save the change. Please try again." },
};

const provisionMessages: Record<string, { tone: "ok" | "warn"; text: string }> = {
  ok: { tone: "ok", text: "Schema provisioned." },
  unauthenticated: { tone: "warn", text: "Sign in and try again." },
  not_found: { tone: "warn", text: "Couldn't find that app." },
  not_connected: {
    tone: "warn",
    text: "Provision a Supabase project in Settings before running schemas.",
  },
  no_schema: {
    tone: "warn",
    text: "This app has no schema.sql. Upload a new version with one to provision.",
  },
  schema_invalid: {
    tone: "warn",
    text: "Your schema.sql contains a forbidden statement (RLS disable, GRANT, role manipulation, etc.). Fix and re-upload.",
  },
  oauth_refresh_failed: {
    tone: "warn",
    text: "Supabase refused the stored credentials. Reconnect from Settings.",
  },
  sql_failed: {
    tone: "warn",
    text: "Supabase rejected the schema. Check the server logs for the SQL error.",
  },
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: `${slug} · Buendia` };
}

export default async function AppDetailPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { share, provision_schema: provisionSchema } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/signin?next=/apps/${slug}`);

  const { data: app } = await supabase
    .from("apps")
    .select("id, slug, name, owner_id, current_version, created_at, schema_provisioned_at")
    .eq("slug", slug)
    .maybeSingle();
  if (!app) {
    // Could be a non-member trying to access; could be truly missing. RLS
    // makes them indistinguishable on purpose.
    notFound();
  }

  const isOwner = app.owner_id === user.id;

  // Shares — only visible to the owner via RLS. Hydrate with emails via
  // the admin client so the page can render "alice@example.com — Editor".
  let collaborators: { user_id: string; email: string; role: string; granted_at: string }[] = [];
  if (isOwner) {
    const admin = createAdminClient();
    const { data: shares } = await admin
      .from("app_shares")
      .select("user_id, role, granted_at, users:users!app_shares_user_id_fkey(email)")
      .eq("app_id", app.id)
      .order("granted_at", { ascending: false });

    collaborators =
      shares?.map((s) => ({
        user_id: s.user_id,
        role: s.role,
        granted_at: s.granted_at,
        email: (s.users as { email?: string } | null)?.email ?? "(unknown)",
      })) ?? [];
  }

  const banner =
    (provisionSchema && provisionMessages[provisionSchema]) ||
    (share && shareMessages[share]) ||
    undefined;

  return (
    <div>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>{app.name}</h1>
        <p style={{ color: "#6b7280", margin: "0.25rem 0 0 0", fontSize: "0.9375rem" }}>
          slug: <code>{app.slug}</code> · v{app.current_version} · created{" "}
          {new Date(app.created_at).toLocaleString()}
        </p>
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

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>App</h2>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <a href={`/a/${app.slug}`} target="_blank" rel="noreferrer" style={primaryButtonStyle}>
            Open ↗
          </a>
          {isOwner ? (
            <form action={provisionSchemaAction}>
              <input type="hidden" name="app_id" value={app.id} />
              <button type="submit" style={secondaryButtonStyle}>
                {app.schema_provisioned_at ? "Re-provision schema" : "Provision schema"}
              </button>
            </form>
          ) : null}
        </div>
        <p style={{ color: "#6b7280", margin: "0.5rem 0 0 0", fontSize: "0.8125rem" }}>
          {app.schema_provisioned_at
            ? `schema provisioned ${new Date(app.schema_provisioned_at).toLocaleString()}`
            : "schema not yet provisioned"}
        </p>
      </section>

      {isOwner ? (
        <section>
          <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Collaborators</h2>

          <ul
            style={{
              listStyle: "none",
              margin: "0 0 1rem 0",
              padding: 0,
              fontSize: "0.9375rem",
            }}
          >
            <li style={memberRowStyle}>
              <div>
                <strong>{user.email}</strong> · you · owner
              </div>
            </li>
            {collaborators.map((c) => (
              <li key={c.user_id} style={memberRowStyle}>
                <div>
                  <strong>{c.email}</strong> · {c.role} · since{" "}
                  {new Date(c.granted_at).toLocaleDateString()}
                </div>
                <form action={removeCollaboratorAction}>
                  <input type="hidden" name="slug" value={app.slug} />
                  <input type="hidden" name="user_id" value={c.user_id} />
                  <button type="submit" style={dangerButtonStyle}>
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>

          <form action={inviteCollaboratorAction} style={{ display: "flex", gap: "0.5rem" }}>
            <input type="hidden" name="slug" value={app.slug} />
            <input
              name="email"
              type="email"
              placeholder="collaborator@example.com"
              required
              style={{ ...inputStyle, flex: 1 }}
            />
            <select name="role" defaultValue="viewer" style={inputStyle}>
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            <button type="submit" style={primaryButtonStyle}>
              Invite
            </button>
          </form>
          <p style={{ color: "#6b7280", margin: "0.5rem 0 0 0", fontSize: "0.8125rem" }}>
            Invitees must already have a Buendia account. Email-driven invitations for new users
            land with ticket 31.
          </p>
        </section>
      ) : null}
    </div>
  );
}

const memberRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0.625rem 0.875rem",
  border: "1px solid #e5e7eb",
  borderRadius: "0.375rem",
  marginBottom: "0.375rem",
};

const inputStyle = {
  padding: "0.5rem 0.75rem",
  borderRadius: "0.375rem",
  border: "1px solid #d1d5db",
  fontSize: "0.9375rem",
};

const primaryButtonStyle = {
  padding: "0.5rem 1rem",
  borderRadius: "0.375rem",
  border: "1px solid #111827",
  background: "#111827",
  color: "white",
  fontSize: "0.9375rem",
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-block",
} as const;

const secondaryButtonStyle = {
  padding: "0.5rem 0.75rem",
  borderRadius: "0.375rem",
  border: "1px solid #d1d5db",
  background: "white",
  color: "#111827",
  fontSize: "0.9375rem",
  cursor: "pointer",
} as const;

const dangerButtonStyle = {
  padding: "0.3125rem 0.625rem",
  borderRadius: "0.375rem",
  border: "1px solid #fecaca",
  background: "white",
  color: "#b91c1c",
  fontSize: "0.8125rem",
  cursor: "pointer",
} as const;
