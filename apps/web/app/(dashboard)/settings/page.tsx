import { provisionProjectAction, refreshCredentialsAction } from "@/app/actions/owner-backend";
import { createClient } from "@/lib/supabase/server";
import { getOwnerBackendStatus } from "@/lib/owner-backend";
import {
  Alert,
  Badge,
  Button,
  Card,
  DescriptionRow,
  Heading,
  LinkButton,
  PageHeader,
  Row,
  Stack,
  Text,
  colors,
  space,
} from "@/lib/ui";

export const metadata = { title: "Settings · Buendia" };

const supabaseMessages: Record<string, { tone: "success" | "warning"; text: string }> = {
  ok: { tone: "success", text: "Supabase connected. Provision your project to finish." },
  denied: {
    tone: "warning",
    text: "You declined the Supabase authorization. You can retry whenever you're ready.",
  },
  error: {
    tone: "warning",
    text: "Something went wrong during the Supabase handshake. Please try again.",
  },
};

const provisionMessages: Record<string, { tone: "success" | "warning"; text: string }> = {
  ok: { tone: "success", text: "Your Buendia Apps project is ready." },
  unauthenticated: { tone: "warning", text: "Sign in and try again." },
  not_connected: { tone: "warning", text: "Connect Supabase before provisioning a project." },
  oauth_refresh_failed: {
    tone: "warning",
    text: "Supabase refused the stored credentials. Disconnect and reconnect to retry.",
  },
  list_orgs_failed: {
    tone: "warning",
    text: "Couldn't read your Supabase organizations. Please try again.",
  },
  no_organization: {
    tone: "warning",
    text: "Create a Supabase organization first, then provision again.",
  },
  free_tier_limit: {
    tone: "warning",
    text: "Your Supabase organization is at the free-tier project limit. Free up a slot or upgrade in Supabase, then try again.",
  },
  create_project_failed: {
    tone: "warning",
    text: "Supabase rejected the project creation. Please try again.",
  },
  project_unhealthy: {
    tone: "warning",
    text: "The new project didn't reach a healthy state. Try again or check Supabase's status.",
  },
  still_provisioning: {
    tone: "warning",
    text: "Supabase is still preparing your project. Refresh this page in a moment.",
  },
  fetch_keys_failed: {
    tone: "warning",
    text: "Project created, but Buendia couldn't read its API keys. Try the provision step again.",
  },
  persist_failed: {
    tone: "warning",
    text: "Project created, but Buendia couldn't save its credentials. Try again.",
  },
};

const disconnectMessages: Record<string, { tone: "success" | "warning"; text: string }> = {
  ok: {
    tone: "success",
    text: "Disconnected. Your Supabase project + data are untouched and will keep running.",
  },
  write_failed: {
    tone: "warning",
    text: "Couldn't clear the stored credentials. Please try again.",
  },
};

const refreshCredsMessages: Record<string, { tone: "success" | "warning"; text: string }> = {
  ok: { tone: "success", text: "Credentials refreshed from Supabase." },
  unauthenticated: { tone: "warning", text: "Sign in and try again." },
  not_connected: {
    tone: "warning",
    text: "Connect Supabase first before refreshing credentials.",
  },
  no_project: {
    tone: "warning",
    text: "Provision your project first, then refresh credentials.",
  },
  oauth_refresh_failed: {
    tone: "warning",
    text: "Supabase refused the stored OAuth grant. Reconnect from this page to recover.",
  },
  fetch_keys_failed: {
    tone: "warning",
    text: "Couldn't read the project's API keys. Please try again.",
  },
  persist_failed: {
    tone: "warning",
    text: "Got fresh keys from Supabase but couldn't save them. Try again.",
  },
};

interface PageProps {
  searchParams: Promise<{
    supabase?: string;
    provision?: string;
    disconnect?: string;
    refresh_creds?: string;
  }>;
}

export default async function SettingsPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const status = user ? await getOwnerBackendStatus(user.id) : null;
  const params = await searchParams;
  const banner =
    (params.refresh_creds && refreshCredsMessages[params.refresh_creds]) ||
    (params.disconnect && disconnectMessages[params.disconnect]) ||
    (params.provision && provisionMessages[params.provision]) ||
    (params.supabase && supabaseMessages[params.supabase]) ||
    undefined;

  const grantRevoked = status?.exists && status.grantStatus === "revoked";

  return (
    <Stack gap={8}>
      <PageHeader
        title="Settings"
        description="Account, connected backend, access tokens. Everything Buendia knows about you."
      />

      {grantRevoked ? (
        <Alert
          tone="danger"
          title="Supabase connection broken"
          action={
            <form action="/api/auth/supabase/start" method="post">
              <Button type="submit" size="sm" variant="danger">
                Reconnect Supabase
              </Button>
            </form>
          }
        >
          The OAuth grant Buendia held was revoked (possibly from your Supabase dashboard). Apps are
          temporarily unavailable until you reconnect.
        </Alert>
      ) : null}

      {banner ? <Alert tone={banner.tone}>{banner.text}</Alert> : null}

      <Stack gap={4}>
        <Heading level={2}>Account</Heading>
        <Card padding="none">
          <div style={{ padding: `0 ${space[5]}` }}>
            <DescriptionRow label="Email">{user?.email ?? "—"}</DescriptionRow>
            <div style={{ marginBottom: -1 }}>
              <DescriptionRow label="User ID">
                <code style={{ fontSize: "0.875em" }}>{user?.id ?? "—"}</code>
              </DescriptionRow>
            </div>
          </div>
        </Card>
      </Stack>

      <Stack gap={4}>
        <Heading level={2}>Connected backend</Heading>
        {!status?.exists ? (
          <ConnectSupabaseCta />
        ) : status.hasProject ? (
          <ConnectedBackendDetails status={status} />
        ) : (
          <ProvisionProjectCta connectedAt={status.connectedAt} />
        )}
      </Stack>

      <Stack gap={4}>
        <Heading level={2}>Access tokens</Heading>
        <Card>
          <Stack gap={4}>
            <Text tone="muted">
              Mint personal access tokens for the Claude MCP server, curl scripts, or the upcoming
              CLI.
            </Text>
            <Row gap={3}>
              <LinkButton href="/settings/tokens">Manage tokens</LinkButton>
              <LinkButton href="/docs/mcp" variant="ghost">
                Use with Claude →
              </LinkButton>
            </Row>
          </Stack>
        </Card>
      </Stack>

      {status?.exists ? (
        <Stack gap={4}>
          <Heading level={2} style={{ color: colors.danger }}>
            Danger zone
          </Heading>
          <Card style={{ borderColor: colors.dangerBorder }}>
            <Row gap={4} justify="space-between" align="center">
              <Text tone="muted">
                Disconnect Buendia from your Supabase account. Your project and data stay; we just
                stop being involved.
              </Text>
              <LinkButton href="/settings/disconnect" variant="danger">
                Disconnect Buendia…
              </LinkButton>
            </Row>
          </Card>
        </Stack>
      ) : null}
    </Stack>
  );
}

function ConnectedBackendDetails({
  status,
}: {
  status: Awaited<ReturnType<typeof getOwnerBackendStatus>>;
}) {
  return (
    <Card padding="none">
      <div style={{ padding: `0 ${space[5]}` }}>
        <DescriptionRow label="Supabase">
          <Row gap={2}>
            <Badge tone="success">connected</Badge>
            <Text size="md" tone="muted">
              project provisioned
            </Text>
          </Row>
        </DescriptionRow>
        <DescriptionRow label="Connected at">
          {status.connectedAt ? new Date(status.connectedAt).toLocaleString() : "—"}
        </DescriptionRow>
        <DescriptionRow label="Last checked">
          {status.lastValidatedAt ? new Date(status.lastValidatedAt).toLocaleString() : "—"}
        </DescriptionRow>
      </div>
      <div style={{ padding: space[5], borderTop: `1px solid ${colors.border}` }}>
        <Row gap={3} align="center">
          <form action={refreshCredentialsAction}>
            <Button type="submit" size="sm">
              Refresh credentials
            </Button>
          </form>
          <Text size="sm" tone="muted">
            Re-fetches the project's API keys + JWT secret via the OAuth grant. Use this if you
            rotated keys in Supabase.
          </Text>
        </Row>
      </div>
    </Card>
  );
}

function ConnectSupabaseCta() {
  return (
    <Card>
      <Stack gap={4}>
        <Text tone="muted">
          To host your apps, Buendia needs to manage projects in your Supabase organization. You
          stay the owner; Buendia drops out cleanly if you disconnect.
        </Text>
        <form action="/api/auth/supabase/start" method="post">
          <Button type="submit" variant="primary">
            Connect Supabase
          </Button>
        </form>
      </Stack>
    </Card>
  );
}

function ProvisionProjectCta({ connectedAt }: { connectedAt: string | null }) {
  return (
    <Card padding="none">
      <div style={{ padding: `0 ${space[5]}` }}>
        <DescriptionRow label="Supabase">
          <Row gap={2}>
            <Badge tone="accent">OAuth complete</Badge>
            <Text size="md" tone="muted">
              project not yet provisioned
            </Text>
          </Row>
        </DescriptionRow>
        <DescriptionRow label="Connected at">
          {connectedAt ? new Date(connectedAt).toLocaleString() : "—"}
        </DescriptionRow>
      </div>
      <div style={{ padding: space[5], borderTop: `1px solid ${colors.border}` }}>
        <Stack gap={4}>
          <Text tone="muted">
            Buendia will create one project named "Buendia Apps" in your first Supabase
            organization. This takes 30–60 seconds. You can keep using the dashboard while it runs.
          </Text>
          <form action={provisionProjectAction}>
            <Button type="submit" variant="primary">
              Provision project
            </Button>
          </form>
        </Stack>
      </div>
    </Card>
  );
}
