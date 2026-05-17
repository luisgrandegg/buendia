import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BuendiaAppConfig } from "@buendia/shared";

declare global {
  interface Window {
    __APP_CONFIG__?: BuendiaAppConfig;
  }
}

export type BuendiaMode = "hosted" | "standalone";

export interface BuendiaUser {
  id: string;
  email: string;
  role: BuendiaAppConfig["user"]["role"];
}

export interface BuendiaApp {
  id: string;
  name: string;
  slug: string;
}

export interface BuendiaClient {
  mode: BuendiaMode;
  db: SupabaseClient;
  user: BuendiaUser;
  app: BuendiaApp;
  /** Raw injected config. Stable but treat as read-only. */
  raw: BuendiaAppConfig;
}

/**
 * Bootstrapping entry point. App authors do:
 *
 *   <script src="https://cdn.buendia.app/sdk/v1/buendia.js"></script>
 *   <script>
 *     const platform = await Buendia.init();
 *     platform.db.from("todos").select(...)
 *   </script>
 *
 * In hosted mode, `window.__APP_CONFIG__` is injected by the edge serve
 * route (ticket 22). In standalone mode (ticket 24), a setup overlay
 * collects credentials and writes them into localStorage; the SDK
 * surface is identical either way.
 */
export async function init(): Promise<BuendiaClient> {
  if (typeof window === "undefined") {
    throw new Error("Buendia.init() must run in the browser");
  }

  const config = window.__APP_CONFIG__;
  if (!config) {
    throw new Error(
      "Buendia: window.__APP_CONFIG__ is missing. " +
        "Open this app from Buendia (e.g. /a/<slug>), or wait for the standalone overlay (ticket 24).",
    );
  }

  return buildHostedClient(config);
}

function buildHostedClient(config: BuendiaAppConfig): BuendiaClient {
  // The JWT we ship in __APP_CONFIG__ is short-lived. Ticket 26 wires up
  // a refresh timer that POSTs to config.refreshUrl every ~10 minutes
  // and replaces this value via the closure variable, so the Supabase
  // client picks up the latest token without recreating itself.
  let currentJwt = config.jwt;

  const headers: Record<string, string> = {
    "Accept-Profile": config.app.schema,
    "Content-Profile": config.app.schema,
  };

  const db = createClient(config.supabaseUrl, config.publishableKey, {
    global: { headers },
    db: { schema: config.app.schema as never },
    accessToken: async () => currentJwt,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  // Hand-back hook for ticket 26 to plug into without recreating the
  // client. Not part of the public surface yet.
  void ((newJwt: string) => {
    currentJwt = newJwt;
  });

  return {
    mode: "hosted",
    db,
    user: {
      id: config.user.id,
      email: config.user.email,
      role: config.user.role,
    },
    app: {
      id: config.app.id,
      name: config.app.name,
      slug: config.app.slug,
    },
    raw: config,
  };
}

// Re-export the shared type so SDK consumers don't need a separate import
// from `@buendia/shared`.
export type { BuendiaAppConfig } from "@buendia/shared";
