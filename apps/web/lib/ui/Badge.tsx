import type { HTMLAttributes, ReactNode } from "react";
import { colors, radii, space, typography } from "./tokens";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "accent";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  children: ReactNode;
}

const tones: Record<BadgeTone, { bg: string; color: string; border: string }> = {
  neutral: { bg: colors.bgSubtle, color: colors.textMuted, border: colors.border },
  success: { bg: colors.successBg, color: colors.success, border: colors.successBorder },
  warning: { bg: colors.warningBg, color: colors.warning, border: colors.warningBorder },
  danger: { bg: colors.dangerBg, color: colors.danger, border: colors.dangerBorder },
  accent: { bg: colors.accentBgSoft, color: colors.textAccent, border: "#c7d2fe" },
};

export function Badge({ tone = "neutral", style, children, ...rest }: BadgeProps) {
  const t = tones[tone];
  return (
    <span
      {...rest}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: space[1],
        padding: `2px ${space[2]}`,
        borderRadius: radii.pill,
        background: t.bg,
        color: t.color,
        border: `1px solid ${t.border}`,
        fontFamily: typography.fontSans,
        ...typography.size.xs,
        fontWeight: typography.weight.medium,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
