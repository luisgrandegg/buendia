export const PRODUCT_NAME = "Buendia";
export const PRODUCT_TAGLINE =
  "A hosted runtime for AI-generated single-file HTML apps. Apps live on Buendia; app data lives in the user's own backend.";

export const SDK_CDN_PATH = "/sdk/v1/buendia.js";
export const JWT_TTL_SECONDS = 15 * 60;
export const JWT_REFRESH_INTERVAL_SECONDS = 10 * 60;

export type PlatformMode = "saas" | "self-hosted";
export type AppRole = "owner" | "editor" | "viewer";
