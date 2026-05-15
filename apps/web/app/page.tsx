import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@buendia/shared";

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: "2.5rem", margin: 0 }}>{PRODUCT_NAME}</h1>
      <p style={{ fontSize: "1.125rem", marginTop: "0.75rem", maxWidth: "32rem" }}>
        {PRODUCT_TAGLINE}
      </p>
    </main>
  );
}
