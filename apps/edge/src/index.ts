import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { PRODUCT_NAME } from "@buendia/shared";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true, service: PRODUCT_NAME }));

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`${PRODUCT_NAME} edge listening on :${info.port}`);
});

export default app;
