import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  cancelInvitationAction,
  inviteCollaboratorAction,
  removeCollaboratorAction,
} from "@/app/actions/shares";
import { deleteAppAction, provisionSchemaAction, renameAppAction } from "@/app/actions/apps";
import { invitationUrl } from "@/lib/invitations";
import { originFromHeaders } from "@/lib/oauth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ share?: string; provision_schema?: string; rename?: string }>;
}

const renameMessages: Record<string, { tone: "ok" | "warn"; text: string }> = {
  ok: { tone: "ok", text: "App renamed." },
  unauthenticated: { tone: "warn", text: "Sign in and try again." },
  not_found: { tone: "warn", text: "Couldn't find that app." },
  not_owner: { tone: "warn", text: "Only the owner can rename this app." },
  empty: { tone: "warn", text: "Enter a name." },
  write_failed: { tone: "warn", text: "Couldn't save the new name." },
};

const shareMessages: Record<string, { tone: "ok" | "warn"; text: string }> = {
  ok_invited: { tone: "ok", text: "Collaborator added." },
  ok_invited_email: {
    tone: "ok",
    text: "Invitation created. Copy the link below to share it.",
  },
  ok_role_changed: { tone: "ok", text: "Role updated." },
  ok_removed: { tone: "ok", text: "Collaborator removed." },
  ok_invitation_removed: { tone: "ok", text: "Invitation cancelled." },
  unauthenticated: { tone: "warn", text: "Sign in and try again." },
  missing_email: { tone: "warn", text: "Enter an email to invite." },
  self_invite: {
    tone: "warn",
    text: "You're the owner of this app — there's nothing to invite yourself to.",
  },
  not_owner: { tone: "warn", text: "Only the owner can manage sharing." },
  not_found: { tone: "warn", text: "Couldn't find that share." },
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
  const { share, provision_schema: provisionSchema, rename } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/signin?next=/apps/${slug}`);

  const { data: app } = await supabase
    .from("apps")
    .select(
      "id, slug, name, owner_id, current_version, created_at, schema_provisioned_at, schema_name",
    )
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

  // Pending invitations — owner only.
  let pendingInvitations: {
    id: string;
    email: string;
    role: string;
    token: string;
    expires_at: string;
  }[] = [];
  let pendingOrigin = "";
  if (isOwner) {
    const { data: invitations } = await supabase
      .from("invitations")
      .select("id, email, role, token, expires_at")
      .eq("app_id", app.id)
      .order("created_at", { ascending: false });
    pendingInvitations = invitations ?? [];
    if (pendingInvitations.length > 0) {
      pendingOrigin = originFromHeaders(await headers());
    }
  }

  const banner =
    (rename && renameMessages[rename]) ||
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
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <a href={`/a/${app.slug}`} target="_blank" rel="noreferrer" style={primaryButtonStyle}>
            Open ↗
          </a>
          {isOwner ? (
            <>
              <form action={provisionSchemaAction}>
                <input type="hidden" name="app_id" value={app.id} />
                <button type="submit" style={secondaryButtonStyle}>
                  {app.schema_provisioned_at ? "Re-provision schema" : "Provision schema"}
                </button>
              </form>
              <a
                href={`/apps/${app.slug}/export`}
                style={{ ...secondaryButtonStyle, textDecoration: "none", display: "inline-block" }}
              >
                Export bundle
              </a>
            </>
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

          {pendingInvitations.length > 0 ? (
            <div style={{ margin: "1rem 0" }}>
              <h3
                style={{
                  fontSize: "0.875rem",
                  color: "#6b7280",
                  margin: "0 0 0.5rem 0",
                  fontWeight: 500,
                }}
              >
                Pending invitations
              </h3>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {pendingInvitations.map((inv) => (
                  <li
                    key={inv.id}
                    style={{
                      padding: "0.625rem 0.875rem",
                      border: "1px solid #fde68a",
                      background: "#fffbeb",
                      borderRadius: "0.375rem",
                      marginBottom: "0.375rem",
                      fontSize: "0.9375rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <div>
                        <strong>{inv.email}</strong> · {inv.role} · expires{" "}
                        {new Date(inv.expires_at).toLocaleDateString()}
                      </div>
                      <form action={cancelInvitationAction}>
                        <input type="hidden" name="slug" value={app.slug} />
                        <input type="hidden" name="invitation_id" value={inv.id} />
                        <button type="submit" style={dangerButtonStyle}>
                          Cancel
                        </button>
                      </form>
                    </div>
                    <div
                      style={{
                        marginTop: "0.5rem",
                        fontSize: "0.8125rem",
                        color: "#78350f",
                        fontFamily: "ui-monospace, monospace",
                        wordBreak: "break-all",
                        userSelect: "all",
                      }}
                    >
                      {invitationUrl(pendingOrigin, inv.token)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

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
            Invitees with a Buendia account get access immediately. Otherwise, an invite link
            appears under <em>Pending invitations</em>; copy and share it. Once they sign up via the
            link, they show up in the collaborators list.
          </p>
        </section>
      ) : null}

      {isOwner ? (
        <section style={{ marginTop: "2rem" }}>
          <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Settings</h2>

          <form
            action={renameAppAction}
            style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", alignItems: "center" }}
          >
            <input type="hidden" name="slug" value={app.slug} />
            <input
              name="name"
              type="text"
              defaultValue={app.name}
              required
              style={{ ...inputStyle, flex: 1 }}
            />
            <button type="submit" style={secondaryButtonStyle}>
              Rename
            </button>
          </form>

          <details
            style={{
              padding: "0.875rem 1rem",
              border: "1px solid #fecaca",
              borderRadius: "0.375rem",
              background: "#fef2f2",
            }}
          >
            <summary
              style={{
                cursor: "pointer",
                fontSize: "0.875rem",
                color: "#991b1b",
                fontWeight: 500,
              }}
            >
              Delete this app
            </summary>
            <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#7f1d1d" }}>
              Drops the <code>{app.schema_name}</code> schema in your Supabase project, removes the
              stored HTML, deletes the app record + all shares + version history. Can't be undone.
            </p>
            <form action={deleteAppAction} style={{ marginTop: "0.75rem" }}>
              <input type="hidden" name="slug" value={app.slug} />
              <button type="submit" style={dangerButtonStyle}>
                Delete app permanently
              </button>
            </form>
          </details>
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
