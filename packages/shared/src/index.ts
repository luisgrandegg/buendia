export const PRODUCT_NAME = "Buendia";
export const PRODUCT_TAGLINE =
  "A hosted runtime for AI-generated single-file HTML apps. Apps live on Buendia; app data lives in the user's own backend.";

export const SDK_CDN_PATH = "/sdk/v1/buendia.js";
export const JWT_TTL_SECONDS = 15 * 60;
export const JWT_REFRESH_INTERVAL_SECONDS = 10 * 60;

export type PlatformMode = "saas" | "self-hosted";
export type AppRole = "owner" | "editor" | "viewer";

/**
 * Shape the edge serve route injects as `window.__APP_CONFIG__` and the
 * SDK reads on init. Stable enough to commit to: app code shouldn't
 * branch on what it finds here, only on `mode` (which is set by the SDK,
 * not the edge route).
 */
export interface BuendiaAppConfig {
  /** Always present in hosted mode. */
  hosted: true;

  /** Owner's Supabase project URL, e.g. `https://<ref>.supabase.co`. */
  supabaseUrl: string;
  /** Owner's publishable (anon-equivalent) key. */
  publishableKey: string;

  /** Short-lived JWT signed with the owner's project JWT secret. */
  jwt: string;
  /** Unix seconds. The SDK silent-refreshes ~5 minutes before this. */
  jwtExp: number;

  user: {
    id: string;
    email: string;
    role: AppRole;
  };

  app: {
    id: string;
    name: string;
    slug: string;
    schema: string;
    teamId: string;
  };

  /** Endpoint the SDK POSTs to for `{ jwt, exp }` refreshes. */
  refreshUrl: string;
}
