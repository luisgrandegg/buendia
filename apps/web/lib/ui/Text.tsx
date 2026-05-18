import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { colors, typography } from "./tokens";

type Size = keyof typeof typography.size;
type Weight = keyof typeof typography.weight;
type Tone = "default" | "muted" | "subtle" | "accent" | "danger";

interface TextProps extends HTMLAttributes<HTMLElement> {
  as?: "p" | "span" | "div" | "label" | "strong" | "em";
  size?: Size;
  weight?: Weight;
  tone?: Tone;
  mono?: boolean;
  children: ReactNode;
}

const toneColor: Record<Tone, string> = {
  default: colors.text,
  muted: colors.textMuted,
  subtle: colors.textSubtle,
  accent: colors.textAccent,
  danger: colors.danger,
};

export function Text({
  as: Tag = "p",
  size = "base",
  weight = "regular",
  tone = "default",
  mono = false,
  style,
  children,
  ...rest
}: TextProps) {
  const css: CSSProperties = {
    margin: Tag === "p" ? 0 : undefined,
    fontFamily: mono ? typography.fontMono : typography.fontSans,
    color: toneColor[tone],
    fontWeight: typography.weight[weight],
    ...typography.size[size],
    ...style,
  };
  return (
    <Tag {...rest} style={css}>
      {children}
    </Tag>
  );
}

interface HeadingProps extends Omit<HTMLAttributes<HTMLHeadingElement>, "children"> {
  level: 1 | 2 | 3 | 4;
  /** Override the type-scale step. Defaults to a sensible level→size map. */
  size?: Size;
  children: ReactNode;
}

const levelSize: Record<HeadingProps["level"], Size> = {
  1: "3xl",
  2: "xl",
  3: "lg",
  4: "base",
};

export function Heading({ level, size, style, children, ...rest }: HeadingProps) {
  const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4";
  const css: CSSProperties = {
    margin: 0,
    fontFamily: typography.fontSans,
    color: colors.text,
    fontWeight: typography.weight.semibold,
    ...typography.size[size ?? levelSize[level]],
    ...style,
  };
  return (
    <Tag {...rest} style={css}>
      {children}
    </Tag>
  );
}
