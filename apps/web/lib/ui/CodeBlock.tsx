import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { colors, radii, space, typography } from "./tokens";

interface CodeBlockProps extends HTMLAttributes<HTMLPreElement> {
  /** Inline display — wraps in `<code>` instead of `<pre><code>`. */
  inline?: boolean;
  children: ReactNode;
}

/** Block of monospace code. Reads as a literal — preserves newlines. */
export function CodeBlock({ inline = false, style, children, ...rest }: CodeBlockProps) {
  if (inline) {
    const css: CSSProperties = {
      fontFamily: typography.fontMono,
      fontSize: "0.875em",
      padding: `1px ${space[1]}`,
      background: colors.bgSubtle,
      borderRadius: radii.sm,
      color: colors.text,
      ...style,
    };
    return (
      <code {...rest} style={css}>
        {children}
      </code>
    );
  }
  const css: CSSProperties = {
    margin: 0,
    padding: `${space[4]} ${space[5]}`,
    borderRadius: radii.lg,
    border: `1px solid ${colors.border}`,
    background: colors.bgMuted,
    fontFamily: typography.fontMono,
    ...typography.size.md,
    lineHeight: 1.55,
    color: colors.text,
    overflowX: "auto",
    whiteSpace: "pre",
    ...style,
  };
  return (
    <pre {...rest} style={css}>
      <code>{children}</code>
    </pre>
  );
}

/** Inline label-value row used by detail surfaces. */
export function DescriptionRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "12rem 1fr",
        gap: space[4],
        padding: `${space[4]} 0`,
        borderBottom: `1px solid ${colors.border}`,
        ...typography.size.base,
      }}
    >
      <div style={{ color: colors.textMuted }}>{label}</div>
      <div style={{ color: colors.text, minWidth: 0, overflowWrap: "anywhere" }}>{children}</div>
    </div>
  );
}
