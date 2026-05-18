// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BuendiaAppConfig } from "@buendia/shared";

/**
 * Coverage for the SDK, which ships from PRs:
 *   - #16 SDK v1 hosted mode
 *   - #18 background JWT refresh + revocation overlay
 *   - #19 realtime subscribe
 *   - #20 standalone overlay
 *
 * The supabase-js client is mocked so we exercise the SDK's wiring
 * (channel name, schema, accessToken callback) without booting a real
 * websocket or making network calls.
 */

type ChannelHandler = (payload: {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: unknown;
  old: unknown;
}) => void;

interface MockChannel {
  name: string;
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  handlers: ChannelHandler[];
  filters: Array<{ event: string; schema: string; table: string }>;
}

interface MockClient {
  options: unknown;
  url: string;
  key: string;
  channel: ReturnType<typeof vi.fn>;
  removeChannel: ReturnType<typeof vi.fn>;
  channels: MockChannel[];
}

const clients: MockClient[] = [];

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn((url: string, key: string, options: unknown) => {
    const client: MockClient = {
      url,
      key,
      options,
      channels: [],
      channel: vi.fn(),
      removeChannel: vi.fn(),
    };
    client.channel.mockImplementation((name: string) => {
      const ch: MockChannel = {
        name,
        handlers: [],
        filters: [],
        on: vi.fn(),
        subscribe: vi.fn(),
      };
      ch.on.mockImplementation(
        (
          _evt: string,
          filter: { event: string; schema: string; table: string },
          handler: ChannelHandler,
        ) => {
          ch.filters.push(filter);
          ch.handlers.push(handler);
          return ch;
        },
      );
      ch.subscribe.mockImplementation(() => ch);
      client.channels.push(ch);
      return ch;
    });
    clients.push(client);
    return client;
  }),
}));

function makeConfig(overrides: Partial<BuendiaAppConfig> = {}): BuendiaAppConfig {
  return {
    hosted: true,
    supabaseUrl: "https://abc.supabase.co",
    publishableKey: "pub-key",
    jwt: "initial.jwt",
    jwtExp: Math.floor(Date.now() / 1000) + 15 * 60,
    user: { id: "u-1", email: "u@example.com", role: "editor" },
    app: { id: "a-1", name: "Todos", slug: "todos", schema: "app_todos", teamId: "team-1" },
    refreshUrl: "/api/jwt/refresh?app=a-1",
    ...overrides,
  };
}

beforeEach(() => {
  clients.length = 0;
  delete (window as unknown as { __APP_CONFIG__?: unknown }).__APP_CONFIG__;
  localStorage.clear();
  document.body.innerHTML = "";
  vi.useFakeTimers();
});

afterEach(() => {
  // Drain any setTimeout(tick) chains still scheduled inside the SDK so
  // they don't leak into the next test.
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("init() environment guards", () => {
  it("throws when window is missing", async () => {
    const { init } = await import("./index");
    // Snapshot then remove `window` to simulate server-side.
    const savedWindow = globalThis.window;
    // @ts-expect-error simulating server-side
    delete globalThis.window;
    try {
      await expect(init()).rejects.toThrow(/must run in the browser/);
    } finally {
      globalThis.window = savedWindow;
    }
  });
});

describe("hosted mode (PR #16)", () => {
  it("returns a client with mode='hosted' wired to the injected config", async () => {
    const config = makeConfig();
    (window as unknown as { __APP_CONFIG__: BuendiaAppConfig }).__APP_CONFIG__ = config;

    const { init } = await import("./index");
    const platform = await init();

    expect(platform.mode).toBe("hosted");
    expect(platform.user).toEqual({ id: "u-1", email: "u@example.com", role: "editor" });
    expect(platform.app).toEqual({ id: "a-1", name: "Todos", slug: "todos" });
    expect(platform.raw).toBe(config);
  });

  it("wires the supabase client with the owner's URL, key, and per-app schema headers", async () => {
    const config = makeConfig();
    (window as unknown as { __APP_CONFIG__: BuendiaAppConfig }).__APP_CONFIG__ = config;

    const { init } = await import("./index");
    await init();

    const client = clients.at(-1)!;
    expect(client.url).toBe(config.supabaseUrl);
    expect(client.key).toBe(config.publishableKey);

    const options = client.options as {
      global: { headers: Record<string, string> };
      db: { schema: string };
      auth: { persistSession: boolean; autoRefreshToken: boolean; detectSessionInUrl: boolean };
      accessToken: () => Promise<string>;
    };
    expect(options.global.headers["Accept-Profile"]).toBe("app_todos");
    expect(options.global.headers["Content-Profile"]).toBe("app_todos");
    expect(options.db.schema).toBe("app_todos");
    expect(options.auth).toEqual({
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    });
    expect(await options.accessToken()).toBe(config.jwt);
  });
});

describe("subscribe() (PR #19)", () => {
  it("opens a channel scoped to schema + table and returns an unsubscribe fn", async () => {
    const config = makeConfig();
    (window as unknown as { __APP_CONFIG__: BuendiaAppConfig }).__APP_CONFIG__ = config;

    const { init } = await import("./index");
    const platform = await init();

    const cb = vi.fn();
    const unsub = platform.subscribe("todos", cb);

    const client = clients.at(-1)!;
    expect(client.channel).toHaveBeenCalledWith("buendia:app_todos:todos");
    const ch = client.channels[0]!;
    expect(ch.filters[0]).toEqual({ event: "*", schema: "app_todos", table: "todos" });
    expect(ch.subscribe).toHaveBeenCalled();

    // Simulate a server-side INSERT.
    ch.handlers[0]!({ eventType: "INSERT", new: { id: 1 }, old: null });
    expect(cb).toHaveBeenCalledWith({
      type: "INSERT",
      table: "todos",
      schema: "app_todos",
      new: { id: 1 },
      old: null,
    });

    unsub();
    expect(client.removeChannel).toHaveBeenCalledWith(ch);
  });
});

describe("background JWT refresh (PR #18)", () => {
  it("fires shortly before exp and updates the current JWT used by accessToken()", async () => {
    const now = Math.floor(Date.now() / 1000);
    const config = makeConfig({ jwtExp: now + 60, refreshUrl: "/refresh" });
    (window as unknown as { __APP_CONFIG__: BuendiaAppConfig }).__APP_CONFIG__ = config;

    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ jwt: "rotated.jwt", exp: now + 900 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { init } = await import("./index");
    const platform = await init();
    const options = clients.at(-1)!.options as { accessToken: () => Promise<string> };

    // Initial token in flight.
    expect(await options.accessToken()).toBe("initial.jwt");

    // Advance past the floor (5s) so the refresh tick fires.
    await vi.advanceTimersByTimeAsync(6_000);
    // Let the awaited fetch promise resolve.
    await vi.runOnlyPendingTimersAsync();

    expect(fetchMock).toHaveBeenCalledWith(
      "/refresh",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
    expect(await options.accessToken()).toBe("rotated.jwt");
    // Platform.raw remains the original injected config snapshot.
    expect(platform.raw).toBe(config);
  });

  it("mounts the revocation overlay on 401 and stops refreshing", async () => {
    const now = Math.floor(Date.now() / 1000);
    (window as unknown as { __APP_CONFIG__: BuendiaAppConfig }).__APP_CONFIG__ = makeConfig({
      jwtExp: now + 60,
    });

    const fetchMock = vi.fn(async () => new Response("nope", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const { init } = await import("./index");
    await init();

    await vi.advanceTimersByTimeAsync(6_000);
    await vi.runOnlyPendingTimersAsync();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(document.getElementById("buendia-revoked-overlay")).not.toBeNull();

    // Confirm the loop is stopped: more elapsed time should not fire another fetch.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on transient (5xx) without mounting the overlay", async () => {
    const now = Math.floor(Date.now() / 1000);
    (window as unknown as { __APP_CONFIG__: BuendiaAppConfig }).__APP_CONFIG__ = makeConfig({
      jwtExp: now + 60,
    });

    const fetchMock = vi.fn(async () => new Response("oops", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const { init } = await import("./index");
    await init();

    await vi.advanceTimersByTimeAsync(6_000);
    await vi.runOnlyPendingTimersAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(document.getElementById("buendia-revoked-overlay")).toBeNull();

    // Retry kicks in after REFRESH_RETRY_DELAY_MS (30s). Don't drain
    // further — each retry schedules another, so we'd loop forever.
    await vi.advanceTimersByTimeAsync(31_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries on network failure (fetch reject)", async () => {
    const now = Math.floor(Date.now() / 1000);
    (window as unknown as { __APP_CONFIG__: BuendiaAppConfig }).__APP_CONFIG__ = makeConfig({
      jwtExp: now + 60,
    });

    const fetchMock = vi.fn(async () => {
      throw new Error("offline");
    });
    vi.stubGlobal("fetch", fetchMock);

    const { init } = await import("./index");
    await init();

    await vi.advanceTimersByTimeAsync(6_000);
    await vi.runOnlyPendingTimersAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(31_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("standalone mode (PR #20)", () => {
  it("always prompts for the publishable key, even when URL + schema are remembered (audit §M9)", async () => {
    // Persisted shape stores URL + schema only — the publishable key is
    // never written to localStorage.
    localStorage.setItem(
      "buendia:standalone",
      JSON.stringify({ supabaseUrl: "https://x.supabase.co", schema: "app_local" }),
    );

    const { init } = await import("./index");
    const initPromise = init();

    const overlay = document.getElementById("buendia-standalone-overlay");
    expect(overlay).not.toBeNull();

    const form = overlay!.querySelector<HTMLFormElement>("#buendia-standalone-form")!;
    const urlInput = form.querySelector<HTMLInputElement>('input[name="url"]')!;
    const schemaInput = form.querySelector<HTMLInputElement>('input[name="schema"]')!;
    const keyInput = form.querySelector<HTMLInputElement>('input[name="key"]')!;

    // URL + schema are pre-filled; key is blank.
    expect(urlInput.value).toBe("https://x.supabase.co");
    expect(schemaInput.value).toBe("app_local");
    expect(keyInput.value).toBe("");

    keyInput.value = "sb_publishable_x";
    form.dispatchEvent(new window.Event("submit", { cancelable: true, bubbles: true }));

    const platform = await initPromise;
    expect(platform.mode).toBe("standalone");
    const client = clients.at(-1)!;
    expect(client.url).toBe("https://x.supabase.co");
    expect(client.key).toBe("sb_publishable_x");
  });

  it("persists URL + schema after submit, but never the publishable key (audit §M9)", async () => {
    const { init } = await import("./index");
    const initPromise = init();

    const overlay = document.getElementById("buendia-standalone-overlay");
    expect(overlay).not.toBeNull();

    const form = overlay!.querySelector<HTMLFormElement>("#buendia-standalone-form")!;
    (form.querySelector('input[name="url"]') as HTMLInputElement).value = "https://y.supabase.co";
    (form.querySelector('input[name="key"]') as HTMLInputElement).value = "sb_publishable_y";
    (form.querySelector('input[name="schema"]') as HTMLInputElement).value = "app_y";
    form.dispatchEvent(new window.Event("submit", { cancelable: true, bubbles: true }));

    const platform = await initPromise;
    expect(platform.mode).toBe("standalone");
    expect(platform.app.slug).toBe("app_y");
    expect(document.getElementById("buendia-standalone-overlay")).toBeNull();

    const persisted = JSON.parse(localStorage.getItem("buendia:standalone")!) as Record<
      string,
      unknown
    >;
    expect(persisted).toEqual({ supabaseUrl: "https://y.supabase.co", schema: "app_y" });
    // Crucially, the key is *not* in the stored blob.
    expect(persisted.publishableKey).toBeUndefined();
  });

  it("ignores a malformed localStorage entry and falls through to a blank overlay", async () => {
    localStorage.setItem("buendia:standalone", "not json");

    const { init } = await import("./index");
    void init();

    const overlay = document.getElementById("buendia-standalone-overlay");
    expect(overlay).not.toBeNull();

    const form = overlay!.querySelector<HTMLFormElement>("#buendia-standalone-form")!;
    expect((form.querySelector('input[name="url"]') as HTMLInputElement).value).toBe("");
    expect((form.querySelector('input[name="schema"]') as HTMLInputElement).value).toBe("");
  });

  it("rejects a partial localStorage entry (no schema) and falls through to a blank overlay", async () => {
    localStorage.setItem(
      "buendia:standalone",
      JSON.stringify({ supabaseUrl: "https://x.supabase.co" }),
    );
    const { init } = await import("./index");
    void init();
    const overlay = document.getElementById("buendia-standalone-overlay");
    expect(overlay).not.toBeNull();

    const form = overlay!.querySelector<HTMLFormElement>("#buendia-standalone-form")!;
    expect((form.querySelector('input[name="url"]') as HTMLInputElement).value).toBe("");
  });
});
