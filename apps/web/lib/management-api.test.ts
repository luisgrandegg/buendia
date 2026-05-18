import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createProject,
  DEFAULT_PROJECT_PLAN,
  DEFAULT_PROJECT_REGION,
  executeSql,
  getProjectApiKeys,
  getProjectJwtSecret,
  getProjectStatus,
  isFatalStatus,
  listOrganizations,
  ManagementApiError,
  projectUrl,
  waitForProjectReady,
} from "./management-api";

/**
 * Coverage for PR #11 (project provisioner via Management API). The
 * client is a thin fetch wrapper, so tests assert request shape (method,
 * path, headers, body) and response handling (success, 204, error).
 */

const API = "https://api.supabase.com";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

interface CallSpec {
  status?: number;
  body?: unknown;
}

type FetchFn = (input: string | URL, init?: RequestInit) => Promise<Response>;

function mockFetchOnce(spec: CallSpec) {
  const fetchMock = vi.fn<FetchFn>(async () => {
    const status = spec.status ?? 200;
    if (status === 204) return new Response(null, { status });
    return new Response(JSON.stringify(spec.body ?? {}), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Queue up responses for a multi-call code path; later calls reuse the
 *  last spec so a test can be tolerant of extra retries. */
function mockFetchSequence(specs: CallSpec[]) {
  const queue = [...specs];
  const fetchMock = vi.fn<FetchFn>(async () => {
    const spec = queue.length > 1 ? queue.shift()! : queue[0]!;
    const status = spec.status ?? 200;
    if (status === 204) return new Response(null, { status });
    return new Response(JSON.stringify(spec.body ?? {}), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("listOrganizations", () => {
  it("GETs /v1/organizations with a Bearer token", async () => {
    const fetchMock = mockFetchOnce({ body: [{ id: "org-1", name: "Acme" }] });
    const orgs = await listOrganizations("at");
    expect(orgs).toEqual([{ id: "org-1", name: "Acme" }]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${API}/v1/organizations`);
    expect((init as RequestInit).method ?? "GET").toBe("GET");
    const headers = new Headers((init as RequestInit).headers as HeadersInit);
    expect(headers.get("authorization")).toBe("Bearer at");
    expect(headers.get("accept")).toBe("application/json");
  });

  it("throws ManagementApiError on non-ok responses", async () => {
    mockFetchOnce({ status: 401, body: { message: "unauthorized" } });
    await expect(listOrganizations("at")).rejects.toBeInstanceOf(ManagementApiError);
  });
});

describe("createProject", () => {
  it("POSTs the project body with defaults filled in", async () => {
    const fetchMock = mockFetchOnce({
      body: { id: "p", ref: "ref", name: "n", region: DEFAULT_PROJECT_REGION, status: "COMING_UP" },
    });

    await createProject({
      accessToken: "at",
      organizationId: "org-1",
      name: "Buendia Apps",
      dbPassword: "pw",
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${API}/v1/projects`);
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      organization_id: "org-1",
      name: "Buendia Apps",
      region: DEFAULT_PROJECT_REGION,
      plan: DEFAULT_PROJECT_PLAN,
      db_pass: "pw",
    });
  });
});

describe("getProjectStatus", () => {
  it("marks ACTIVE_HEALTHY as ready", async () => {
    mockFetchOnce({ body: { id: "p", status: "ACTIVE_HEALTHY" } });
    const status = await getProjectStatus("at", "ref");
    expect(status).toEqual({ id: "p", status: "ACTIVE_HEALTHY", ready: true });
  });

  it("treats COMING_UP as not-yet-ready", async () => {
    mockFetchOnce({ body: { id: "p", status: "COMING_UP" } });
    const status = await getProjectStatus("at", "ref");
    expect(status.ready).toBe(false);
  });
});

describe("isFatalStatus", () => {
  it("treats INACTIVE / REMOVED as terminal", () => {
    expect(isFatalStatus("INACTIVE")).toBe(true);
    expect(isFatalStatus("REMOVED")).toBe(true);
    expect(isFatalStatus("RESTORE_FAILED")).toBe(true);
  });

  it("treats transient statuses as non-fatal", () => {
    expect(isFatalStatus("COMING_UP")).toBe(false);
    expect(isFatalStatus("ACTIVE_HEALTHY")).toBe(false);
  });
});

describe("waitForProjectReady", () => {
  it("returns immediately when the project is already ready", async () => {
    mockFetchOnce({ body: { id: "p", status: "ACTIVE_HEALTHY" } });
    const result = await waitForProjectReady("at", "ref", 5_000, 1);
    expect(result.ready).toBe(true);
  });

  it("returns when the project enters a fatal status", async () => {
    mockFetchOnce({ body: { id: "p", status: "INACTIVE" } });
    const result = await waitForProjectReady("at", "ref", 5_000, 1);
    expect(result.ready).toBe(false);
    expect(isFatalStatus(result.status)).toBe(true);
  });

  it("polls until ready when the first response is transient", async () => {
    const statuses = ["COMING_UP", "COMING_UP", "ACTIVE_HEALTHY"];
    let i = 0;
    const fetchMock = vi.fn<FetchFn>(
      async () => new Response(JSON.stringify({ id: "p", status: statuses[i++] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await waitForProjectReady("at", "ref", 5_000, 0);
    expect(result.ready).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns the last status when the deadline is hit", async () => {
    const fetchMock = vi.fn<FetchFn>(
      async () => new Response(JSON.stringify({ id: "p", status: "COMING_UP" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await waitForProjectReady("at", "ref", 0, 5_000);
    expect(result.ready).toBe(false);
    expect(result.status).toBe("COMING_UP");
  });
});

describe("getProjectApiKeys", () => {
  it("returns the publishable + secret pair when both are present (new naming)", async () => {
    mockFetchOnce({
      body: [
        { name: "publishable", api_key: "pub" },
        { name: "secret", api_key: "sec" },
      ],
    });
    const keys = await getProjectApiKeys("at", "ref");
    expect(keys).toEqual({ publishableKey: "pub", secretKey: "sec" });
  });

  it("accepts the legacy `anon` / `service_role` naming", async () => {
    mockFetchOnce({
      body: [
        { name: "anon", api_key: "pub" },
        { name: "service_role", api_key: "sec" },
      ],
    });
    const keys = await getProjectApiKeys("at", "ref");
    expect(keys).toEqual({ publishableKey: "pub", secretKey: "sec" });
  });

  it("throws when either key is missing", async () => {
    mockFetchOnce({ body: [{ name: "publishable", api_key: "pub" }] });
    await expect(getProjectApiKeys("at", "ref")).rejects.toThrow(/publishable and secret keys/);
  });
});

describe("getProjectJwtSecret", () => {
  it("returns the legacy jwt_secret when /config/auth exposes one", async () => {
    mockFetchOnce({ body: { jwt_secret: "the-secret" } });
    expect(await getProjectJwtSecret("at", "ref")).toBe("the-secret");
  });

  it("falls back to /config/auth/signing-keys when the legacy field is missing", async () => {
    const fetchMock = mockFetchSequence([
      // /config/auth — no jwt_secret (asymmetric-signing project)
      { body: {} },
      // /config/auth/signing-keys — list returns an in-use HS256 key
      { body: [{ id: "k1", algorithm: "HS256", status: "in_use" }] },
      // /config/auth/signing-keys/k1?reveal=true — exposes the secret
      { body: { id: "k1", algorithm: "HS256", secret: "rotated-hs256-secret" } },
    ]);
    expect(await getProjectJwtSecret("at", "ref")).toBe("rotated-hs256-secret");
    const calls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calls).toEqual([
      `${API}/v1/projects/ref/config/auth`,
      `${API}/v1/projects/ref/config/auth/signing-keys`,
      `${API}/v1/projects/ref/config/auth/signing-keys/k1?reveal=true`,
    ]);
  });

  it("accepts the JWK form when the revealed key returns private_jwk.k", async () => {
    mockFetchSequence([
      { body: {} },
      { body: [{ id: "k2", algorithm: "HS512", status: "in_use" }] },
      { body: { id: "k2", private_jwk: { k: "jwk-secret-bytes" } } },
    ]);
    expect(await getProjectJwtSecret("at", "ref")).toBe("jwk-secret-bytes");
  });

  it("throws when neither path finds a secret", async () => {
    mockFetchSequence([
      { body: {} },
      { body: [{ id: "rs1", algorithm: "RS256", status: "in_use" }] },
    ]);
    await expect(getProjectJwtSecret("at", "ref")).rejects.toThrow(
      /no jwt_secret on \/config\/auth and no in-use HS key/,
    );
  });
});

describe("executeSql", () => {
  it("POSTs the query through the database endpoint", async () => {
    const fetchMock = mockFetchOnce({ body: [{ ok: true }] });
    const result = await executeSql<{ ok: boolean }[]>("at", "ref", "select 1");
    expect(result).toEqual([{ ok: true }]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${API}/v1/projects/ref/database/query`);
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ query: "select 1" });
  });

  it("returns undefined on 204 (no body)", async () => {
    mockFetchOnce({ status: 204 });
    const result = await executeSql("at", "ref", "create schema app_x;");
    expect(result).toBeUndefined();
  });
});

describe("projectUrl", () => {
  it("builds the canonical project URL from the ref", () => {
    expect(projectUrl("abcdef")).toBe("https://abcdef.supabase.co");
  });
});

describe("ManagementApiError", () => {
  it("carries the status code, path, and response body", () => {
    const err = new ManagementApiError(429, "/v1/projects", "rate limited");
    expect(err.status).toBe(429);
    expect(err.path).toBe("/v1/projects");
    expect(err.body).toBe("rate limited");
    expect(err.message).toMatch(/429/);
    expect(err.name).toBe("ManagementApiError");
  });
});
