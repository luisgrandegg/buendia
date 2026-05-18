import type { ReactNode } from "react";
import { Heading, Stack, Text, colors, radii, space } from "@/lib/ui";

interface EmptyStateProps {
  title: string;
  body: string;
  action?: ReactNode;
}

export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <section
      style={{
        padding: `${space[16]} ${space[6]}`,
        border: `1px dashed ${colors.borderStrong}`,
        borderRadius: radii.lg,
        background: colors.bg,
      }}
    >
      <Stack gap={3} align="center" style={{ textAlign: "center" }}>
        <Heading level={3}>{title}</Heading>
        <Text tone="muted" style={{ maxWidth: "32rem" }}>
          {body}
        </Text>
        {action ? <div style={{ marginTop: space[2] }}>{action}</div> : null}
      </Stack>
    </section>
  );
}
