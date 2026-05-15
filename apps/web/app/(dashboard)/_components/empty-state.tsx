import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  body: string;
  action?: ReactNode;
}

export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <section
      style={{
        textAlign: "center",
        padding: "4rem 1.5rem",
        border: "1px dashed #d1d5db",
        borderRadius: "0.5rem",
      }}
    >
      <h2 style={{ fontSize: "1.125rem", margin: 0 }}>{title}</h2>
      <p style={{ marginTop: "0.5rem", color: "#4b5563" }}>{body}</p>
      {action ? <div style={{ marginTop: "1.5rem" }}>{action}</div> : null}
    </section>
  );
}
