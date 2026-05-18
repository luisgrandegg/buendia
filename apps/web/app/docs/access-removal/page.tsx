import Link from "next/link";
import { PRODUCT_NAME } from "@buendia/shared";
import { Container, Heading, Stack, Text, colors } from "@/lib/ui";

export const metadata = { title: "Access removal · Buendia" };

export default function AccessRemovalPage() {
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
          <Heading level={1} style={{ marginTop: "0.75rem" }}>
            How access removal works
          </Heading>
        </header>

        <Stack gap={6}>
          <Text size="base" tone="muted" style={{ lineHeight: 1.65 }}>
            When an app owner removes a collaborator, Buendia revokes their access immediately at
            the control plane: their row in <code>public.app_shares</code> is deleted in the same
            transaction that writes the audit-log entry.
          </Text>

          <Stack gap={3}>
            <Heading level={3}>The 15-minute window</Heading>
            <Text tone="muted" style={{ lineHeight: 1.65 }}>
              Buendia mints short-lived JWTs (15 minutes maximum, signed with the owner's Supabase
              project secret). An already-minted JWT keeps working against the owner's project until
              it expires. The SDK refreshes silently every ~10 minutes; the next refresh after
              revocation returns 403 and the SDK mounts an overlay that says &ldquo;Your access to
              this app was removed.&rdquo;
            </Text>
            <Text tone="muted" style={{ lineHeight: 1.65 }}>
              In practice: a revoked collaborator with an open tab loses access within at most 15
              minutes — usually sooner, because the SDK refreshes before the JWT actually expires.
              No server-side &ldquo;kill all sessions&rdquo; mechanism. We deliberately keep the
              revocation path simple: delete the share row, the JWT mint stops issuing new tokens,
              the old token times out.
            </Text>
          </Stack>

          <Stack gap={3}>
            <Heading level={3}>What stops, what stays</Heading>
            <Text tone="muted">After revocation, the collaborator can no longer:</Text>
            <ul style={{ paddingLeft: "1.25rem", color: colors.textMuted, lineHeight: 1.65 }}>
              <li>
                Open <code>/a/&lt;slug&gt;</code> — returns 403.
              </li>
              <li>Refresh their JWT — returns 403.</li>
              <li>Make new reads or writes via the SDK once their existing JWT expires.</li>
            </ul>
            <Text tone="muted" style={{ lineHeight: 1.65 }}>
              The collaborator's Buendia account stays intact — the removal only affects this
              specific app. Their Shared with me list updates on next page load.
            </Text>
          </Stack>

          <Stack gap={3}>
            <Heading level={3}>What we don't do</Heading>
            <Text tone="muted" style={{ lineHeight: 1.65 }}>
              We don't issue device-level revocations. We don't proactively close their WebSocket.
              We don't audit-trail every read or write the way a SIEM would. The model is
              intentionally minimal: a share is one row, removal is one delete, expiry is one TTL.
            </Text>
          </Stack>

          <Text size="sm" tone="subtle" style={{ marginTop: "1rem" }}>
            For the architectural contract behind this behaviour, see the project's{" "}
            <Link
              href="https://github.com/luisgrandegg/buendia/blob/main/CONSTITUTION.md"
              style={{ color: "inherit", textDecoration: "underline" }}
            >
              constitution
            </Link>{" "}
            §7 (sharing is access, not ownership transfer) and §4 (real auth, not URL obscurity).
          </Text>
        </Stack>
      </Stack>
    </Container>
  );
}
