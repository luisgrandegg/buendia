import Link from "next/link";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@buendia/shared";

export const metadata = {
  title: `${PRODUCT_NAME} — host AI-generated single-file HTML apps`,
  description: PRODUCT_TAGLINE,
};

const PRINCIPLES: { number: number; name: string; one_liner: string }[] = [
  {
    number: 1,
    name: "Portability over convenience",
    one_liner: "The HTML is the durable artifact. Export and run anywhere.",
  },
  {
    number: 2,
    name: "Platform is opt-in at runtime",
    one_liner: "Same HTML works hosted, on file://, or any static host.",
  },
  {
    number: 3,
    name: "You own the database",
    one_liner: "App data lives in your Supabase project, not ours.",
  },
  {
    number: 4,
    name: "Real auth, not URL obscurity",
    one_liner: "Per-user JWTs granted to people, revokable in one click.",
  },
  {
    number: 5,
    name: "Single codebase, two deployments",
    one_liner: "Hosted SaaS and self-hosted from the same repo.",
  },
  {
    number: 6,
    name: "SDK is a library, not a runtime",
    one_liner: "No framework, no build step. <script> tag and one call.",
  },
  {
    number: 7,
    name: "Sharing is access, not ownership transfer",
    one_liner: "Recipients get the running app, never the HTML or schema.",
  },
  {
    number: 8,
    name: "The stack, not the vendor",
    one_liner: "Open protocols, compatible substitutes welcome.",
  },
];

export default function LandingPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#111827",
        background: "white",
      }}
    >
      <header
        style={{
          padding: "1.25rem 1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          maxWidth: "64rem",
          margin: "0 auto",
        }}
      >
        <strong style={{ fontSize: "1.125rem" }}>{PRODUCT_NAME}</strong>
        <nav style={{ display: "flex", gap: "0.75rem" }}>
          <Link href="/signin" style={textLinkStyle}>
            Sign in
          </Link>
          <Link href="/signup" style={primaryLinkStyle}>
            Sign up
          </Link>
        </nav>
      </header>

      <section
        style={{
          padding: "3rem 1.5rem 4rem 1.5rem",
          maxWidth: "44rem",
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: "2.25rem", lineHeight: "1.15", margin: 0 }}>
          Host AI-generated HTML apps without absorbing them.
        </h1>
        <p
          style={{
            marginTop: "1.25rem",
            fontSize: "1.0625rem",
            lineHeight: "1.6",
            color: "#4b5563",
          }}
        >
          Drop an <code>index.html</code> file. {PRODUCT_NAME} gives it a URL, provisions a database
          in <em>your</em> Supabase project, and serves it with real auth. The same file works on
          our platform, on a static host, or as a <code>file://</code> double-click. Leave whenever;
          your data and your app keep working.
        </p>
        <div
          style={{
            marginTop: "2rem",
            display: "flex",
            gap: "0.75rem",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <Link href="/signup" style={primaryLinkStyle}>
            Get started
          </Link>
          <Link href="https://github.com/luisgrandegg/buendia" style={secondaryLinkStyle}>
            Read the code
          </Link>
        </div>
      </section>

      <section
        style={{
          padding: "2rem 1.5rem",
          maxWidth: "56rem",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(20rem, 1fr))",
          gap: "1.5rem",
        }}
      >
        <article style={cardStyle}>
          <h2 style={cardTitleStyle}>Hosted</h2>
          <p style={cardBodyStyle}>
            Connect Supabase once, upload your HTML, get a URL. {PRODUCT_NAME} mints short-lived,
            per-user JWTs against your project. Share with named people by email; revoke any time.
          </p>
        </article>
        <article style={cardStyle}>
          <h2 style={cardTitleStyle}>Standalone</h2>
          <p style={cardBodyStyle}>
            Export the bundle. The SDK detects no injected config, prompts for Supabase credentials,
            and runs the app from <code>file://</code> or any static host. Identical surface to
            hosted; security falls back to RLS.
          </p>
        </article>
      </section>

      <section
        style={{
          padding: "3rem 1.5rem",
          maxWidth: "56rem",
          margin: "0 auto",
        }}
      >
        <h2 style={{ fontSize: "1.25rem", marginBottom: "1.25rem" }}>The eight principles</h2>
        <ol style={{ paddingLeft: "1.25rem", margin: 0 }}>
          {PRINCIPLES.map((p) => (
            <li key={p.number} style={{ marginBottom: "0.875rem", lineHeight: "1.55" }}>
              <strong>{p.name}.</strong> <span style={{ color: "#4b5563" }}>{p.one_liner}</span>
            </li>
          ))}
        </ol>
      </section>

      <section
        style={{
          padding: "2rem 1.5rem 4rem 1.5rem",
          maxWidth: "44rem",
          margin: "0 auto",
        }}
      >
        <h2 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>Pricing</h2>
        <p style={{ color: "#4b5563", lineHeight: "1.6" }}>
          Free during the MVP. The hosted SaaS will charge once it's worth charging for. The
          self-hosted distribution is AGPLv3 and ships from the same codebase — no &ldquo;upgrade to
          pro&rdquo; tier gating features. See the{" "}
          <Link
            href="https://github.com/luisgrandegg/buendia/blob/main/CONSTITUTION.md"
            style={{ color: "inherit" }}
          >
            constitution
          </Link>{" "}
          for the contract.
        </p>
      </section>

      <footer
        style={{
          borderTop: "1px solid #e5e7eb",
          padding: "1.5rem",
          textAlign: "center",
          color: "#6b7280",
          fontSize: "0.8125rem",
        }}
      >
        <Link href="/docs/access-removal" style={{ color: "inherit", marginRight: "1rem" }}>
          Access removal
        </Link>
        <Link
          href="https://github.com/luisgrandegg/buendia"
          style={{ color: "inherit", marginRight: "1rem" }}
        >
          GitHub
        </Link>
        <Link href="/signin" style={{ color: "inherit" }}>
          Sign in
        </Link>
      </footer>
    </main>
  );
}

const textLinkStyle = {
  padding: "0.5rem 0.875rem",
  fontSize: "0.9375rem",
  color: "#111827",
  textDecoration: "none",
};

const primaryLinkStyle = {
  padding: "0.5rem 1rem",
  borderRadius: "0.375rem",
  background: "#111827",
  color: "white",
  fontSize: "0.9375rem",
  textDecoration: "none",
};

const secondaryLinkStyle = {
  padding: "0.5rem 1rem",
  borderRadius: "0.375rem",
  border: "1px solid #d1d5db",
  background: "white",
  color: "#111827",
  fontSize: "0.9375rem",
  textDecoration: "none",
};

const cardStyle = {
  padding: "1.5rem",
  border: "1px solid #e5e7eb",
  borderRadius: "0.5rem",
  background: "#fafafa",
};

const cardTitleStyle = {
  fontSize: "1.125rem",
  margin: "0 0 0.5rem 0",
};

const cardBodyStyle = {
  color: "#4b5563",
  fontSize: "0.9375rem",
  lineHeight: "1.55",
  margin: 0,
};
