import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { space } from "./tokens";

type Gap = keyof typeof space;
type Align = CSSProperties["alignItems"];
type Justify = CSSProperties["justifyContent"];

interface FlexProps extends HTMLAttributes<HTMLDivElement> {
  gap?: Gap;
  align?: Align;
  justify?: Justify;
  wrap?: boolean;
  children: ReactNode;
}

/** Vertical flex container. Replaces ad-hoc `<div style={{display:'flex',flexDirection:'column',...}}>`. */
export function Stack({
  gap = 4,
  align,
  justify,
  wrap = false,
  style,
  children,
  ...rest
}: FlexProps) {
  return (
    <div
      {...rest}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: space[gap],
        alignItems: align,
        justifyContent: justify,
        flexWrap: wrap ? "wrap" : "nowrap",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Horizontal flex container. */
export function Row({
  gap = 3,
  align = "center",
  justify,
  wrap = true,
  style,
  children,
  ...rest
}: FlexProps) {
  return (
    <div
      {...rest}
      style={{
        display: "flex",
        flexDirection: "row",
        gap: space[gap],
        alignItems: align,
        justifyContent: justify,
        flexWrap: wrap ? "wrap" : "nowrap",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
