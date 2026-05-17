#!/usr/bin/env node
/**
 * Copy the built SDK IIFE bundle into apps/web/public so Next.js can
 * serve it as a static asset at /sdk/v1/buendia.js.
 *
 * Turbo builds `@buendia/sdk` before `@buendia/web` (via the `^build`
 * dependency in turbo.json), so by the time this script runs in
 * production the bundle already exists. For local `pnpm dev`, the
 * `predev` script forces an SDK build first.
 */

import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "..", "..", "..", "packages", "sdk", "dist", "index.global.js");
const dest = resolve(here, "..", "public", "sdk", "v1", "buendia.js");

if (!existsSync(src)) {
  console.error(
    `[sync-sdk] SDK bundle not found at ${src}. ` +
      `Run 'pnpm --filter @buendia/sdk build' first, or rely on Turbo's ^build ordering.`,
  );
  process.exit(1);
}

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log(`[sync-sdk] copied SDK IIFE bundle → ${dest}`);
