import { EmptyState } from "./_components/empty-state";

export const metadata = { title: "My apps · Buendia" };

export default function MyAppsPage() {
  return (
    <div>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>My apps</h1>
      </header>

      <EmptyState
        title="No apps yet"
        body="Upload an HTML file to get started. Upload lands with ticket 20."
        action={
          <button
            type="button"
            disabled
            title="Upload arrives in ticket 20"
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              border: "1px solid #d1d5db",
              background: "#f3f4f6",
              color: "#6b7280",
              cursor: "not-allowed",
              fontSize: "0.9375rem",
            }}
          >
            Upload an app
          </button>
        }
      />
    </div>
  );
}
