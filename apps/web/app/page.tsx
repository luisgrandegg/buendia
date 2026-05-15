import { redirect } from "next/navigation";
import { PRODUCT_NAME } from "@buendia/shared";
import { signOutAction } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/signin");
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "2rem",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "2rem",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>{PRODUCT_NAME}</h1>
        <form action={signOutAction}>
          <span style={{ marginRight: "1rem", fontSize: "0.875rem" }}>{user.email}</span>
          <button
            type="submit"
            style={{
              padding: "0.375rem 0.75rem",
              borderRadius: "0.375rem",
              border: "1px solid #d1d5db",
              background: "white",
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </form>
      </header>

      <section>
        <p>You are signed in. The dashboard shell lands in ticket 02.</p>
      </section>
    </main>
  );
}
