import Link from "next/link";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@buendia/shared";
import {
  Badge,
  Card,
  Heading,
  LinkButton,
  Row,
  Stack,
  Text,
  colors,
  radii,
  space,
  typography,
  widths,
} from "@/lib/ui";

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
    <main style={{ minHeight: "100vh", background: colors.bg, color: colors.text }}>
      <header
        style={{
          padding: `${space[4]} ${space[6]}`,
          borderBottom: `1px solid ${colors.border}`,
          background: colors.bg,
          position: "sticky",
          top: 0,
          backdropFilter: "saturate(180%) blur(8px)",
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: widths.hero,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Link
            href="/landing"
            style={{
              ...typography.size.lg,
              fontWeight: typography.weight.semibold,
              letterSpacing: "-0.015em",
              textDecoration: "none",
              color: colors.text,
            }}
          >
            {PRODUCT_NAME}
          </Link>
          <Row gap={2}>
            <LinkButton href="/signin" variant="ghost" size="sm">
              Sign in
            </LinkButton>
            <LinkButton href="/signup" variant="primary" size="sm">
              Sign up
            </LinkButton>
          </Row>
        </div>
      </header>

      <section
        style={{
          padding: `${space[20]} ${space[6]} ${space[16]}`,
          maxWidth: widths.prose,
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <Badge tone="accent" style={{ marginBottom: space[6] }}>
          MVP · self-hostable
        </Badge>
        <h1
          style={{
            ...typography.size["4xl"],
            fontWeight: typography.weight.semibold,
            margin: 0,
            color: colors.text,
          }}
        >
          Host AI-generated HTML apps without absorbing them.
        </h1>
        <Text
          size="lg"
          tone="muted"
          style={{ marginTop: space[6], maxWidth: "36rem", marginInline: "auto" }}
        >
          Drop an <code>index.html</code> file. {PRODUCT_NAME} gives it a URL, provisions a database
          in <em>your</em> Supabase project, and serves it with real auth. The same file works on
          our platform, on a static host, or as a <code>file://</code> double-click. Leave whenever;
          your data and your app keep working.
        </Text>
        <Row gap={3} justify="center" style={{ marginTop: space[8] }}>
          <LinkButton href="/signup" variant="primary">
            Get started
          </LinkButton>
          <LinkButton href="https://github.com/luisgrandegg/buendia" variant="secondary">
            Read the code
          </LinkButton>
        </Row>
      </section>

      <section
        style={{
          maxWidth: widths.hero,
          margin: "0 auto",
          padding: `${space[6]} ${space[6]} ${space[16]}`,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))",
          gap: space[5],
        }}
      >
        <Card>
          <Heading level={3} style={{ marginBottom: space[2] }}>
            Hosted
          </Heading>
          <Text tone="muted">
            Connect Supabase once, upload your HTML, get a URL. {PRODUCT_NAME} mints short-lived,
            per-user JWTs against your project. Share with named people by email; revoke any time.
          </Text>
        </Card>
        <Card>
          <Heading level={3} style={{ marginBottom: space[2] }}>
            Standalone
          </Heading>
          <Text tone="muted">
            Export the bundle. The SDK detects no injected config, prompts for Supabase credentials,
            and runs the app from <code>file://</code> or any static host. Identical surface to
            hosted; security falls back to RLS.
          </Text>
        </Card>
        <Card>
          <Heading level={3} style={{ marginBottom: space[2] }}>
            Build with Claude
          </Heading>
          <Text tone="muted">
            Ask Claude to <em>"host this on Buendia"</em>. {PRODUCT_NAME} ships a Model Context
            Protocol server — paste a snippet into Claude Desktop or Claude Code and ship apps
            without leaving the chat.{" "}
            <Link href="/docs/mcp" style={{ color: colors.textAccent }}>
              Setup →
            </Link>
          </Text>
        </Card>
      </section>

      <section
        style={{
          background: colors.bgMuted,
          borderTop: `1px solid ${colors.border}`,
          borderBottom: `1px solid ${colors.border}`,
          padding: `${space[16]} ${space[6]}`,
        }}
      >
        <div style={{ maxWidth: widths.hero, margin: "0 auto" }}>
          <Heading level={2} style={{ marginBottom: space[6] }}>
            The eight principles
          </Heading>
          <Stack gap={3}>
            {PRINCIPLES.map((p) => (
              <Row key={p.number} gap={4} align="baseline">
                <span
                  style={{
                    flexShrink: 0,
                    width: "2rem",
                    height: "2rem",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: colors.bg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: radii.md,
                    fontFamily: typography.fontMono,
                    ...typography.size.sm,
                    color: colors.textMuted,
                  }}
                >
                  {p.number}
                </span>
                <div>
                  <Text style={{ fontWeight: typography.weight.semibold }}>{p.name}</Text>
                  <Text tone="muted" size="md">
                    {p.one_liner}
                  </Text>
                </div>
              </Row>
            ))}
          </Stack>
        </div>
      </section>

      <section
        style={{
          padding: `${space[16]} ${space[6]}`,
          maxWidth: widths.prose,
          margin: "0 auto",
        }}
      >
        <Heading level={2} style={{ marginBottom: space[3] }}>
          Pricing
        </Heading>
        <Text tone="muted">
          Free during the MVP. The hosted SaaS will charge once it's worth charging for. The
          self-hosted distribution is AGPLv3 and ships from the same codebase — no "upgrade to pro"
          tier gating features. See the{" "}
          <Link
            href="https://github.com/luisgrandegg/buendia/blob/main/CONSTITUTION.md"
            style={{ color: colors.textAccent }}
          >
            constitution
          </Link>{" "}
          for the contract.
        </Text>
      </section>

      <footer
        style={{
          borderTop: `1px solid ${colors.border}`,
          padding: `${space[6]} ${space[6]}`,
          background: colors.bg,
        }}
      >
        <div
          style={{
            maxWidth: widths.hero,
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: space[4],
            flexWrap: "wrap",
            color: colors.textMuted,
            ...typography.size.sm,
          }}
        >
          <Text size="sm" tone="muted">
            © {PRODUCT_NAME}
          </Text>
          <Row gap={5}>
            <Link href="/docs/mcp" style={{ color: "inherit", textDecoration: "none" }}>
              Use with Claude
            </Link>
            <Link href="/docs/access-removal" style={{ color: "inherit", textDecoration: "none" }}>
              Access removal
            </Link>
            <Link
              href="https://github.com/luisgrandegg/buendia"
              style={{ color: "inherit", textDecoration: "none" }}
            >
              GitHub
            </Link>
            <Link href="/signin" style={{ color: "inherit", textDecoration: "none" }}>
              Sign in
            </Link>
          </Row>
        </div>
      </footer>
    </main>
  );
}
