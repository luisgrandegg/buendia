import Link from "next/link";
import { redirect } from "next/navigation";
import { disconnectBuendiaAction } from "@/app/actions/owner-backend";
import { createClient } from "@/lib/supabase/server";
import { getOwnerBackendStatus } from "@/lib/owner-backend";
import {
  Alert,
  Button,
  Card,
  Heading,
  LinkButton,
  PageHeader,
  Row,
  Stack,
  Text,
  colors,
  space,
} from "@/lib/ui";

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
    <Stack gap={8}>
      <PageHeader
        eyebrow={
          <Link href="/settings" style={{ color: "inherit", textDecoration: "none" }}>
            ← Settings
          </Link>
        }
        title="Disconnect Buendia"
        description="Buendia drops its credentials and stops serving your apps. Your Supabase project and data stay intact."
      />

      <Card>
        <Stack gap={3}>
          <Heading level={3}>What will happen</Heading>
          <ul
            style={{ paddingLeft: space[5], margin: 0, color: colors.textMuted, lineHeight: 1.6 }}
          >
            <li>
              Your encrypted Supabase credentials will be deleted from Buendia. We won't be able to
              mint JWTs or run schema operations on your behalf.
            </li>
            <li>
              Apps you uploaded will stay in your dashboard, but opening them via{" "}
              <code>/a/&lt;slug&gt;</code> will return "App not ready" until you reconnect.
            </li>
            <li>
              Your Supabase project, its schemas, and all the app data inside it stay untouched.
              They keep running whether Buendia is involved or not.
            </li>
            <li>Sharing grants stay in the database but become inert until you reconnect.</li>
          </ul>
        </Stack>
      </Card>

      {apps && apps.length > 0 ? (
        <Alert tone="warning" title="Export your apps first?">
          <Stack gap={3}>
            <Text size="md">
              Each export bundles <code>index.html</code> + <code>schema.sql</code> + a README so
              the app can run on any static host pointed at your Supabase project.
            </Text>
            <Stack gap={1}>
              {apps.map((app) => (
                <Link
                  key={app.id}
                  href={`/apps/${app.slug}/export`}
                  style={{ color: "inherit", textDecoration: "underline" }}
                >
                  Download {app.name}.zip
                </Link>
              ))}
            </Stack>
          </Stack>
        </Alert>
      ) : null}

      <Stack gap={4}>
        <Heading level={3}>Confirm</Heading>
        <Text tone="muted">
          Reconnecting is one click on the Settings page if you change your mind.
        </Text>
        <Row gap={3}>
          <LinkButton href="/settings">Cancel</LinkButton>
          <form action={disconnectBuendiaAction}>
            <Button
              type="submit"
              variant="primary"
              style={{ background: colors.danger, borderColor: colors.danger }}
            >
              Disconnect Buendia
            </Button>
          </form>
        </Row>
      </Stack>
    </Stack>
  );
}
