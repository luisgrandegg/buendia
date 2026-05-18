import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BuendiaApiError, BuendiaClient } from "./client";
import { registerTools } from "./tools";

/**
 * Coverage for `@buendia/mcp`:
 *
 *   - The HTTP client serialises the right headers + body and translates
 *     Buendia's error envelope into a typed exception.
 *   - The tool layer registers every tool listed in ticket 72 and each
 *     one forwards arguments through to the correct HTTP endpoint.
 *
 * The MCP transport is not exercised here — the SDK has its own tests
 * for stdio + HTTP framing. We care about the Buendia-specific wiring.
 */

interface MockFetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

interface MockResponseSpec {
  status?: number;
  body?: unknown;
  text?: string;
}

function mockFetch(responses: MockResponseSpec[]): {
  fetchImpl: typeof fetch;
  calls: MockFetchCall[];
} {
  const calls: MockFetchCall[] = [];
  let i = 0;
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    if (init?.headers) {
      const hs = init.headers as Record<string, string>;
      for (const k of Object.keys(hs)) headers[k] = hs[k]!;
    }
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    const spec = responses[i] ?? { status: 500, text: "" };
    i += 1;
    const status = spec.status ?? 200;
    const text =
      spec.text !== undefined
        ? spec.text
        : spec.body !== undefined
          ? JSON.stringify(spec.body)
          : "";
    return new Response(text, {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("BuendiaClient", () => {
  it("normalises baseUrl trailing slashes and sends Bearer auth + JSON content type", async () => {
    const { fetchImpl, calls } = mockFetch([{ body: { id: "u1" } }]);
    const client = new BuendiaClient({
      baseUrl: "https://buendia.app/",
      token: "buendia_pat_xyz",
      fetchImpl,
    });

    const out = await client.post<{ id: string }>("/api/v1/apps", { html: "<!doctype html>" });
    expect(out).toEqual({ id: "u1" });

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe("https://buendia.app/api/v1/apps");
    expect(call.method).toBe("POST");
    expect(call.headers.Authorization).toBe("Bearer buendia_pat_xyz");
    expect(call.headers["Content-Type"]).toBe("application/json");
    expect(call.body).toBe(JSON.stringify({ html: "<!doctype html>" }));
  });

  it("does not set Content-Type on GET requests without a body", async () => {
    const { fetchImpl, calls } = mockFetch([{ body: { ok: true } }]);
    const client = new BuendiaClient({ baseUrl: "https://buendia.app", token: "t", fetchImpl });
    await client.get("/api/v1/me");
    expect(calls[0]!.headers["Content-Type"]).toBeUndefined();
    expect(calls[0]!.body).toBeUndefined();
  });

  it("translates a Buendia error envelope into BuendiaApiError with the original code, message, status, details", async () => {
    const { fetchImpl } = mockFetch([
      {
        status: 404,
        body: { error: "not_found", message: "App not found.", details: { slug: "nope" } },
      },
    ]);
    const client = new BuendiaClient({ baseUrl: "https://buendia.app", token: "t", fetchImpl });
    await expect(client.get("/api/v1/apps/nope")).rejects.toMatchObject({
      name: "BuendiaApiError",
      status: 404,
      code: "not_found",
      message: "App not found.",
      details: { slug: "nope" },
    });
  });

  it("flags 401 responses as auth failures for the tool layer's reconnect hint", async () => {
    const { fetchImpl } = mockFetch([
      { status: 401, body: { error: "unauthenticated", message: "Token has been revoked." } },
    ]);
    const client = new BuendiaClient({ baseUrl: "https://buendia.app", token: "t", fetchImpl });
    try {
      await client.get("/api/v1/me");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(BuendiaApiError);
      const e = err as BuendiaApiError;
      expect(e.isAuth).toBe(true);
    }
  });

  it("throws a 'non_json_response' BuendiaApiError when Buendia returns HTML (e.g. a platform 500)", async () => {
    const { fetchImpl } = mockFetch([
      { status: 500, text: "<!doctype html><h1>Internal Error</h1>" },
    ]);
    const client = new BuendiaClient({ baseUrl: "https://buendia.app", token: "t", fetchImpl });
    await expect(client.get("/api/v1/me")).rejects.toMatchObject({
      name: "BuendiaApiError",
      status: 500,
      code: "non_json_response",
    });
  });

  it("constructor refuses empty baseUrl or token", () => {
    expect(() => new BuendiaClient({ baseUrl: "", token: "t" })).toThrow(/baseUrl/);
    expect(() => new BuendiaClient({ baseUrl: "x", token: "" })).toThrow(/token/);
  });
});

/* -----------------------------------------------------------------------
 * Tool registration
 *
 * We instantiate a real McpServer (no transport) and use a fake fetch so
 * each tool's handler exercises the actual SDK plumbing — schema
 * validation, response shaping, error reporting — without a network.
 * --------------------------------------------------------------------- */

describe("registerTools", () => {
  let fetchCalls: MockFetchCall[];
  let nextResponse: MockResponseSpec;
  let server: McpServer;
  let client: BuendiaClient;

  beforeEach(() => {
    fetchCalls = [];
    nextResponse = { body: { ok: true } };
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers: Record<string, string> = {};
      if (init?.headers) {
        const hs = init.headers as Record<string, string>;
        for (const k of Object.keys(hs)) headers[k] = hs[k]!;
      }
      fetchCalls.push({
        url: String(input),
        method: init?.method ?? "GET",
        headers,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      return new Response(
        nextResponse.text ??
          (nextResponse.body !== undefined ? JSON.stringify(nextResponse.body) : ""),
        {
          status: nextResponse.status ?? 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as unknown as typeof fetch;

    client = new BuendiaClient({
      baseUrl: "https://buendia.test",
      token: "buendia_pat_test",
      fetchImpl,
    });
    server = new McpServer({ name: "buendia-mcp-test", version: "0.0.0" });
    registerTools(server, client);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // The McpServer exposes registered tools via _registeredTools (a Map
  // keyed by tool name). It's not in the public types but the data is
  // stable; reaching into it lets us drive handlers without setting up
  // a transport.
  function callTool(name: string, args: Record<string, unknown>) {
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          {
            handler: (args: unknown, extra: unknown) => Promise<unknown>;
            inputSchema?: { parse: (input: unknown) => unknown };
          }
        >;
      }
    )._registeredTools;
    const tool = tools[name];
    if (!tool) throw new Error(`tool not registered: ${name}`);
    // The SDK pre-validates arguments against inputSchema before invoking
    // the handler on the wire path. Mirror that here so defaults (e.g.
    // role="viewer") get applied the way Claude would see them.
    const parsed = tool.inputSchema ? tool.inputSchema.parse(args) : args;
    return tool.handler(parsed, {});
  }

  it("registers every tool listed in the ticket", () => {
    const names = Object.keys(
      (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools,
    );
    expect(names.sort()).toEqual(
      [
        "delete_app",
        "get_app",
        "host_app",
        "invite_collaborator",
        "list_apps",
        "provision_schema",
        "remove_collaborator",
        "whoami",
      ].sort(),
    );
  });

  it("whoami hits GET /api/v1/me", async () => {
    nextResponse = { body: { id: "u1", email: "a@b.c" } };
    const out = (await callTool("whoami", {})) as {
      content: Array<{ text: string }>;
    };
    expect(fetchCalls[0]!.url).toBe("https://buendia.test/api/v1/me");
    expect(fetchCalls[0]!.method).toBe("GET");
    expect(JSON.parse(out.content[0]!.text)).toEqual({ id: "u1", email: "a@b.c" });
  });

  it("host_app forwards html + name + schema_sql in the request body", async () => {
    nextResponse = {
      status: 201,
      body: { id: "app1", slug: "my-app-abc", name: "My App", url: "https://b/a/my-app-abc" },
    };
    const out = (await callTool("host_app", {
      html: "<!doctype html><h1>hi</h1>",
      name: "My App",
      schema_sql: "create table todos (id uuid primary key);",
    })) as { content: Array<{ text: string }> };

    expect(fetchCalls[0]!.url).toBe("https://buendia.test/api/v1/apps");
    expect(fetchCalls[0]!.method).toBe("POST");
    const sentBody = JSON.parse(fetchCalls[0]!.body!);
    expect(sentBody.html).toBe("<!doctype html><h1>hi</h1>");
    expect(sentBody.name).toBe("My App");
    expect(sentBody.schema_sql).toContain("create table todos");
    const parsed = JSON.parse(out.content[0]!.text);
    expect(parsed.slug).toBe("my-app-abc");
    // Includes a next-step hint when schema_sql was supplied.
    expect(parsed.next_steps).toMatch(/provision_schema/);
  });

  it("get_app URL-encodes the slug", async () => {
    nextResponse = { body: { id: "x", slug: "weird slug" } };
    await callTool("get_app", { slug: "weird slug" });
    expect(fetchCalls[0]!.url).toBe("https://buendia.test/api/v1/apps/weird%20slug");
  });

  it("provision_schema POSTs to the schema route", async () => {
    nextResponse = { body: { provisioned: true, slug: "s", schema: "app_s" } };
    await callTool("provision_schema", { slug: "s" });
    expect(fetchCalls[0]!.method).toBe("POST");
    expect(fetchCalls[0]!.url).toBe("https://buendia.test/api/v1/apps/s/provision");
  });

  it("delete_app issues a DELETE", async () => {
    nextResponse = { body: { deleted: true, slug: "s" } };
    await callTool("delete_app", { slug: "s" });
    expect(fetchCalls[0]!.method).toBe("DELETE");
    expect(fetchCalls[0]!.url).toBe("https://buendia.test/api/v1/apps/s");
  });

  it("invite_collaborator defaults role to viewer when omitted", async () => {
    nextResponse = {
      status: 201,
      body: {
        kind: "invitation",
        invitation_id: "i",
        email: "new-collab@example.com",
        role: "viewer",
        url: "...",
      },
    };
    await callTool("invite_collaborator", { slug: "s", email: "new-collab@example.com" });
    const body = JSON.parse(fetchCalls[0]!.body!);
    expect(body.email).toBe("new-collab@example.com");
    expect(body.role).toBe("viewer");
  });

  it("remove_collaborator URL-encodes the target", async () => {
    nextResponse = { body: { removed: "invitation", invitation_id: "i" } };
    await callTool("remove_collaborator", { slug: "s", user_or_email: "foo+bar@example.com" });
    expect(fetchCalls[0]!.method).toBe("DELETE");
    expect(fetchCalls[0]!.url).toBe(
      "https://buendia.test/api/v1/apps/s/shares/foo%2Bbar%40example.com",
    );
  });

  it("surfaces a Buendia auth error with a reconnect hint in the text", async () => {
    nextResponse = {
      status: 401,
      body: { error: "unauthenticated", message: "Token not recognized." },
    };
    const out = (await callTool("whoami", {})) as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };
    expect(out.isError).toBe(true);
    expect(out.content[0]!.text).toMatch(/401/);
    expect(out.content[0]!.text).toMatch(/Reconnect Buendia/);
  });

  it("surfaces a non-auth Buendia error without the reconnect hint", async () => {
    nextResponse = {
      status: 404,
      body: { error: "not_found", message: "App not found." },
    };
    const out = (await callTool("get_app", { slug: "ghost" })) as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };
    expect(out.isError).toBe(true);
    expect(out.content[0]!.text).toMatch(/404/);
    expect(out.content[0]!.text).not.toMatch(/Reconnect Buendia/);
  });
});
