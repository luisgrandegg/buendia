import { signOutAction } from "@/app/actions/auth";

interface AccountMenuProps {
  email: string;
}

export function AccountMenu({ email }: AccountMenuProps) {
  return (
    <form action={signOutAction} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <span style={{ fontSize: "0.875rem", color: "#374151" }}>{email}</span>
      <button
        type="submit"
        style={{
          padding: "0.375rem 0.75rem",
          borderRadius: "0.375rem",
          border: "1px solid #d1d5db",
          background: "white",
          fontSize: "0.875rem",
          cursor: "pointer",
        }}
      >
        Sign out
      </button>
    </form>
  );
}
