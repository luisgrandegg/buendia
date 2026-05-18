import { describe, expect, it } from "vitest";

import {
  JWT_REFRESH_INTERVAL_SECONDS,
  JWT_TTL_SECONDS,
  PRODUCT_NAME,
  PRODUCT_TAGLINE,
  SDK_CDN_PATH,
} from "./index";

/**
 * Coverage for the shared constants (PR #1 baseline). These cross both the
 * SDK and the edge serve route, so a typo is a wire-format break.
 */

describe("shared constants", () => {
  it("exposes the product identity strings", () => {
    expect(PRODUCT_NAME).toBe("Buendia");
    expect(PRODUCT_TAGLINE).toMatch(/single-file/);
  });

  it("pins the public SDK CDN path", () => {
    // App authors hard-code <script src="…/sdk/v1/buendia.js"> in their HTML.
    // Bumping the path is a breaking change for every shipped app.
    expect(SDK_CDN_PATH).toBe("/sdk/v1/buendia.js");
  });

  it("ties the JWT TTL and refresh cadence together correctly", () => {
    expect(JWT_TTL_SECONDS).toBe(15 * 60);
    expect(JWT_REFRESH_INTERVAL_SECONDS).toBe(10 * 60);
    // The SDK must refresh before the token expires.
    expect(JWT_REFRESH_INTERVAL_SECONDS).toBeLessThan(JWT_TTL_SECONDS);
  });
});
