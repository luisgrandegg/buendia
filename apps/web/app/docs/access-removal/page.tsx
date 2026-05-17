import Link from "next/link";

export const metadata = { title: "Access removal · Buendia" };

const sectionStyle = {
  marginBottom: "1.5rem",
  fontSize: "0.9375rem",
  lineHeight: "1.6",
  color: "#374151",
};

export default function AccessRemovalPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "3rem 1.5rem",
        maxWidth: "40rem",
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#111827",
      }}
    >
      <header style={{ marginBottom: "2rem" }}>
        <Link href="/" style={{ fontSize: "0.875rem", color: "#6b7280" }}>
          ← Buendia
        </Link>
        <h1 style={{ fontSize: "1.75rem", margin: "0.75rem 0 0 0" }}>How access removal works</h1>
      </header>

      <section style={sectionStyle}>
        <p>
          When an app owner removes a collaborator, Buendia revokes their access immediately at the
          control plane: their row in <code>public.app_shares</code> is deleted in the same
          transaction that writes the audit-log entry.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ fontSize: "1.125rem", marginBottom: "0.5rem" }}>The 15-minute window</h2>
        <p>
          Buendia mints short-lived JWTs (15 minutes maximum, signed with the owner's Supabase
          project secret). An already-minted JWT keeps working against the owner's project until it
          expires. The SDK refreshes silently every ~10 minutes; the next refresh after revocation
          returns 403 and the SDK mounts an overlay that says &ldquo;Your access to this app was
          removed.&rdquo;
        </p>
        <p>
          In practice: a revoked collaborator with an open tab loses access within at most 15
          minutes — usually sooner, because the SDK refreshes before the JWT actually expires. No
          server-side &ldquo;kill all sessions&rdquo; mechanism. We deliberately keep the revocation
          path simple: delete the share row, the JWT mint stops issuing new tokens, the old token
          times out.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ fontSize: "1.125rem", marginBottom: "0.5rem" }}>What stops, what stays</h2>
        <p>After revocation, the collaborator can no longer:</p>
        <ul style={{ paddingLeft: "1.25rem" }}>
          <li>
            Open <code>/a/&lt;slug&gt;</code> — returns 403.
          </li>
          <li>Refresh their JWT — returns 403.</li>
          <li>Make new reads or writes via the SDK once their existing JWT expires.</li>
        </ul>
        <p>
          The collaborator's Buendia account stays intact — the removal only affects this specific
          app. Their Shared with me list updates on next page load.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ fontSize: "1.125rem", marginBottom: "0.5rem" }}>What we don't do</h2>
        <p>
          We don't issue device-level revocations. We don't proactively close their WebSocket. We
          don't audit-trail every read or write the way a SIEM would. The model is intentionally
          minimal: a share is one row, removal is one delete, expiry is one TTL.
        </p>
      </section>

      <section style={sectionStyle}>
        <p style={{ color: "#6b7280", fontSize: "0.8125rem" }}>
          For the architectural contract behind this behaviour, see the project's{" "}
          <Link
            href="https://github.com/luisgrandegg/buendia/blob/main/CONSTITUTION.md"
            style={{ color: "inherit" }}
          >
            constitution
          </Link>{" "}
          §7 (sharing is access, not ownership transfer) and §4 (real auth, not URL obscurity).
        </p>
      </section>
    </main>
  );
}
