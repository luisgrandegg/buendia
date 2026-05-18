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
import {
  Alert,
  Badge,
  Button,
  Card,
  CodeBlock,
  Heading,
  Input,
  PageHeader,
  Row,
  Stack,
  Text,
  colors,
  motion,
  radii,
  space,
  typography,
} from "@/lib/ui";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ share?: string; provision_schema?: string; rename?: string }>;
}

const renameMessages: Record<string, { tone: "success" | "warning"; text: string }> = {
  ok: { tone: "success", text: "App renamed." },
  unauthenticated: { tone: "warning", text: "Sign in and try again." },
  not_found: { tone: "warning", text: "Couldn't find that app." },
  not_owner: { tone: "warning", text: "Only the owner can rename this app." },
  empty: { tone: "warning", text: "Enter a name." },
  write_failed: { tone: "warning", text: "Couldn't save the new name." },
};

const shareMessages: Record<string, { tone: "success" | "warning"; text: string }> = {
  ok_invited: { tone: "success", text: "Collaborator added." },
  ok_invited_email: {
    tone: "success",
    text: "Invitation created. Copy the link below to share it.",
  },
  ok_role_changed: { tone: "success", text: "Role updated." },
  ok_removed: { tone: "success", text: "Collaborator removed." },
  ok_invitation_removed: { tone: "success", text: "Invitation cancelled." },
  unauthenticated: { tone: "warning", text: "Sign in and try again." },
  missing_email: { tone: "warning", text: "Enter an email to invite." },
  self_invite: {
    tone: "warning",
    text: "You're the owner of this app — there's nothing to invite yourself to.",
  },
  not_owner: { tone: "warning", text: "Only the owner can manage sharing." },
  not_found: { tone: "warning", text: "Couldn't find that share." },
  write_failed: { tone: "warning", text: "Couldn't save the change. Please try again." },
};

const provisionMessages: Record<string, { tone: "success" | "warning"; text: string }> = {
  ok: { tone: "success", text: "Schema provisioned." },
  unauthenticated: { tone: "warning", text: "Sign in and try again." },
  not_found: { tone: "warning", text: "Couldn't find that app." },
  not_connected: {
    tone: "warning",
    text: "Provision a Supabase project in Settings before running schemas.",
  },
  no_schema: {
    tone: "warning",
    text: "This app has no schema.sql. Upload a new version with one to provision.",
  },
  schema_invalid: {
    tone: "warning",
    text: "Your schema.sql contains a forbidden statement. Fix and re-upload.",
  },
  oauth_refresh_failed: {
    tone: "warning",
    text: "Supabase refused the stored credentials. Reconnect from Settings.",
  },
  sql_failed: { tone: "warning", text: "Supabase rejected the schema." },
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
  if (!app) notFound();

  const isOwner = app.owner_id === user.id;

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
    <Stack gap={8}>
      <PageHeader
        eyebrow={
          <Row gap={2}>
            <span>Apps</span>
            <span>›</span>
            <CodeBlock inline>{app.slug}</CodeBlock>
          </Row>
        }
        title={app.name}
        description={
          <Row gap={2} align="center">
            <Text size="md" tone="muted">
              v{app.current_version} · created {new Date(app.created_at).toLocaleDateString()}
            </Text>
            {app.schema_provisioned_at ? (
              <Badge tone="success">schema provisioned</Badge>
            ) : (
              <Badge tone="warning">schema pending</Badge>
            )}
          </Row>
        }
        actions={
          <Row gap={2}>
            <a
              href={`/a/${app.slug}`}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: space[1],
                padding: `${space[2]} ${space[4]}`,
                borderRadius: radii.md,
                border: `1px solid ${colors.bgInverse}`,
                background: colors.bgInverse,
                color: colors.textInverse,
                ...typography.size.base,
                fontWeight: typography.weight.medium,
                textDecoration: "none",
              }}
            >
              Open ↗
            </a>
          </Row>
        }
      />

      {banner ? <Alert tone={banner.tone}>{banner.text}</Alert> : null}

      {isOwner ? (
        <Stack gap={4}>
          <Heading level={2}>Schema</Heading>
          <Card>
            <Row gap={4} justify="space-between" align="center">
              <Stack gap={1}>
                <Text>
                  {app.schema_provisioned_at
                    ? `Last provisioned ${new Date(app.schema_provisioned_at).toLocaleString()}`
                    : "Schema not yet provisioned."}
                </Text>
                <Text size="sm" tone="muted">
                  Applies the stored <CodeBlock inline>schema.sql</CodeBlock> to{" "}
                  <CodeBlock inline>{app.schema_name}</CodeBlock> in your Supabase project.
                </Text>
              </Stack>
              <Row gap={2}>
                <form action={provisionSchemaAction}>
                  <input type="hidden" name="app_id" value={app.id} />
                  <Button type="submit">
                    {app.schema_provisioned_at ? "Re-provision" : "Provision"}
                  </Button>
                </form>
                <a
                  href={`/apps/${app.slug}/export`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: `${space[2]} ${space[4]}`,
                    borderRadius: radii.md,
                    border: `1px solid ${colors.borderStrong}`,
                    background: colors.bg,
                    color: colors.text,
                    ...typography.size.base,
                    fontWeight: typography.weight.medium,
                    textDecoration: "none",
                  }}
                >
                  Export bundle
                </a>
              </Row>
            </Row>
          </Card>
        </Stack>
      ) : null}

      {isOwner ? (
        <Stack gap={4}>
          <Heading level={2}>Collaborators</Heading>
          <Card padding="none">
            <MemberRow
              avatar={(user.email ?? "?")[0]?.toUpperCase() ?? "?"}
              email={user.email ?? ""}
              suffix={
                <Row gap={2} align="center">
                  <Badge tone="accent">owner</Badge>
                  <Text size="sm" tone="muted">
                    you
                  </Text>
                </Row>
              }
              isLast={collaborators.length === 0}
            />
            {collaborators.map((c, idx) => (
              <MemberRow
                key={c.user_id}
                avatar={c.email[0]?.toUpperCase() ?? "?"}
                email={c.email}
                suffix={
                  <Row gap={2} align="center">
                    <Badge tone={c.role === "editor" ? "accent" : "neutral"}>{c.role}</Badge>
                    <Text size="sm" tone="muted">
                      since {new Date(c.granted_at).toLocaleDateString()}
                    </Text>
                  </Row>
                }
                actions={
                  <form action={removeCollaboratorAction}>
                    <input type="hidden" name="slug" value={app.slug} />
                    <input type="hidden" name="user_id" value={c.user_id} />
                    <Button type="submit" size="sm" variant="danger">
                      Remove
                    </Button>
                  </form>
                }
                isLast={idx === collaborators.length - 1}
              />
            ))}
          </Card>

          {pendingInvitations.length > 0 ? (
            <Stack gap={3}>
              <Text size="md" tone="muted" style={{ fontWeight: typography.weight.medium }}>
                Pending invitations
              </Text>
              <Stack gap={2}>
                {pendingInvitations.map((inv) => (
                  <Card
                    key={inv.id}
                    padding="compact"
                    style={{ background: colors.warningBg, borderColor: colors.warningBorder }}
                  >
                    <Stack gap={3}>
                      <Row gap={3} justify="space-between" align="center">
                        <Row gap={2} align="center">
                          <Text style={{ fontWeight: typography.weight.medium }}>{inv.email}</Text>
                          <Badge tone="warning">{inv.role}</Badge>
                          <Text size="sm" tone="muted">
                            expires {new Date(inv.expires_at).toLocaleDateString()}
                          </Text>
                        </Row>
                        <form action={cancelInvitationAction}>
                          <input type="hidden" name="slug" value={app.slug} />
                          <input type="hidden" name="invitation_id" value={inv.id} />
                          <Button type="submit" size="sm" variant="danger">
                            Cancel
                          </Button>
                        </form>
                      </Row>
                      <CodeBlock
                        style={{
                          fontSize: "0.8125rem",
                          padding: `${space[2]} ${space[3]}`,
                          background: colors.bg,
                          wordBreak: "break-all" as const,
                          whiteSpace: "pre-wrap" as const,
                          userSelect: "all" as const,
                        }}
                      >
                        {invitationUrl(pendingOrigin, inv.token)}
                      </CodeBlock>
                    </Stack>
                  </Card>
                ))}
              </Stack>
            </Stack>
          ) : null}

          <Card>
            <Stack gap={3}>
              <Text size="md" style={{ fontWeight: typography.weight.medium }}>
                Invite by email
              </Text>
              <form action={inviteCollaboratorAction}>
                <Row gap={2} align="flex-end" wrap={false}>
                  <input type="hidden" name="slug" value={app.slug} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                      name="email"
                      type="email"
                      placeholder="collaborator@example.com"
                      required
                      style={{
                        width: "100%",
                        padding: `${space[2]} ${space[3]}`,
                        borderRadius: radii.md,
                        border: `1px solid ${colors.borderStrong}`,
                        background: colors.bg,
                        color: colors.text,
                        fontFamily: typography.fontSans,
                        ...typography.size.base,
                        transition: `border-color ${motion.fast}, box-shadow ${motion.fast}`,
                      }}
                    />
                  </div>
                  <select
                    name="role"
                    defaultValue="viewer"
                    style={{
                      padding: `${space[2]} ${space[3]}`,
                      borderRadius: radii.md,
                      border: `1px solid ${colors.borderStrong}`,
                      background: colors.bg,
                      color: colors.text,
                      fontFamily: typography.fontSans,
                      ...typography.size.base,
                    }}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                  </select>
                  <Button type="submit" variant="primary">
                    Invite
                  </Button>
                </Row>
              </form>
              <Text size="sm" tone="muted">
                Invitees with a Buendia account get access immediately. Otherwise, an invite link
                appears under <em>Pending invitations</em>; copy and share it.
              </Text>
            </Stack>
          </Card>
        </Stack>
      ) : null}

      {isOwner ? (
        <Stack gap={4}>
          <Heading level={2}>Settings</Heading>
          <Card>
            <Stack gap={4}>
              <Text size="md" style={{ fontWeight: typography.weight.medium }}>
                Rename app
              </Text>
              <form action={renameAppAction}>
                <Row gap={2} align="flex-end" wrap={false}>
                  <input type="hidden" name="slug" value={app.slug} />
                  <div style={{ flex: 1 }}>
                    <Input name="name" type="text" defaultValue={app.name} required />
                  </div>
                  <Button type="submit">Rename</Button>
                </Row>
              </form>
            </Stack>
          </Card>

          <Card style={{ borderColor: colors.dangerBorder, background: colors.dangerBg }}>
            <details>
              <summary
                style={{
                  cursor: "pointer",
                  color: colors.danger,
                  fontWeight: typography.weight.semibold,
                  ...typography.size.base,
                }}
              >
                Delete this app
              </summary>
              <Stack gap={3} style={{ marginTop: space[3] }}>
                <Text size="md" style={{ color: "#7f1d1d", lineHeight: 1.6 }}>
                  Drops the <CodeBlock inline>{app.schema_name}</CodeBlock> schema in your Supabase
                  project, removes the stored HTML, deletes the app record + all shares + version
                  history. Can't be undone.
                </Text>
                <form action={deleteAppAction}>
                  <input type="hidden" name="slug" value={app.slug} />
                  <Button type="submit" variant="danger">
                    Delete app permanently
                  </Button>
                </form>
              </Stack>
            </details>
          </Card>
        </Stack>
      ) : null}
    </Stack>
  );
}

function MemberRow({
  avatar,
  email,
  suffix,
  actions,
  isLast,
}: {
  avatar: string;
  email: string;
  suffix?: React.ReactNode;
  actions?: React.ReactNode;
  isLast: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: space[4],
        padding: `${space[3]} ${space[5]}`,
        borderBottom: isLast ? "none" : `1px solid ${colors.border}`,
      }}
    >
      <Row gap={3} align="center" wrap={false} style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            width: "2rem",
            height: "2rem",
            borderRadius: radii.pill,
            background: colors.bgSubtle,
            color: colors.textMuted,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            ...typography.size.sm,
            fontWeight: typography.weight.semibold,
          }}
        >
          {avatar}
        </div>
        <div style={{ minWidth: 0 }}>
          <Text style={{ fontWeight: typography.weight.medium, color: colors.text }}>{email}</Text>
          {suffix ? <div style={{ marginTop: space[1] }}>{suffix}</div> : null}
        </div>
      </Row>
      {actions}
    </div>
  );
}
