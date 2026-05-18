import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createPersonalAccessTokenAction,
  revokePersonalAccessTokenAction,
} from "@/app/actions/personal-access-tokens";
import { readRevealedPat } from "@/lib/pat-reveal-cookie";
import { createClient } from "@/lib/supabase/server";
import { ClearRevealOnMount } from "./clear-reveal";

export const metadata = { title: "Access tokens · Buendia" };

interface PageProps {
  searchParams: Promise<{ create?: string; revoke?: string }>;
}

const createMessages: Record<string, { tone: "ok" | "warn"; text: string }> = {
  ok: { tone: "ok", text: "Token created. Copy it now — Buendia won't show it again." },
  missing_name: { tone: "warn", text: "Give the token a short name so you can identify it later." },
  unauthenticated: { tone: "warn", text: "Sign in and try again." },
  write_failed: { tone: "warn", text: "Couldn't save the token. Please try again." },
};

const revokeMessages: Record<string, { tone: "ok" | "warn"; text: string }> = {
  ok: { tone: "ok", text: "Token revoked. Any client using it will start getting 401s." },
  not_found: { tone: "warn", text: "Couldn't find that token to revoke." },
  unauthenticated: { tone: "warn", text: "Sign in and try again." },
};

const rowStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(10rem, 1fr) 8rem 10rem 8rem",
  gap: "1rem",
  padding: "0.75rem 0",
  borderBottom: "1px solid #e5e7eb",
  fontSize: "0.9375rem",
  alignItems: "center",
};

const headerRowStyle = {
  ...rowStyle,
  borderBottomColor: "#d1d5db",
  color: "#6b7280",
  fontSize: "0.8125rem",
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
};

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
    <div>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Access tokens</h1>
        <p style={{ color: "#4b5563", fontSize: "0.9375rem", margin: "0.5rem 0 0 0" }}>
          Personal access tokens authenticate non-browser clients (the Claude MCP server, curl, the
          upcoming CLI) against Buendia. They act on your behalf — anyone with a token can do
          anything you can. Treat them like passwords.
        </p>
        <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.875rem" }}>
          <Link href="/settings" style={{ color: "#2563eb" }}>
            ← Back to settings
          </Link>
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

      {revealed ? (
        <div
          role="alert"
          style={{
            padding: "1rem 1.25rem",
            marginBottom: "1.5rem",
            borderRadius: "0.375rem",
            border: "1px solid #fde68a",
            background: "#fffbeb",
            color: "#78350f",
          }}
        >
          <strong style={{ display: "block", marginBottom: "0.5rem" }}>
            Copy this token now — Buendia won't show it again.
          </strong>
          <code
            style={{
              display: "block",
              padding: "0.625rem 0.75rem",
              borderRadius: "0.375rem",
              border: "1px solid #fde68a",
              background: "white",
              fontFamily: "ui-monospace, monospace",
              fontSize: "0.875rem",
              wordBreak: "break-all",
              userSelect: "all",
            }}
          >
            {revealed.plaintext}
          </code>
          <ClearRevealOnMount />
        </div>
      ) : null}

      <section style={{ marginBottom: "2.5rem" }}>
        <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Create a token</h2>
        <form
          action={createPersonalAccessTokenAction}
          style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
        >
          <input
            type="text"
            name="name"
            required
            maxLength={80}
            placeholder="e.g. claude-mcp on laptop"
            style={{
              flex: 1,
              padding: "0.5rem 0.75rem",
              borderRadius: "0.375rem",
              border: "1px solid #d1d5db",
              fontSize: "0.9375rem",
            }}
          />
          <button
            type="submit"
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              border: "1px solid #111827",
              background: "#111827",
              color: "white",
              fontSize: "0.9375rem",
              cursor: "pointer",
            }}
          >
            Create token
          </button>
        </form>
      </section>

      <section>
        <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Your tokens</h2>
        {!tokens || tokens.length === 0 ? (
          <p style={{ color: "#6b7280", fontSize: "0.9375rem" }}>
            No tokens yet. Create one above when you're ready to wire up Claude or a script.
          </p>
        ) : (
          <div>
            <div style={headerRowStyle}>
              <div>Name</div>
              <div>Prefix</div>
              <div>Last used</div>
              <div style={{ textAlign: "right" }}>Status</div>
            </div>
            {tokens.map((token) => (
              <div key={token.id} style={rowStyle}>
                <div style={{ fontWeight: 500 }}>{token.name}</div>
                <div style={{ fontFamily: "ui-monospace, monospace", color: "#6b7280" }}>
                  {token.token_prefix}…
                </div>
                <div style={{ color: "#6b7280" }}>
                  {token.last_used_at ? new Date(token.last_used_at).toLocaleString() : "never"}
                </div>
                <div style={{ textAlign: "right" }}>
                  {token.revoked_at ? (
                    <span style={{ color: "#6b7280", fontSize: "0.875rem" }}>
                      revoked {new Date(token.revoked_at).toLocaleDateString()}
                    </span>
                  ) : (
                    <form action={revokePersonalAccessTokenAction} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={token.id} />
                      <button
                        type="submit"
                        style={{
                          padding: "0.25rem 0.625rem",
                          borderRadius: "0.375rem",
                          border: "1px solid #fecaca",
                          background: "white",
                          color: "#b91c1c",
                          fontSize: "0.8125rem",
                          cursor: "pointer",
                        }}
                      >
                        Revoke
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
