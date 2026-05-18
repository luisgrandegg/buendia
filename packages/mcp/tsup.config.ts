import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/tools.ts", "src/client.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
  target: "node22",
  // Bin entry needs a shebang so `npx @buendia/mcp` or a Claude config that
  // points at the binary can launch it without an explicit `node`.
  banner: ({ format }) => (format === "esm" ? { js: "#!/usr/bin/env node" } : {}),
});
