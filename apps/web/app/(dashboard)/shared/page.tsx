import { EmptyState } from "../_components/empty-state";

export const metadata = { title: "Shared with me · Buendia" };

export default function SharedPage() {
  return (
    <div>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Shared with me</h1>
      </header>

      <EmptyState
        title="Nothing shared with you yet"
        body="When someone invites you to an app, it shows up here. Invitations land with ticket 30."
      />
    </div>
  );
}
