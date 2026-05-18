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

  if (window.__APP_CONFIG__) {
    return buildHostedClient(window.__APP_CONFIG__);
  }

  const standalone = readStandaloneConfig() ?? (await promptStandaloneConfig());
  return buildStandaloneClient(standalone);
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
    getJwt: () => currentJwt,
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

/* -----------------------------------------------------------------------
 * Standalone mode (ticket 24)
 *
 * When an app is opened from `file://`, a static host, or anywhere
 * without Buendia injecting `window.__APP_CONFIG__`, we render a setup
 * overlay that asks for a Supabase URL + publishable key + schema, then
 * use those values directly. There's no per-user JWT, no refresh, no
 * revocation. App data security falls back entirely on RLS — that's a
 * knowing degradation. The constitution allows it precisely so apps
 * stay portable.
 * --------------------------------------------------------------------- */

const STANDALONE_LOCAL_STORAGE_KEY = "buendia:standalone";

interface StandaloneConfig {
  supabaseUrl: string;
  publishableKey: string;
  schema: string;
}

function readStandaloneConfig(): StandaloneConfig | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STANDALONE_LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StandaloneConfig>;
    if (!parsed.supabaseUrl || !parsed.publishableKey || !parsed.schema) {
      return null;
    }
    return {
      supabaseUrl: parsed.supabaseUrl,
      publishableKey: parsed.publishableKey,
      schema: parsed.schema,
    };
  } catch {
    return null;
  }
}

function persistStandaloneConfig(config: StandaloneConfig): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STANDALONE_LOCAL_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Some environments (private mode, certain webviews) deny
    // localStorage. The session still works for the lifetime of the
    // current page; the user just has to re-enter on reload.
  }
}

function promptStandaloneConfig(): Promise<StandaloneConfig> {
  if (typeof document === "undefined") {
    return Promise.reject(new Error("Buendia: standalone overlay needs a DOM"));
  }

  return new Promise<StandaloneConfig>((resolve) => {
    const overlay = document.createElement("div");
    overlay.id = "buendia-standalone-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "buendia-standalone-title");

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

    overlay.innerHTML = `
      <form id="buendia-standalone-form" style="
        background:white;border-radius:0.5rem;padding:1.5rem 1.75rem;
        max-width:28rem;width:100%;
        box-shadow:0 20px 50px -10px rgba(0,0,0,0.4);
      ">
        <h1 id="buendia-standalone-title" style="font-size:1.125rem;margin:0 0 0.5rem 0;">
          Connect this app to a Supabase project
        </h1>
        <p style="color:#4b5563;margin:0 0 1.25rem 0;font-size:0.9375rem;line-height:1.5;">
          This app is running outside of Buendia. Point it at a Supabase project you control.
          Stored locally; nothing is sent to Buendia.
        </p>

        <label style="display:block;font-size:0.875rem;margin-bottom:0.375rem;">
          Supabase project URL
        </label>
        <input name="url" type="url" required placeholder="https://your-project.supabase.co"
          style="width:100%;padding:0.5rem 0.75rem;border-radius:0.375rem;
                 border:1px solid #d1d5db;font-size:0.9375rem;margin-bottom:0.875rem;
                 box-sizing:border-box;" />

        <label style="display:block;font-size:0.875rem;margin-bottom:0.375rem;">
          Publishable key (sb_publishable_…)
        </label>
        <input name="key" type="text" required placeholder="sb_publishable_…"
          style="width:100%;padding:0.5rem 0.75rem;border-radius:0.375rem;
                 border:1px solid #d1d5db;font-size:0.9375rem;
                 font-family:ui-monospace,monospace;margin-bottom:0.875rem;
                 box-sizing:border-box;" />

        <label style="display:block;font-size:0.875rem;margin-bottom:0.375rem;">
          Schema name
        </label>
        <input name="schema" type="text" required placeholder="app_my_slug" pattern="^[a-z][a-z0-9_]*$"
          style="width:100%;padding:0.5rem 0.75rem;border-radius:0.375rem;
                 border:1px solid #d1d5db;font-size:0.9375rem;
                 font-family:ui-monospace,monospace;margin-bottom:1rem;
                 box-sizing:border-box;" />

        <p style="background:#fef3c7;border:1px solid #fde68a;color:#92400e;
                  padding:0.625rem 0.75rem;border-radius:0.375rem;
                  font-size:0.8125rem;margin:0 0 1rem 0;line-height:1.5;">
          Standalone mode uses the publishable key directly. Security depends entirely on
          your project's RLS policies. To get per-user auth and revocation, host the app on
          Buendia.
        </p>

        <div style="display:flex;justify-content:flex-end;">
          <button type="submit" style="
            padding:0.5rem 1rem;border-radius:0.375rem;border:1px solid #111827;
            background:#111827;color:white;font-size:0.9375rem;cursor:pointer;
          ">Connect</button>
        </div>
      </form>
    `;

    document.body.appendChild(overlay);

    const form = overlay.querySelector<HTMLFormElement>("#buendia-standalone-form");
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const supabaseUrl = String(data.get("url") ?? "").trim();
      const publishableKey = String(data.get("key") ?? "").trim();
      const schema = String(data.get("schema") ?? "").trim();

      if (!supabaseUrl || !publishableKey || !schema) return;

      const config: StandaloneConfig = { supabaseUrl, publishableKey, schema };
      persistStandaloneConfig(config);
      overlay.remove();
      resolve(config);
    });
  });
}

function buildStandaloneClient(config: StandaloneConfig): BuendiaClient {
  const headers: Record<string, string> = {
    "Accept-Profile": config.schema,
    "Content-Profile": config.schema,
  };

  const db = createClient(config.supabaseUrl, config.publishableKey, {
    global: { headers },
    db: { schema: config.schema as never },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const subscribe = makeSubscribe(db, config.schema);

  return {
    mode: "standalone",
    db,
    // Standalone mode has no per-user identity — there's no Buendia JWT
    // mint, no auth. App authors should not rely on `user.id`. We fill
    // an "anonymous" sentinel so the surface stays stable across modes.
    user: {
      id: "anonymous",
      email: "",
      role: "viewer",
    },
    app: {
      id: config.schema,
      name: config.schema,
      slug: config.schema,
    },
    subscribe,
    raw: {
      hosted: true,
      supabaseUrl: config.supabaseUrl,
      publishableKey: config.publishableKey,
      jwt: "",
      jwtExp: 0,
      user: { id: "anonymous", email: "", role: "viewer" },
      app: {
        id: config.schema,
        name: config.schema,
        slug: config.schema,
        schema: config.schema,
        teamId: "anonymous",
      },
      refreshUrl: "",
    },
  };
}

interface ScheduleParams {
  initialExpEpoch: number;
  refreshUrl: string;
  /**
   * Returns the JWT the next refresh call should authenticate with.
   * Read fresh on every tick so the caller's update in `onNewJwt`
   * propagates without us holding a stale value. See
   * SECURITY_AUDIT.md §H4 — refresh no longer leans on first-party
   * session cookies.
   */
  getJwt: () => string;
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
  getJwt,
  onNewJwt,
  onRevoked,
}: ScheduleParams): void {
  let stopped = false;

  const initialDelay = pickInitialDelay(initialExpEpoch);

  const tick = async (): Promise<void> => {
    if (stopped) return;

    let res: Response;
    try {
      // Bearer auth, no cookies. See SECURITY_AUDIT.md §H4 — the SDK
      // no longer relies on dashboard session cookies, so this works
      // identically from a future cookieless sandbox origin (ticket 75).
      res = await fetch(refreshUrl, {
        method: "POST",
        credentials: "omit",
        redirect: "error",
        headers: { Authorization: `Bearer ${getJwt()}` },
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
