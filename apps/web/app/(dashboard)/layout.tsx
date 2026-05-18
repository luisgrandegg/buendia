import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PRODUCT_NAME } from "@buendia/shared";
import { createClient } from "@/lib/supabase/server";
import { colors, space, typography, widths } from "@/lib/ui";
import { AccountMenu } from "./_components/account-menu";
import { Nav } from "./_components/nav";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/signin");
  }

  return (
    <div style={{ minHeight: "100vh", background: colors.bgMuted }}>
      <header
        style={{
          background: colors.bg,
          borderBottom: `1px solid ${colors.border}`,
          padding: `${space[3]} ${space[6]}`,
          position: "sticky",
          top: 0,
          zIndex: 10,
          backdropFilter: "saturate(180%) blur(8px)",
        }}
      >
        <div
          style={{
            maxWidth: widths.app,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: space[6],
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: space[6] }}>
            <Link
              href="/"
              style={{
                ...typography.size.lg,
                fontWeight: typography.weight.semibold,
                letterSpacing: "-0.015em",
                textDecoration: "none",
                color: colors.text,
              }}
            >
              {PRODUCT_NAME}
            </Link>
            <Nav />
          </div>
          <AccountMenu email={user.email ?? ""} />
        </div>
      </header>

      <main
        style={{
          maxWidth: widths.app,
          margin: "0 auto",
          padding: `${space[10]} ${space[6]} ${space[16]}`,
        }}
      >
        {children}
      </main>
    </div>
  );
}
