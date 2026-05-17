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

export type RealtimeChangeType = "INSERT" | "UPDATE" | "DELETE";

export interface RealtimeChange<Row = Record<string, unknown>> {
  type: RealtimeChangeType;
  table: string;
  schema: string;
  new: Row | null;
  old: Row | null;
}

export type Unsubscribe = () => void;

export interface BuendiaClient {
  mode: BuendiaMode;
  db: SupabaseClient;
  user: BuendiaUser;
  app: BuendiaApp;
  /**
   * Subscribe to INSERT / UPDATE / DELETE changes on a table in the
   * app's schema. Returns an `Unsubscribe` function — call it on
   * teardown.
   */
  subscribe: <Row = Record<string, unknown>>(
    table: string,
    callback: (change: RealtimeChange<Row>) => void,
  ) => Unsubscribe;
  /** Raw injected config. Stable but treat as read-only. */
  raw: BuendiaAppConfig;
}

const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const REFRESH_RETRY_DELAY_MS = 30 * 1000;

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
  // The Supabase client reads this via the accessToken callback on every
  // request, so updating it from a refresh keeps the client current
  // without recreating it.
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

  // Background JWT refresh + revocation overlay. Never throws; failures
  // either retry quietly (transient) or terminate with the overlay
  // (revoked).
  scheduleJwtRefresh({
    initialExpEpoch: config.jwtExp,
    refreshUrl: config.refreshUrl,
    onNewJwt: (jwt) => {
      currentJwt = jwt;
    },
    onRevoked: () => mountRevocationOverlay(),
  });

  const subscribe = makeSubscribe(db, config.app.schema);

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
    subscribe,
    raw: config,
  };
}

function makeSubscribe(db: SupabaseClient, schema: string): BuendiaClient["subscribe"] {
  return <Row = Record<string, unknown>>(
    table: string,
    callback: (change: RealtimeChange<Row>) => void,
  ): Unsubscribe => {
    // Channel name includes schema + table so multiple subscriptions on
    // the same client don't collide.
    const channel = db
      .channel(`buendia:${schema}:${table}`)
      .on(
        // The supabase-js types want a literal; cast to keep the call
        // site readable and free of generated-type churn.
        "postgres_changes" as never,
        { event: "*", schema, table },
        (payload: { eventType: RealtimeChangeType; new: Row | null; old: Row | null }) => {
          callback({
            type: payload.eventType,
            table,
            schema,
            new: payload.new,
            old: payload.old,
          });
        },
      )
      .subscribe();

    return () => {
      void db.removeChannel(channel);
    };
  };
}

interface ScheduleParams {
  initialExpEpoch: number;
  refreshUrl: string;
  onNewJwt: (jwt: string) => void;
  onRevoked: () => void;
}

/**
 * Refresh the JWT every {@link REFRESH_INTERVAL_MS}, and once around 30
 * seconds before the initial token's `exp` (whichever comes first). A
 * 401/403 ends the loop and triggers the revocation overlay; transient
 * failures (network, 5xx) back off and retry.
 */
function scheduleJwtRefresh({
  initialExpEpoch,
  refreshUrl,
  onNewJwt,
  onRevoked,
}: ScheduleParams): void {
  let stopped = false;

  const initialDelay = pickInitialDelay(initialExpEpoch);

  const tick = async (): Promise<void> => {
    if (stopped) return;

    let res: Response;
    try {
      res = await fetch(refreshUrl, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Network blip — retry shortly. Don't terminate the loop on these.
      window.setTimeout(tick, REFRESH_RETRY_DELAY_MS);
      return;
    }

    if (res.status === 401 || res.status === 403) {
      stopped = true;
      onRevoked();
      return;
    }

    if (!res.ok) {
      // 5xx or other transient — back off and retry.
      window.setTimeout(tick, REFRESH_RETRY_DELAY_MS);
      return;
    }

    let payload: { jwt?: string; exp?: number } | null = null;
    try {
      payload = (await res.json()) as { jwt?: string; exp?: number };
    } catch {
      window.setTimeout(tick, REFRESH_RETRY_DELAY_MS);
      return;
    }

    if (!payload?.jwt) {
      window.setTimeout(tick, REFRESH_RETRY_DELAY_MS);
      return;
    }

    onNewJwt(payload.jwt);
    window.setTimeout(tick, REFRESH_INTERVAL_MS);
  };

  window.setTimeout(tick, initialDelay);
}

function pickInitialDelay(expEpoch: number): number {
  const nowMs = Date.now();
  const expMs = expEpoch * 1000;
  // Refresh ~30 s before expiry or on REFRESH_INTERVAL_MS, whichever
  // comes first. Floor at 5 s so we never fire instantly on a stale
  // token (the user might still be reading the page).
  const beforeExp = expMs - nowMs - 30_000;
  const interval = REFRESH_INTERVAL_MS;
  const chosen = Math.min(beforeExp, interval);
  return Math.max(chosen, 5_000);
}

/**
 * Mount a non-dismissable overlay covering the page when the JWT
 * refresh fails with 401/403. The app's UI stays mounted underneath —
 * we just make it unreachable so the user gets a clear, single message
 * instead of a stream of silent permission errors.
 */
function mountRevocationOverlay(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById("buendia-revoked-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "buendia-revoked-overlay";
  overlay.setAttribute("role", "alertdialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "buendia-revoked-title");

  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    background: "rgba(17, 24, 39, 0.75)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: "2147483647",
    fontFamily: "system-ui, -apple-system, sans-serif",
    color: "#111827",
    padding: "1.5rem",
  });

  const card = document.createElement("div");
  Object.assign(card.style, {
    background: "white",
    borderRadius: "0.5rem",
    padding: "1.5rem 1.75rem",
    maxWidth: "26rem",
    width: "100%",
    boxShadow: "0 20px 50px -10px rgba(0,0,0,0.4)",
  });

  const title = document.createElement("h1");
  title.id = "buendia-revoked-title";
  title.textContent = "Your access to this app was removed.";
  Object.assign(title.style, { fontSize: "1.125rem", margin: "0 0 0.5rem 0" });

  const body = document.createElement("p");
  body.textContent =
    "The owner revoked your access, or your session ended. If you think this is a mistake, ask them to re-invite you.";
  Object.assign(body.style, {
    color: "#4b5563",
    margin: "0 0 1.25rem 0",
    fontSize: "0.9375rem",
    lineHeight: "1.5",
  });

  const back = document.createElement("a");
  back.textContent = "Back to Buendia";
  back.href = "/";
  Object.assign(back.style, {
    display: "inline-block",
    padding: "0.5rem 1rem",
    borderRadius: "0.375rem",
    background: "#111827",
    color: "white",
    textDecoration: "none",
    fontSize: "0.9375rem",
  });

  card.appendChild(title);
  card.appendChild(body);
  card.appendChild(back);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

// Re-export the shared type so SDK consumers don't need a separate import
// from `@buendia/shared`.
export type { BuendiaAppConfig } from "@buendia/shared";
