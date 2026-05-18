import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getOwnerBackendStatus } from "@/lib/owner-backend";
import {
  Alert,
  Badge,
  Card,
  CodeBlock,
  Heading,
  LinkButton,
  PageHeader,
  Row,
  Stack,
  Text,
  colors,
  space,
  typography,
} from "@/lib/ui";
import { UploadForm } from "./_components/upload-form";
import { EmptyState } from "./_components/empty-state";

export const metadata = { title: "Apps · Buendia" };

interface PageProps {
  searchParams: Promise<{
    upload?: string;
    provision_schema?: string;
    slug?: string;
    delete?: string;
  }>;
}

type Banner = { tone: "success" | "warning"; text: (slug?: string) => string };

const deleteMessages: Record<string, Banner> = {
  ok: { tone: "success", text: () => "App deleted." },
  unauthenticated: { tone: "warning", text: () => "Sign in and try again." },
  not_found: { tone: "warning", text: () => "Couldn't find that app." },
  not_owner: { tone: "warning", text: () => "Only the owner can delete this app." },
  not_connected: {
    tone: "warning",
    text: () => "Couldn't reach your Supabase project to drop the schema.",
  },
  schema_drop_failed: {
    tone: "warning",
    text: () =>
      "Dropping the app's schema in your Supabase project failed; the metadata stays put until you retry.",
  },
  db_delete_failed: {
    tone: "warning",
    text: () => "Couldn't delete the app record. Please try again.",
  },
};

const uploadMessages: Record<string, Banner> = {
  ok: {
    tone: "success",
    text: (slug) =>
      slug ? `Uploaded. Open it from /a/${slug}, or click Open below.` : "Uploaded.",
  },
  missing_file: { tone: "warning", text: () => "Pick an HTML file before submitting." },
  not_html: { tone: "warning", text: () => "Only single .html files are accepted." },
  too_big: { tone: "warning", text: () => "HTML files must be 5 MB or smaller." },
  storage_failed: {
    tone: "warning",
    text: () => "Buendia couldn't store the file. Please try again.",
  },
  db_failed: {
    tone: "warning",
    text: () => "Buendia couldn't register the app. Please try again.",
  },
};

const provisionMessages: Record<string, Banner> = {
  ok: { tone: "success", text: (slug) => `Schema provisioned${slug ? ` for ${slug}` : ""}.` },
  unauthenticated: { tone: "warning", text: () => "Sign in and try again." },
  not_found: { tone: "warning", text: () => "Couldn't find that app." },
  not_connected: {
    tone: "warning",
    text: () => "Provision a Supabase project in Settings before running schemas.",
  },
  no_schema: {
    tone: "warning",
    text: (slug) =>
      `The latest version of ${slug ?? "this app"} has no schema.sql. Upload a new version with one to provision.`,
  },
  schema_invalid: {
    tone: "warning",
    text: (slug) =>
      `The schema.sql for ${slug ?? "this app"} contains a forbidden statement. Fix and re-upload.`,
  },
  oauth_refresh_failed: {
    tone: "warning",
    text: () => "Supabase refused the stored credentials. Reconnect from Settings.",
  },
  sql_failed: {
    tone: "warning",
    text: (slug) => `Supabase rejected the schema for ${slug ?? "this app"}.`,
  },
};

export default async function MyAppsPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const backend = user ? await getOwnerBackendStatus(user.id) : null;

  const { data: apps } = await supabase
    .from("apps")
    .select("id, slug, name, current_version, created_at, schema_provisioned_at")
    .order("created_at", { ascending: false });

  const params = await searchParams;
  const banner =
    (params.delete && deleteMessages[params.delete]) ||
    (params.provision_schema && provisionMessages[params.provision_schema]) ||
    (params.upload && uploadMessages[params.upload]) ||
    undefined;

  return (
    <Stack gap={8}>
      <PageHeader
        title="Apps"
        description="Apps you've uploaded to Buendia. Each one runs on a per-app schema in your own Supabase project."
        actions={
          backend?.hasProject && apps && apps.length > 0 ? (
            <LinkButton href="#upload" variant="primary">
              Upload app
            </LinkButton>
          ) : undefined
        }
      />

      {banner ? <Alert tone={banner.tone}>{banner.text(params.slug)}</Alert> : null}

      {!backend?.hasProject ? (
        <EmptyState
          title="Connect a Supabase project first"
          body="Buendia stores app HTML on the control plane, but each app's data lives in a Supabase project you own. Set that up in Settings, then come back here to upload."
          action={
            <LinkButton href="/settings" variant="primary">
              Go to Settings
            </LinkButton>
          }
        />
      ) : !apps || apps.length === 0 ? (
        <Stack gap={3}>
          <Heading level={2}>Upload your first app</Heading>
          <Card>
            <UploadForm />
          </Card>
        </Stack>
      ) : (
        <>
          <Stack gap={3}>
            <Heading level={2}>Your apps</Heading>
            <AppList apps={apps} />
          </Stack>
          <Stack gap={3} id="upload">
            <Heading level={2}>Upload another</Heading>
            <Card>
              <UploadForm />
            </Card>
          </Stack>
        </>
      )}
    </Stack>
  );
}

interface AppRow {
  id: string;
  slug: string;
  name: string;
  current_version: number;
  created_at: string;
  schema_provisioned_at: string | null;
}

function AppList({ apps }: { apps: AppRow[] }) {
  return (
    <Stack gap={2}>
      {apps.map((app) => (
        <Card key={app.id} padding="compact">
          <Row gap={4} align="center" justify="space-between">
            <div style={{ flex: 1, minWidth: 0 }}>
              <Link
                href={`/apps/${app.slug}`}
                style={{
                  fontWeight: typography.weight.medium,
                  textDecoration: "none",
                  color: colors.text,
                  ...typography.size.base,
                }}
              >
                {app.name}
              </Link>
              <Row gap={2} align="center" style={{ marginTop: space[1] }}>
                <Text size="sm" tone="muted">
                  <CodeBlock inline>{app.slug}</CodeBlock> · v{app.current_version} ·{" "}
                  {new Date(app.created_at).toLocaleDateString()}
                </Text>
                {app.schema_provisioned_at ? (
                  <Badge tone="success">schema provisioned</Badge>
                ) : (
                  <Badge tone="warning">schema pending</Badge>
                )}
              </Row>
            </div>
            <Row gap={2} align="center" wrap={false}>
              <LinkButton href={`/apps/${app.slug}`} size="sm">
                Manage
              </LinkButton>
              <a
                href={`/a/${app.slug}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: space[1],
                  padding: `${space[1]} ${space[3]}`,
                  borderRadius: "0.375rem",
                  border: `1px solid ${colors.borderStrong}`,
                  background: colors.bg,
                  color: colors.text,
                  ...typography.size.md,
                  fontWeight: typography.weight.medium,
                  textDecoration: "none",
                }}
              >
                Open ↗
              </a>
            </Row>
          </Row>
        </Card>
      ))}
    </Stack>
  );
}
