import { defineConfig } from "vitest/config";

/**
 * Single root config: vitest discovers every `*.test.ts` under packages/ and
 * apps/. The default environment is `node`; SDK tests opt into `jsdom` via
 * a `// @vitest-environment jsdom` docblock at the top of the file.
 */
export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
    environment: "node",
    globals: false,
    clearMocks: true,
    restoreMocks: true,
  },
  resolve: {
    alias: {
      "@buendia/shared": new URL("./packages/shared/src/index.ts", import.meta.url).pathname,
      "@buendia/db": new URL("./packages/db/src/index.ts", import.meta.url).pathname,
      "@/lib/jwt-mint": new URL("./apps/web/lib/jwt-mint.ts", import.meta.url).pathname,
      "@/lib/oauth": new URL("./apps/web/lib/oauth.ts", import.meta.url).pathname,
      "@/lib/schema-provisioner": new URL("./apps/web/lib/schema-provisioner.ts", import.meta.url)
        .pathname,
      "@/lib/invitations": new URL("./apps/web/lib/invitations.ts", import.meta.url).pathname,
      "@/lib/management-api": new URL("./apps/web/lib/management-api.ts", import.meta.url).pathname,
    },
  },
});
