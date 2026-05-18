import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { colors, motion, radii, shadows, space, typography } from "./tokens";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const sizeStyles: Record<ButtonSize, CSSProperties> = {
  sm: {
    padding: `${space[1]} ${space[3]}`,
    ...typography.size.md,
    fontWeight: typography.weight.medium,
  },
  md: {
    padding: `${space[2]} ${space[4]}`,
    ...typography.size.base,
    fontWeight: typography.weight.medium,
  },
};

const variantStyles: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: colors.bgInverse,
    color: colors.textInverse,
    border: `1px solid ${colors.bgInverse}`,
    boxShadow: shadows.sm,
  },
  secondary: {
    background: colors.bg,
    color: colors.text,
    border: `1px solid ${colors.borderStrong}`,
    boxShadow: shadows.xs,
  },
  ghost: {
    background: "transparent",
    color: colors.text,
    border: "1px solid transparent",
  },
  danger: {
    background: colors.bg,
    color: colors.danger,
    border: `1px solid ${colors.dangerBorder}`,
  },
};

/**
 * Button primitive. Variants:
 *   - `primary`   — solid near-black, used for the single most important
 *                   action per surface.
 *   - `secondary` — white with a thin border. The default for most calls
 *                   to action.
 *   - `ghost`     — no border, no background. Use sparingly inside dense
 *                   tables / lists.
 *   - `danger`    — white with a red border + red text. Confirm-destruct.
 */
export function Button({
  variant = "secondary",
  size = "md",
  style,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: space[2],
    fontFamily: typography.fontSans,
    borderRadius: radii.md,
    cursor: disabled ? "not-allowed" : "pointer",
    transition: `background ${motion.fast}, border-color ${motion.fast}, box-shadow ${motion.fast}, color ${motion.fast}`,
    textDecoration: "none",
    whiteSpace: "nowrap",
    opacity: disabled ? 0.55 : 1,
    ...sizeStyles[size],
    ...variantStyles[variant],
    ...style,
  };
  return (
    <button {...rest} disabled={disabled} style={base}>
      {children}
    </button>
  );
}
