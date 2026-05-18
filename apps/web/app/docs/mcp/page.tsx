import Link from "next/link";
import { headers } from "next/headers";
import { PRODUCT_NAME } from "@buendia/shared";
import { CodeBlock, Container, Heading, Stack, Text, colors, space, typography } from "@/lib/ui";

export const metadata = { title: `Use with Claude · ${PRODUCT_NAME}` };

function claudeConfigSnippet(host: string): string {
  return `{
  "mcpServers": {
    "buendia": {
      "command": "npx",
      "args": ["-y", "@buendia/mcp"],
      "env": {
        "BUENDIA_PAT": "\${BUENDIA_PAT}"${
          host === "https://buendia.app" ? "" : `,\n        "BUENDIA_BASE_URL": "${host}"`
        }
      }
    }
  }
}`;
}

async function originForSnippet(): Promise<string> {
  try {
    const h = await headers();
    const xfHost = h.get("x-forwarded-host") ?? h.get("host");
    const xfProto = h.get("x-forwarded-proto") ?? "https";
    if (xfHost && !xfHost.startsWith("localhost")) return `${xfProto}://${xfHost}`;
  } catch {
    // headers() throws if called outside a request context.
  }
  return "https://buendia.app";
}

export default async function McpDocsPage() {
  const origin = await originForSnippet();
  const snippet = claudeConfigSnippet(origin);

  return (
    <Container width="prose" padY={16}>
      <Stack gap={8}>
        <header>
          <Link
            href="/"
            style={{ fontSize: "0.875rem", color: colors.textMuted, textDecoration: "none" }}
          >
            ← {PRODUCT_NAME}
          </Link>
          <Heading level={1} style={{ marginTop: space[3] }}>
            Use {PRODUCT_NAME} with Claude
          </Heading>
          <Text size="lg" tone="muted" style={{ marginTop: space[2] }}>
            Generate a single-file HTML app in Claude and host it on {PRODUCT_NAME} without leaving
            the chat.
          </Text>
        </header>

        <Text tone="muted" style={{ lineHeight: 1.65 }}>
          {PRODUCT_NAME} ships a{" "}
          <Link href="https://modelcontextprotocol.io/" style={{ color: colors.textAccent }}>
            Model Context Protocol
          </Link>{" "}
          server: a small program Claude can call as a tool. Once it's wired up, you can say things
          like <em>"build me a project tracker and host it on Buendia"</em> and Claude will generate
          the HTML, decide on a schema, upload everything, and hand you a URL. No terminal required
          after the one-time setup.
        </Text>

        <Stack gap={3}>
          <Heading level={3}>1. Mint an access token</Heading>
          <Text tone="muted" style={{ lineHeight: 1.65 }}>
            Open{" "}
            <Link href="/settings/tokens" style={{ color: colors.textAccent }}>
              /settings/tokens
            </Link>{" "}
            and create a token named something memorable like{" "}
            <CodeBlock inline>claude-mcp on laptop</CodeBlock>. Copy the token — {PRODUCT_NAME} only
            shows it once.
          </Text>
        </Stack>

        <Stack gap={3}>
          <Heading level={3}>2. Put the token in your shell</Heading>
          <Text tone="muted" style={{ lineHeight: 1.65 }}>
            Export the token from your shell rather than pasting it into a JSON file. That way it
            stays out of any config you might accidentally commit:
          </Text>
          <CodeBlock>{`# macOS / Linux (~/.zshrc or ~/.bash_profile)
export BUENDIA_PAT=buendia_pat_paste-yours-here

# Windows PowerShell ($PROFILE)
$env:BUENDIA_PAT = "buendia_pat_paste-yours-here"`}</CodeBlock>
          <Text size="sm" tone="muted">
            Restart your terminal (or run <CodeBlock inline>source ~/.zshrc</CodeBlock>) so the new
            variable is visible to Claude.
          </Text>
        </Stack>

        <Stack gap={3}>
          <Heading level={3}>3. Tell Claude about Buendia</Heading>
          <Text tone="muted" style={{ lineHeight: 1.65 }}>
            Add this block to Claude's MCP config — same shape works for Claude Desktop and Claude
            Code:
          </Text>
          <Text size="sm" tone="muted" style={{ lineHeight: 1.55 }}>
            <strong style={{ color: colors.text, fontWeight: typography.weight.semibold }}>
              Claude Desktop
            </strong>{" "}
            — macOS:{" "}
            <CodeBlock inline>
              ~/Library/Application Support/Claude/claude_desktop_config.json
            </CodeBlock>
            ; Windows: <CodeBlock inline>%APPDATA%\Claude\claude_desktop_config.json</CodeBlock>.
            <br />
            <strong style={{ color: colors.text, fontWeight: typography.weight.semibold }}>
              Claude Code
            </strong>
            : <CodeBlock inline>~/.claude/settings.json</CodeBlock>.
          </Text>
          <CodeBlock>{snippet}</CodeBlock>
          <Text size="sm" tone="muted">
            The <CodeBlock inline>{"${BUENDIA_PAT}"}</CodeBlock> placeholder reads the env var you
            just set; the token itself never lands in the config file. Restart Claude so it picks up
            the new MCP server.
          </Text>
        </Stack>

        <Stack gap={3}>
          <Heading level={3}>4. Try it</Heading>
          <Text tone="muted">Open Claude and send any of these:</Text>
          <ul style={{ paddingLeft: space[5], color: colors.textMuted, lineHeight: 1.7 }}>
            <li>
              <em>
                "Build me a tiny project tracker with todos and statuses and host it on Buendia.
                Don't ask me to confirm — just ship it."
              </em>
            </li>
            <li>
              <em>"Show me what apps I have on Buendia."</em>
            </li>
            <li>
              <em>"Invite alice@example.com as an editor on the project-tracker app."</em>
            </li>
          </ul>
          <Text tone="muted" style={{ lineHeight: 1.65 }}>
            Claude will call <CodeBlock inline>host_app</CodeBlock>,{" "}
            <CodeBlock inline>provision_schema</CodeBlock>, and{" "}
            <CodeBlock inline>invite_collaborator</CodeBlock> as needed. The dashboard (
            <Link href="/" style={{ color: colors.textAccent }}>
              /
            </Link>
            ) reflects every change in real time.
          </Text>
        </Stack>

        <Stack gap={3}>
          <Heading level={3}>Which tools the server adds</Heading>
          <Text tone="muted" style={{ lineHeight: 1.65 }}>
            Eight tools, one per HTTP endpoint. Claude picks the right one based on what you ask
            for:
          </Text>
          <ul style={{ paddingLeft: space[5], color: colors.textMuted, lineHeight: 1.7 }}>
            <li>
              <CodeBlock inline>whoami</CodeBlock> — confirm the token is wired up.
            </li>
            <li>
              <CodeBlock inline>list_apps</CodeBlock> — show owned + shared apps.
            </li>
            <li>
              <CodeBlock inline>host_app</CodeBlock> — upload the HTML (plus optional{" "}
              <CodeBlock inline>schema_sql</CodeBlock>).
            </li>
            <li>
              <CodeBlock inline>get_app</CodeBlock>, <CodeBlock inline>delete_app</CodeBlock> —
              single-app read + delete.
            </li>
            <li>
              <CodeBlock inline>provision_schema</CodeBlock> — apply the stored{" "}
              <CodeBlock inline>schema_sql</CodeBlock> to your Supabase project.
            </li>
            <li>
              <CodeBlock inline>invite_collaborator</CodeBlock>,{" "}
              <CodeBlock inline>remove_collaborator</CodeBlock> — share by email; remove by user or
              email.
            </li>
          </ul>
        </Stack>

        <Stack gap={3}>
          <Heading level={3}>Revoking access</Heading>
          <Text tone="muted" style={{ lineHeight: 1.65 }}>
            To stop a Claude install from acting on your behalf, open{" "}
            <Link href="/settings/tokens" style={{ color: colors.textAccent }}>
              /settings/tokens
            </Link>{" "}
            and click <strong>Revoke</strong>. The next tool call surfaces a 401 to Claude with a
            hint about reconnecting. The token's plaintext is never recoverable from {PRODUCT_NAME}{" "}
            — if you lost it, revoke and mint a fresh one.
          </Text>
        </Stack>

        <Stack gap={3}>
          <Heading level={3}>Troubleshooting</Heading>
          <Text tone="muted">
            <strong style={{ color: colors.text }}>401 every call.</strong> The token is wrong or
            revoked. Mint a new one and update <CodeBlock inline>BUENDIA_PAT</CodeBlock>.
          </Text>
          <Text tone="muted">
            <strong style={{ color: colors.text }}>502 from provisioning.</strong> {PRODUCT_NAME}{" "}
            couldn't reach your Supabase project. Open{" "}
            <Link href="/settings" style={{ color: colors.textAccent }}>
              /settings
            </Link>
            ; if a <em>Supabase connection broken</em> banner is showing, click{" "}
            <strong>Reconnect</strong>.
          </Text>
          <Text tone="muted">
            <strong style={{ color: colors.text }}>Schema rejected.</strong> Claude wrote SQL with a{" "}
            <CodeBlock inline>public.</CodeBlock> prefix or a <CodeBlock inline>grant</CodeBlock>{" "}
            statement. Ask it to retry without those — {PRODUCT_NAME} mounts your SQL inside a
            per-app schema and writes the RLS policies for you.
          </Text>
        </Stack>

        <footer
          style={{
            borderTop: `1px solid ${colors.border}`,
            paddingTop: space[6],
            color: colors.textMuted,
            ...typography.size.sm,
          }}
        >
          <Link href="/" style={{ color: "inherit", marginRight: space[4] }}>
            ← Back to {PRODUCT_NAME}
          </Link>
          <Link
            href="https://github.com/luisgrandegg/buendia/tree/main/packages/mcp"
            style={{ color: "inherit", marginRight: space[4] }}
          >
            @buendia/mcp on GitHub
          </Link>
          <Link href="https://modelcontextprotocol.io/" style={{ color: "inherit" }}>
            About MCP
          </Link>
        </footer>
      </Stack>
    </Container>
  );
}
