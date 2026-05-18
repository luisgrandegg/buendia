/**
 * Thin HTTP client for Buendia's `/api/v1/*` surface (ticket 71).
 *
 * The MCP server holds no state of its own: every tool call dispatches
 * straight to Buendia. This client encapsulates the PAT bearer auth,
 * JSON encoding/decoding, and translation of error envelopes into typed
 * exceptions that the tool layer can turn into MCP-shaped errors.
 */

export interface BuendiaClientOptions {
  baseUrl: string;
  token: string;
  /**
   * Optional fetch override — used by tests to inject a mock without
   * monkey-patching globalThis.fetch.
   */
  fetchImpl?: typeof fetch;
  /**
   * Surface to put in the User-Agent header. Helps when grepping
   * Buendia's audit log for MCP-originated traffic.
   */
  userAgent?: string;
}

/**
 * Buendia returned a structured error envelope (`{ error, message, details? }`)
 * with a 4xx/5xx status. The MCP tool layer maps these into the format
 * Claude (or any other MCP client) renders to the user.
 */
export class BuendiaApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "BuendiaApiError";
  }

  /**
   * True when the failure is "the caller's auth doesn't work" — the MCP
   * server uses this to surface a specific hint about the PAT.
   */
  get isAuth(): boolean {
    return this.status === 401 || this.code === "unauthenticated";
  }
}

interface ErrorEnvelope {
  error?: string;
  message?: string;
  details?: unknown;
}

export class BuendiaClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;

  constructor(options: BuendiaClientOptions) {
    if (!options.baseUrl) throw new Error("BuendiaClient: baseUrl is required");
    if (!options.token) throw new Error("BuendiaClient: token is required");
    // Strip any trailing slash so we can naively concatenate paths.
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.userAgent = options.userAgent ?? "buendia-mcp/0.1.0";
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
      "User-Agent": this.userAgent,
    };
    let requestBody: string | undefined;
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      requestBody = JSON.stringify(body);
    }

    const res = await this.fetchImpl(url, { method, headers, body: requestBody });

    if (res.status === 204) return undefined as T;

    const text = await res.text();
    let parsed: unknown;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // Buendia always returns JSON; a non-JSON body means we hit a
        // platform-level error (Vercel HTML 500 page, etc).
        throw new BuendiaApiError(
          res.status,
          "non_json_response",
          `Unexpected ${res.status} response from Buendia.`,
          { body_snippet: text.slice(0, 200) },
        );
      }
    }

    if (!res.ok) {
      const envelope = (parsed ?? {}) as ErrorEnvelope;
      throw new BuendiaApiError(
        res.status,
        envelope.error ?? `http_${res.status}`,
        envelope.message ?? `Buendia returned ${res.status}.`,
        envelope.details,
      );
    }

    return parsed as T;
  }
}
