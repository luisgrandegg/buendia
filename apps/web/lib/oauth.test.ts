import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  base64UrlEncode,
  buildAuthorizeUrl,
  codeChallengeFor,
  exchangeCodeForTokens,
  generateCodeVerifier,
  generateState,
  originFromHeaders,
  refreshAccessToken,
  supabaseCallbackUrl,
  SUPABASE_OAUTH_AUTHORIZE_URL,
  SUPABASE_OAUTH_SCOPES,
  SUPABASE_OAUTH_TOKEN_URL,
} from "./oauth";

/**
 * Coverage for PR #10 (Supabase Management OAuth). We test the
 * pure-function pieces (PKCE, authorize URL, origin parsing) and the two
 * fetch-backed exchanges (with `globalThis.fetch` stubbed).
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("base64url helpers", () => {
  it("strips padding and replaces URL-unsafe chars", () => {
    const encoded = base64UrlEncode(Buffer.from([0xfb, 0xff, 0xbf]));
    expect(encoded).not.toMatch(/[+/=]/);
  });
});

describe("PKCE primitives", () => {
  it("generates a verifier that's URL-safe and at least 43 chars (RFC 7636 minimum)", () => {
    const v = generateCodeVerifier();
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(v.length).toBeGreaterThanOrEqual(43);
  });

  it("each verifier is unique", () => {
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
  });

  it("codeChallengeFor is S256(verifier) base64url-encoded", () => {
    const verifier = "abc.123-_test_verifier";
    const expected = createHash("sha256")
      .update(verifier)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(codeChallengeFor(verifier)).toBe(expected);
  });

  it("generateState produces a fresh URL-safe value", () => {
    const a = generateState();
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(generateState());
  });
});

describe("buildAuthorizeUrl", () => {
  it("hits the Supabase authorize endpoint with the required PKCE params", () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: "cid",
        redirectUri: "https://app.example.com/cb",
        state: "s",
        codeChallenge: "ch",
      }),
    );
    expect(`${url.origin}${url.pathname}`).toBe(SUPABASE_OAUTH_AUTHORIZE_URL);
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example.com/cb");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("s");
    expect(url.searchParams.get("code_challenge")).toBe("ch");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe(SUPABASE_OAUTH_SCOPES.join(" "));
  });

  it("accepts an explicit scope list", () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: "cid",
        redirectUri: "r",
        state: "s",
        codeChallenge: "ch",
        scopes: ["one", "two"],
      }),
    );
    expect(url.searchParams.get("scope")).toBe("one two");
  });
});

describe("originFromHeaders", () => {
  it("prefers x-forwarded-host over host", () => {
    const h = new Headers({ "x-forwarded-host": "app.example.com", host: "internal:3000" });
    expect(originFromHeaders(h)).toBe("https://app.example.com");
  });

  it("uses http for localhost", () => {
    const h = new Headers({ host: "localhost:3000" });
    expect(originFromHeaders(h)).toBe("http://localhost:3000");
  });

  it("respects x-forwarded-proto when present", () => {
    const h = new Headers({ host: "x.example", "x-forwarded-proto": "http" });
    expect(originFromHeaders(h)).toBe("http://x.example");
  });

  it("throws when no host can be resolved", () => {
    expect(() => originFromHeaders(new Headers())).toThrow(/host/);
  });
});

describe("supabaseCallbackUrl", () => {
  it("appends the canonical callback path", () => {
    expect(supabaseCallbackUrl("https://app.example.com")).toBe(
      "https://app.example.com/api/auth/supabase/callback",
    );
  });
});

type FetchFn = (input: string | URL, init?: RequestInit) => Promise<Response>;

function mockFetchOnce(body: object, init: ResponseInit = { status: 200 }) {
  const fetchMock = vi.fn<FetchFn>(async () => new Response(JSON.stringify(body), init));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("exchangeCodeForTokens", () => {
  it("POSTs form-urlencoded with HTTP Basic and the PKCE verifier", async () => {
    const fetchMock = mockFetchOnce({
      access_token: "at",
      refresh_token: "rt",
      expires_in: 3600,
      token_type: "Bearer",
    });

    const result = await exchangeCodeForTokens({
      code: "the-code",
      clientId: "cid",
      clientSecret: "csec",
      redirectUri: "https://app.example.com/cb",
      codeVerifier: "v",
    });

    expect(result).toEqual({
      accessToken: "at",
      refreshToken: "rt",
      expiresIn: 3600,
      tokenType: "Bearer",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0]!;
    const url = call[0];
    const init = call[1];
    expect(url).toBe(SUPABASE_OAUTH_TOKEN_URL);
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers as HeadersInit);
    expect(headers.get("authorization")).toBe(
      `Basic ${Buffer.from("cid:csec").toString("base64")}`,
    );
    expect(headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    const body = new URLSearchParams(String(init?.body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("the-code");
    expect(body.get("code_verifier")).toBe("v");
    expect(body.get("redirect_uri")).toBe("https://app.example.com/cb");
  });

  it("throws if the response is not ok", async () => {
    mockFetchOnce({ error: "invalid_grant" }, { status: 400 });
    await expect(
      exchangeCodeForTokens({
        code: "x",
        clientId: "c",
        clientSecret: "s",
        redirectUri: "r",
        codeVerifier: "v",
      }),
    ).rejects.toThrow(/400/);
  });

  it("throws if the response is missing tokens", async () => {
    mockFetchOnce({ access_token: "at" });
    await expect(
      exchangeCodeForTokens({
        code: "x",
        clientId: "c",
        clientSecret: "s",
        redirectUri: "r",
        codeVerifier: "v",
      }),
    ).rejects.toThrow(/missing access_token or refresh_token/);
  });
});

describe("refreshAccessToken", () => {
  it("POSTs the refresh token and returns the rotated values", async () => {
    const fetchMock = mockFetchOnce({
      access_token: "at2",
      refresh_token: "rt2",
      expires_in: 3600,
      token_type: "Bearer",
    });

    const result = await refreshAccessToken({
      refreshToken: "rt1",
      clientId: "cid",
      clientSecret: "csec",
    });

    expect(result.accessToken).toBe("at2");
    expect(result.refreshToken).toBe("rt2");
    const body = new URLSearchParams(String(fetchMock.mock.calls[0]![1]!.body));
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("rt1");
  });

  it("falls back to the previous refresh token when the server omits one", async () => {
    mockFetchOnce({ access_token: "at2", expires_in: 3600 });
    const result = await refreshAccessToken({
      refreshToken: "rt1",
      clientId: "cid",
      clientSecret: "csec",
    });
    expect(result.refreshToken).toBe("rt1");
  });

  it("throws when the server omits access_token", async () => {
    mockFetchOnce({ refresh_token: "rt2" });
    await expect(
      refreshAccessToken({ refreshToken: "rt1", clientId: "cid", clientSecret: "csec" }),
    ).rejects.toThrow(/missing access_token/);
  });

  it("throws on non-ok responses", async () => {
    mockFetchOnce({}, { status: 401 });
    await expect(
      refreshAccessToken({ refreshToken: "rt1", clientId: "cid", clientSecret: "csec" }),
    ).rejects.toThrow(/401/);
  });
});
