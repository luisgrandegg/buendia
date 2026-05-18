import type { AnchorHTMLAttributes, CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { colors, motion, radii, shadows, space, typography } from "./tokens";
import type { ButtonSize, ButtonVariant } from "./Button";

interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
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
 * Anchor styled as a button. Same variant + size grammar as `Button`,
 * but renders as a `Link` so navigation stays client-side.
 */
export function LinkButton({
  href,
  variant = "secondary",
  size = "md",
  style,
  children,
  ...rest
}: LinkButtonProps) {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: space[2],
    fontFamily: typography.fontSans,
    borderRadius: radii.md,
    transition: `background ${motion.fast}, border-color ${motion.fast}, box-shadow ${motion.fast}, color ${motion.fast}`,
    textDecoration: "none",
    whiteSpace: "nowrap",
    ...sizeStyles[size],
    ...variantStyles[variant],
    ...style,
  };
  return (
    <Link href={href} {...rest} style={base}>
      {children}
    </Link>
  );
}
