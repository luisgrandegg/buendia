import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { space, widths } from "./tokens";

type Width = keyof typeof widths | "full";

interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  width?: Width;
  /** Vertical padding above and below the children. */
  padY?: keyof typeof space;
  children: ReactNode;
}

/** Centred content column. */
export function Container({ width = "app", padY = 10, style, children, ...rest }: ContainerProps) {
  const css: CSSProperties = {
    maxWidth: width === "full" ? "none" : widths[width],
    margin: "0 auto",
    padding: `${space[padY]} ${space[6]}`,
    ...style,
  };
  return (
    <div {...rest} style={css}>
      {children}
    </div>
  );
}

interface SectionProps extends HTMLAttributes<HTMLElement> {
  /** Vertical rhythm — gap between sections. */
  gap?: keyof typeof space;
  children: ReactNode;
}

/** Top-level page section; just enforces a consistent vertical gap. */
export function Section({ gap = 10, style, children, ...rest }: SectionProps) {
  return (
    <section {...rest} style={{ marginTop: space[gap], ...style }}>
      {children}
    </section>
  );
}
