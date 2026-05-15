import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs", "iife"],
  globalName: "Buendia",
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
  target: "es2022",
});
