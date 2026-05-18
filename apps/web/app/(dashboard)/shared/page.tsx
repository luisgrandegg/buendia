import { createClient } from "@/lib/supabase/server";
import {
  Badge,
  Card,
  CodeBlock,
  LinkButton,
  PageHeader,
  Row,
  Stack,
  Text,
  colors,
  space,
  typography,
} from "@/lib/ui";
import { EmptyState } from "../_components/empty-state";

export const metadata = { title: "Shared with me · Buendia" };

export default async function SharedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: memberships } = user
    ? await supabase
        .from("app_members")
        .select("app_id, slug, name, role")
        .eq("user_id", user.id)
        .neq("role", "owner")
    : { data: null };

  return (
    <Stack gap={6}>
      <PageHeader
        title="Shared with me"
        description="Apps other people have invited you to collaborate on."
      />

      {!memberships || memberships.length === 0 ? (
        <EmptyState
          title="Nothing shared with you yet"
          body="When someone invites you to an app, it shows up here."
        />
      ) : (
        <Stack gap={2}>
          {memberships.map((m) => (
            <Card key={m.app_id} padding="compact">
              <Row gap={4} justify="space-between" align="center">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontWeight: typography.weight.medium, color: colors.text }}>
                    {m.name}
                  </Text>
                  <Row gap={2} align="center" style={{ marginTop: space[1] }}>
                    <Text size="sm" tone="muted">
                      <CodeBlock inline>{m.slug}</CodeBlock>
                    </Text>
                    <Badge tone={m.role === "editor" ? "accent" : "neutral"}>{m.role}</Badge>
                  </Row>
                </div>
                <Row gap={2} wrap={false}>
                  <LinkButton href={`/apps/${m.slug}`} size="sm">
                    Details
                  </LinkButton>
                  <a
                    href={`/a/${m.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: space[1],
                      padding: `${space[1]} ${space[3]}`,
                      borderRadius: "0.375rem",
                      border: `1px solid ${colors.bgInverse}`,
                      background: colors.bgInverse,
                      color: colors.textInverse,
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
      )}
    </Stack>
  );
}
