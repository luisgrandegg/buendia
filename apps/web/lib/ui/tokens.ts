/**
 * Design tokens for the Buendia dashboard.
 *
 * Single source of truth for colors, type scale, spacing, radii, shadows
 * and motion. Every primitive in `lib/ui/*` composes from these; pages
 * import primitives, not raw tokens, but the tokens are also exported
 * so one-off treatments stay consistent.
 *
 * The visual target is "Linear / Vercel" — a near-monochrome neutral
 * palette, one cool accent, tight Inter, generous whitespace, and very
 * subtle elevation.
 */

export const palette = {
  // Neutral scale — borders, surfaces, muted text. Cool grays for a
  // slight blue cast that pairs with the accent.
  neutral: {
    0: "#ffffff",
    25: "#fcfcfd",
    50: "#f8fafc",
    100: "#f1f5f9",
    200: "#e2e8f0",
    300: "#cbd5e1",
    400: "#94a3b8",
    500: "#64748b",
    600: "#475569",
    700: "#334155",
    800: "#1e293b",
    900: "#0f172a",
    1000: "#020617",
  },
  // Single accent — links, primary actions, focus rings. Indigo 600 reads
  // confidently against neutrals and stays readable at small sizes.
  accent: {
    50: "#eef2ff",
    100: "#e0e7ff",
    300: "#a5b4fc",
    500: "#6366f1",
    600: "#4f46e5",
    700: "#4338ca",
    900: "#312e81",
  },
  success: {
    50: "#ecfdf5",
    200: "#a7f3d0",
    600: "#059669",
    700: "#047857",
  },
  warning: {
    50: "#fffbeb",
    200: "#fde68a",
    600: "#d97706",
    700: "#b45309",
  },
  danger: {
    50: "#fef2f2",
    200: "#fecaca",
    600: "#dc2626",
    700: "#b91c1c",
  },
} as const;

/** Semantic colour aliases. Pages should prefer these over raw scale steps. */
export const colors = {
  text: palette.neutral[900],
  textMuted: palette.neutral[500],
  textSubtle: palette.neutral[400],
  textInverse: palette.neutral[0],
  textAccent: palette.accent[600],

  bg: palette.neutral[0],
  bgMuted: palette.neutral[50],
  bgSubtle: palette.neutral[100],
  bgInverse: palette.neutral[900],

  border: palette.neutral[200],
  borderStrong: palette.neutral[300],
  borderFocus: palette.accent[500],

  accent: palette.accent[600],
  accentHover: palette.accent[700],
  accentBgSoft: palette.accent[50],

  success: palette.success[700],
  successBg: palette.success[50],
  successBorder: palette.success[200],
  warning: palette.warning[700],
  warningBg: palette.warning[50],
  warningBorder: palette.warning[200],
  danger: palette.danger[700],
  dangerBg: palette.danger[50],
  dangerBorder: palette.danger[200],
} as const;

/** 4-px base spacing scale. `space[4]` === 16 px etc. */
export const space = {
  0: "0",
  1: "0.25rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  7: "1.75rem",
  8: "2rem",
  10: "2.5rem",
  12: "3rem",
  16: "4rem",
  20: "5rem",
  24: "6rem",
} as const;

/** Border radii. Match Vercel/Linear's slightly soft corners. */
export const radii = {
  sm: "0.25rem",
  md: "0.375rem",
  lg: "0.5rem",
  xl: "0.75rem",
  pill: "9999px",
} as const;

/** Very subtle elevation. Big shadows look toy-like at this scale. */
export const shadows = {
  none: "none",
  xs: "0 1px 2px rgba(15, 23, 42, 0.04)",
  sm: "0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)",
  md: "0 4px 12px rgba(15, 23, 42, 0.06), 0 2px 4px rgba(15, 23, 42, 0.04)",
  focus: "0 0 0 3px rgba(99, 102, 241, 0.22)",
  focusDanger: "0 0 0 3px rgba(220, 38, 38, 0.20)",
} as const;

/** Type scale — used by `<Heading>`, `<Text>` and ad-hoc styling. */
export const typography = {
  // Stack chains the next/font Inter variable, then a generic sans fallback
  // for the rare server-render before the font loads.
  fontSans:
    'var(--font-sans, "Inter"), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontMono: 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Monaco, Consolas, monospace',
  // Pixel-accurate scale. Big sizes get tighter tracking; body text stays
  // at zero for readability.
  size: {
    xs: { fontSize: "0.75rem", lineHeight: "1rem", letterSpacing: "0" },
    sm: { fontSize: "0.8125rem", lineHeight: "1.125rem", letterSpacing: "0" },
    md: { fontSize: "0.875rem", lineHeight: "1.25rem", letterSpacing: "0" },
    base: { fontSize: "0.9375rem", lineHeight: "1.5rem", letterSpacing: "0" },
    lg: { fontSize: "1.0625rem", lineHeight: "1.625rem", letterSpacing: "-0.005em" },
    xl: { fontSize: "1.1875rem", lineHeight: "1.75rem", letterSpacing: "-0.01em" },
    "2xl": { fontSize: "1.5rem", lineHeight: "2rem", letterSpacing: "-0.015em" },
    "3xl": { fontSize: "1.875rem", lineHeight: "2.25rem", letterSpacing: "-0.02em" },
    "4xl": { fontSize: "2.5rem", lineHeight: "2.75rem", letterSpacing: "-0.025em" },
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
  },
} as const;

/** Standard transition for interactive states. */
export const motion = {
  fast: "120ms cubic-bezier(0.4, 0, 0.2, 1)",
  base: "180ms cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

/** Layout widths used by the dashboard + marketing surfaces. */
export const widths = {
  // Reading widths
  prose: "44rem",
  // Form / panel widths
  panel: "40rem",
  // Dashboard content area
  app: "60rem",
  // Marketing hero
  hero: "64rem",
} as const;
