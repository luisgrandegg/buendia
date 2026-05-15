import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PRODUCT_NAME } from "@buendia/shared";
import { createClient } from "@/lib/supabase/server";
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
    <div
      style={{
        minHeight: "100vh",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#111827",
      }}
    >
      <header
        style={{
          borderBottom: "1px solid #e5e7eb",
          padding: "0.75rem 1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1.5rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
          <Link
            href="/"
            style={{
              fontSize: "1.125rem",
              fontWeight: 600,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            {PRODUCT_NAME}
          </Link>
          <Nav />
        </div>
        <AccountMenu email={user.email ?? ""} />
      </header>

      <main style={{ padding: "2rem 1.5rem", maxWidth: "56rem", margin: "0 auto" }}>
        {children}
      </main>
    </div>
  );
}
