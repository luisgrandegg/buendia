import Link from "next/link";
import { headers } from "next/headers";
import { PRODUCT_NAME } from "@buendia/shared";

export const metadata = { title: `Use with Claude · ${PRODUCT_NAME}` };

const sectionStyle = {
  marginBottom: "2rem",
  fontSize: "0.9375rem",
  lineHeight: "1.65",
  color: "#374151",
};

const codeBlockStyle = {
  display: "block",
  padding: "0.875rem 1rem",
  borderRadius: "0.375rem",
  border: "1px solid #e5e7eb",
  background: "#f9fafb",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "0.8125rem",
  lineHeight: "1.55",
  whiteSpace: "pre" as const,
  overflowX: "auto" as const,
  color: "#111827",
};

const inlineCode = {
  fontFamily: "ui-monospace, monospace",
  fontSize: "0.875em",
  padding: "0.125rem 0.25rem",
  background: "#f3f4f6",
  borderRadius: "0.25rem",
};

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
  // Try to render the snippet against the actual host the user is reading
  // from, so a self-hosted Buendia gets a self-referential config.
  try {
    const h = await headers();
    const xfHost = h.get("x-forwarded-host") ?? h.get("host");
    const xfProto = h.get("x-forwarded-proto") ?? "https";
    if (xfHost && !xfHost.startsWith("localhost")) return `${xfProto}://${xfHost}`;
  } catch {
    // headers() throws if called outside a request context (e.g. during
    // static generation). Fall through to the default.
  }
  return "https://buendia.app";
}

export default async function McpDocsPage() {
  const origin = await originForSnippet();
  const snippet = claudeConfigSnippet(origin);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "3rem 1.5rem",
        maxWidth: "44rem",
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#111827",
      }}
    >
      <header style={{ marginBottom: "2rem" }}>
        <Link href="/" style={{ fontSize: "0.875rem", color: "#6b7280" }}>
          ← {PRODUCT_NAME}
        </Link>
        <h1 style={{ fontSize: "1.75rem", margin: "0.75rem 0 0.5rem 0" }}>
          Use {PRODUCT_NAME} with Claude
        </h1>
        <p style={{ color: "#4b5563", fontSize: "1rem", margin: 0 }}>
          Generate a single-file HTML app in Claude and host it on {PRODUCT_NAME} without leaving
          the chat.
        </p>
      </header>

      <section style={sectionStyle}>
        <p>
          {PRODUCT_NAME} ships a{" "}
          <Link href="https://modelcontextprotocol.io/" style={{ color: "#2563eb" }}>
            Model Context Protocol
          </Link>{" "}
          server: a small program Claude can call as a tool. Once it's wired up, you can say things
          like <em>"build me a project tracker and host it on Buendia"</em> and Claude will generate
          the HTML, decide on a schema, upload everything, and hand you a URL. No terminal required
          after the one-time setup.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ fontSize: "1.125rem", marginBottom: "0.5rem" }}>1. Mint an access token</h2>
        <p>
          Open{" "}
          <Link href="/settings/tokens" style={{ color: "#2563eb" }}>
            /settings/tokens
          </Link>{" "}
          and create a token named something memorable like{" "}
          <code style={inlineCode}>claude-mcp on laptop</code>. Copy the token — {PRODUCT_NAME} only
          shows it once.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ fontSize: "1.125rem", marginBottom: "0.5rem" }}>
          2. Put the token in your shell
        </h2>
        <p>
          Export the token from your shell rather than pasting it into a JSON file. That way it
          stays out of any config you might accidentally commit:
        </p>
        <code style={codeBlockStyle}>{`# macOS / Linux (~/.zshrc or ~/.bash_profile)
export BUENDIA_PAT=buendia_pat_paste-yours-here

# Windows PowerShell ($PROFILE)
$env:BUENDIA_PAT = "buendia_pat_paste-yours-here"`}</code>
        <p style={{ marginTop: "0.75rem" }}>
          Restart your terminal (or run <code style={inlineCode}>source ~/.zshrc</code>) so the new
          variable is visible to Claude.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ fontSize: "1.125rem", marginBottom: "0.5rem" }}>
          3. Tell Claude about Buendia
        </h2>
        <p>
          Add this block to Claude's MCP config — same shape works for Claude Desktop and Claude
          Code:
        </p>
        <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "0.25rem" }}>
          <strong>Claude Desktop</strong> — macOS:{" "}
          <code style={inlineCode}>
            ~/Library/Application Support/Claude/claude_desktop_config.json
          </code>
          ; Windows: <code style={inlineCode}>%APPDATA%\Claude\claude_desktop_config.json</code>.
          <br />
          <strong>Claude Code</strong>: <code style={inlineCode}>~/.claude/settings.json</code>.
        </p>
        <code style={codeBlockStyle}>{snippet}</code>
        <p style={{ marginTop: "0.75rem" }}>
          The <code style={inlineCode}>{"${BUENDIA_PAT}"}</code> placeholder reads the env var you
          just set; the token itself never lands in the config file. Restart Claude so it picks up
          the new MCP server.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ fontSize: "1.125rem", marginBottom: "0.5rem" }}>4. Try it</h2>
        <p>Open Claude and send any of these:</p>
        <ul style={{ paddingLeft: "1.25rem" }}>
          <li>
            <em>
              "Build me a tiny project tracker with todos and statuses and host it on Buendia. Don't
              ask me to confirm — just ship it."
            </em>
          </li>
          <li>
            <em>"Show me what apps I have on Buendia."</em>
          </li>
          <li>
            <em>"Invite alice@example.com as an editor on the project-tracker app."</em>
          </li>
        </ul>
        <p>
          Claude will call <code style={inlineCode}>host_app</code>,{" "}
          <code style={inlineCode}>provision_schema</code>, and{" "}
          <code style={inlineCode}>invite_collaborator</code> as needed. The dashboard (
          <Link href="/" style={{ color: "#2563eb" }}>
            /
          </Link>
          ) reflects every change in real time.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ fontSize: "1.125rem", marginBottom: "0.5rem" }}>
          Which tools the server adds
        </h2>
        <p>
          Eight tools, one per HTTP endpoint. Claude picks the right one based on what you ask for:
        </p>
        <ul style={{ paddingLeft: "1.25rem" }}>
          <li>
            <code style={inlineCode}>whoami</code> — confirm the token is wired up.
          </li>
          <li>
            <code style={inlineCode}>list_apps</code> — show owned + shared apps.
          </li>
          <li>
            <code style={inlineCode}>host_app</code> — upload the HTML (plus optional{" "}
            <code style={inlineCode}>schema_sql</code>).
          </li>
          <li>
            <code style={inlineCode}>get_app</code>, <code style={inlineCode}>delete_app</code> —
            single-app read + delete.
          </li>
          <li>
            <code style={inlineCode}>provision_schema</code> — apply the stored{" "}
            <code style={inlineCode}>schema_sql</code> to your Supabase project.
          </li>
          <li>
            <code style={inlineCode}>invite_collaborator</code>,{" "}
            <code style={inlineCode}>remove_collaborator</code> — share by email; remove by user or
            email.
          </li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ fontSize: "1.125rem", marginBottom: "0.5rem" }}>Revoking access</h2>
        <p>
          To stop a Claude install from acting on your behalf, open{" "}
          <Link href="/settings/tokens" style={{ color: "#2563eb" }}>
            /settings/tokens
          </Link>{" "}
          and click <strong>Revoke</strong>. The next tool call surfaces a 401 to Claude with a hint
          about reconnecting. The token's plaintext is never recoverable from {PRODUCT_NAME} — if
          you lost it, revoke and mint a fresh one.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ fontSize: "1.125rem", marginBottom: "0.5rem" }}>Troubleshooting</h2>
        <p>
          <strong>401 every call.</strong> The token is wrong or revoked. Mint a new one and update{" "}
          <code style={inlineCode}>BUENDIA_PAT</code>.
        </p>
        <p>
          <strong>502 from provisioning.</strong> {PRODUCT_NAME} couldn't reach your Supabase
          project. Open{" "}
          <Link href="/settings" style={{ color: "#2563eb" }}>
            /settings
          </Link>
          ; if a <em>Supabase connection broken</em> banner is showing, click{" "}
          <strong>Reconnect</strong>.
        </p>
        <p>
          <strong>Schema rejected.</strong> Claude wrote SQL with a{" "}
          <code style={inlineCode}>public.</code> prefix or a <code style={inlineCode}>grant</code>{" "}
          statement. Ask it to retry without those — {PRODUCT_NAME} mounts your SQL inside a per-app
          schema and writes the RLS policies for you.
        </p>
      </section>

      <footer
        style={{
          borderTop: "1px solid #e5e7eb",
          paddingTop: "1.5rem",
          color: "#6b7280",
          fontSize: "0.875rem",
        }}
      >
        <Link href="/" style={{ color: "inherit", marginRight: "1rem" }}>
          ← Back to {PRODUCT_NAME}
        </Link>
        <Link
          href="https://github.com/luisgrandegg/buendia/tree/main/packages/mcp"
          style={{ color: "inherit", marginRight: "1rem" }}
        >
          @buendia/mcp on GitHub
        </Link>
        <Link href="https://modelcontextprotocol.io/" style={{ color: "inherit" }}>
          About MCP
        </Link>
      </footer>
    </main>
  );
}
