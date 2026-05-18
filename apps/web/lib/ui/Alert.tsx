import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { colors, radii, space, typography } from "./tokens";

export type AlertTone = "info" | "success" | "warning" | "danger";

interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  tone: AlertTone;
  /** Bold lead-in line above the body. */
  title?: ReactNode;
  /** Optional actions (Button / LinkButton) anchored bottom-right. */
  action?: ReactNode;
  children?: ReactNode;
}

const toneStyles: Record<
  AlertTone,
  { bg: string; border: string; text: string; titleText: string }
> = {
  info: {
    bg: colors.accentBgSoft,
    border: "#c7d2fe",
    text: "#3730a3",
    titleText: "#312e81",
  },
  success: {
    bg: colors.successBg,
    border: colors.successBorder,
    text: colors.success,
    titleText: "#065f46",
  },
  warning: {
    bg: colors.warningBg,
    border: colors.warningBorder,
    text: colors.warning,
    titleText: "#92400e",
  },
  danger: {
    bg: colors.dangerBg,
    border: colors.dangerBorder,
    text: colors.danger,
    titleText: "#7f1d1d",
  },
};

/**
 * Page-level message. Use sparingly — only when the user needs to know
 * something before they can proceed. For inline form errors, prefer the
 * `error` prop on Input/Textarea.
 */
export function Alert({ tone, title, action, children, style, ...rest }: AlertProps) {
  const t = toneStyles[tone];
  const base: CSSProperties = {
    display: "flex",
    gap: space[4],
    alignItems: "flex-start",
    padding: `${space[3]} ${space[4]}`,
    borderRadius: radii.md,
    border: `1px solid ${t.border}`,
    background: t.bg,
    color: t.text,
    ...typography.size.base,
    ...style,
  };
  return (
    <div role={tone === "danger" || tone === "warning" ? "alert" : "status"} {...rest} style={base}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {title ? (
          <div
            style={{
              color: t.titleText,
              fontWeight: typography.weight.semibold,
              marginBottom: children ? space[1] : 0,
            }}
          >
            {title}
          </div>
        ) : null}
        {children ? <div style={{ lineHeight: 1.55 }}>{children}</div> : null}
      </div>
      {action ? <div style={{ flexShrink: 0 }}>{action}</div> : null}
    </div>
  );
}
