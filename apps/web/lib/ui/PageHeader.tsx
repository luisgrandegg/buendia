import type { ReactNode } from "react";
import { space, typography } from "./tokens";
import { Heading, Text } from "./Text";

interface PageHeaderProps {
  title: ReactNode;
  /** Short prose sentence below the title. */
  description?: ReactNode;
  /** Tiny eyebrow above the title — "Settings" › "Access tokens" etc. */
  eyebrow?: ReactNode;
  /** Buttons / links anchored to the right. */
  actions?: ReactNode;
}

export function PageHeader({ title, description, eyebrow, actions }: PageHeaderProps) {
  return (
    <header
      style={{
        marginBottom: space[8],
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        gap: space[4],
        flexWrap: "wrap",
      }}
    >
      <div style={{ minWidth: 0 }}>
        {eyebrow ? (
          <Text
            size="sm"
            tone="muted"
            style={{
              marginBottom: space[2],
              fontWeight: typography.weight.medium,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {eyebrow}
          </Text>
        ) : null}
        <Heading level={1}>{title}</Heading>
        {description ? (
          <Text tone="muted" size="base" style={{ marginTop: space[3], maxWidth: "44rem" }}>
            {description}
          </Text>
        ) : null}
      </div>
      {actions ? <div style={{ flexShrink: 0 }}>{actions}</div> : null}
    </header>
  );
}
