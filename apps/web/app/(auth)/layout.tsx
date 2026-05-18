import type { ReactNode } from "react";
import Link from "next/link";
import { PRODUCT_NAME } from "@buendia/shared";
import { colors, space, typography } from "@/lib/ui";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: space[6],
        background: colors.bgMuted,
      }}
    >
      <Link
        href="/landing"
        style={{
          ...typography.size.lg,
          fontWeight: typography.weight.semibold,
          letterSpacing: "-0.015em",
          textDecoration: "none",
          color: colors.text,
          marginBottom: space[8],
        }}
      >
        {PRODUCT_NAME}
      </Link>
      <div style={{ width: "100%", maxWidth: "24rem" }}>{children}</div>
    </main>
  );
}
