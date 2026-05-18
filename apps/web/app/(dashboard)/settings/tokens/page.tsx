import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createPersonalAccessTokenAction,
  revokePersonalAccessTokenAction,
} from "@/app/actions/personal-access-tokens";
import { readRevealedPat } from "@/lib/pat-reveal-cookie";
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
  radii,
  space,
  typography,
} from "@/lib/ui";
import { ClearRevealOnMount } from "./clear-reveal";

export const metadata = { title: "Access tokens · Buendia" };

interface PageProps {
  searchParams: Promise<{ create?: string; revoke?: string }>;
}

const createMessages: Record<string, { tone: "success" | "warning"; text: string }> = {
  ok: { tone: "success", text: "Token created. Copy it now — Buendia won't show it again." },
  missing_name: {
    tone: "warning",
    text: "Give the token a short name so you can identify it later.",
  },
  unauthenticated: { tone: "warning", text: "Sign in and try again." },
  write_failed: { tone: "warning", text: "Couldn't save the token. Please try again." },
};

const revokeMessages: Record<string, { tone: "success" | "warning"; text: string }> = {
  ok: { tone: "success", text: "Token revoked. Any client using it will start getting 401s." },
  not_found: { tone: "warning", text: "Couldn't find that token to revoke." },
  unauthenticated: { tone: "warning", text: "Sign in and try again." },
};

const claudeSnippet = `{
  "mcpServers": {
    "buendia": {
      "command": "npx",
      "args": ["-y", "@buendia/mcp"],
      "env": { "BUENDIA_PAT": "\${BUENDIA_PAT}" }
    }
  }
}`;

export default async function TokensPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin?next=/settings/tokens");

  const { data: tokens } = await supabase
    .from("personal_access_tokens")
    .select("id, name, token_prefix, last_used_at, created_at, revoked_at")
    .order("created_at", { ascending: false });

  const { create: createParam, revoke: revokeParam } = await searchParams;
  const banner =
    (revokeParam && revokeMessages[revokeParam]) ||
    (createParam && createParam !== "ok" && createMessages[createParam]) ||
    undefined;

  const revealed = createParam === "ok" ? await readRevealedPat() : null;

  return (
    <Stack gap={8}>
      <PageHeader
        eyebrow={
          <Link href="/settings" style={{ color: "inherit", textDecoration: "none" }}>
            ← Settings
          </Link>
        }
        title="Access tokens"
        description="Personal access tokens authenticate non-browser clients (Claude MCP, curl, scripts) against Buendia. They act on your behalf — treat them like passwords."
      />

      {banner ? <Alert tone={banner.tone}>{banner.text}</Alert> : null}

      {revealed ? (
        <Alert tone="warning" title="Copy this token now — Buendia won't show it again.">
          <CodeBlock
            style={{
              background: colors.bg,
              marginTop: space[2],
              wordBreak: "break-all" as const,
              whiteSpace: "pre-wrap" as const,
              userSelect: "all" as const,
            }}
          >
            {revealed.plaintext}
          </CodeBlock>
          <ClearRevealOnMount />
        </Alert>
      ) : null}

      <Stack gap={4}>
        <Heading level={2}>Create a token</Heading>
        <Card>
          <form action={createPersonalAccessTokenAction}>
            <Row gap={3} align="flex-end" wrap={false}>
              <div style={{ flex: 1, minWidth: "12rem" }}>
                <Input
                  name="name"
                  required
                  maxLength={80}
                  label="Name"
                  placeholder="claude-mcp on laptop"
                  helpText="A short label that helps you remember which client this token is for."
                />
              </div>
              <Button type="submit" variant="primary">
                Create token
              </Button>
            </Row>
          </form>
        </Card>
      </Stack>

      <Stack gap={4}>
        <Heading level={2}>Use with Claude</Heading>
        <Card>
          <Stack gap={3}>
            <Text tone="muted">
              Buendia ships a Model Context Protocol server. Export the token in your shell, then
              paste this into Claude Desktop or Claude Code:
            </Text>
            <CodeBlock>{claudeSnippet}</CodeBlock>
            <Text size="sm" tone="muted">
              Full walkthrough →{" "}
              <Link href="/docs/mcp" style={{ color: colors.textAccent }}>
                /docs/mcp
              </Link>
            </Text>
          </Stack>
        </Card>
      </Stack>

      <Stack gap={4}>
        <Heading level={2}>Your tokens</Heading>
        {!tokens || tokens.length === 0 ? (
          <Card>
            <Text tone="muted">
              No tokens yet. Create one above when you're ready to wire up Claude or a script.
            </Text>
          </Card>
        ) : (
          <Card padding="none">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(10rem, 1fr) 8rem 10rem 8rem",
                gap: space[4],
                padding: `${space[3]} ${space[5]}`,
                borderBottom: `1px solid ${colors.border}`,
                background: colors.bgMuted,
                borderTopLeftRadius: radii.lg,
                borderTopRightRadius: radii.lg,
                color: colors.textMuted,
                ...typography.size.xs,
                fontWeight: typography.weight.medium,
                textTransform: "uppercase" as const,
                letterSpacing: "0.05em",
              }}
            >
              <div>Name</div>
              <div>Prefix</div>
              <div>Last used</div>
              <div style={{ textAlign: "right" }}>Status</div>
            </div>
            {tokens.map((token, idx) => (
              <div
                key={token.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(10rem, 1fr) 8rem 10rem 8rem",
                  gap: space[4],
                  padding: `${space[4]} ${space[5]}`,
                  borderBottom: idx === tokens.length - 1 ? "none" : `1px solid ${colors.border}`,
                  ...typography.size.base,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontWeight: typography.weight.medium }}>{token.name}</Text>
                <Text size="md" tone="muted" mono>
                  {token.token_prefix}…
                </Text>
                <Text size="md" tone="muted">
                  {token.last_used_at ? new Date(token.last_used_at).toLocaleString() : "never"}
                </Text>
                <div style={{ textAlign: "right" }}>
                  {token.revoked_at ? (
                    <Badge tone="neutral">
                      revoked {new Date(token.revoked_at).toLocaleDateString()}
                    </Badge>
                  ) : (
                    <form action={revokePersonalAccessTokenAction} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={token.id} />
                      <Button type="submit" size="sm" variant="danger">
                        Revoke
                      </Button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </Card>
        )}
      </Stack>
    </Stack>
  );
}
