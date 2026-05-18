import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { colors, radii, shadows, space } from "./tokens";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Padding preset. `cozy` is the default; `compact` for dense lists. */
  padding?: "compact" | "cozy" | "roomy" | "none";
  /** Pull the card's elevation down for nested containers. */
  flat?: boolean;
  children: ReactNode;
}

const paddingStyles: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "0",
  compact: space[4],
  cozy: space[6],
  roomy: space[8],
};

/**
 * Surface used to group related content. Defaults to white-on-white with a
 * hairline border and the lightest possible shadow — enough to read as a
 * card, not so much that it feels weighty.
 */
export function Card({ padding = "cozy", flat = false, style, children, ...rest }: CardProps) {
  const base: CSSProperties = {
    background: colors.bg,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.lg,
    padding: paddingStyles[padding],
    boxShadow: flat ? shadows.none : shadows.xs,
    ...style,
  };
  return (
    <div {...rest} style={base}>
      {children}
    </div>
  );
}
