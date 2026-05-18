/**
 * Thin client for Supabase's Management API. We talk to it via raw fetch
 * to avoid adding `@supabase/management-js` as a dependency for what
 * amounts to four calls.
 *
 * Reference: https://supabase.com/docs/reference/api/introduction
 */

const MANAGEMENT_API = "https://api.supabase.com";

const PROJECT_READY_STATUSES = new Set(["ACTIVE_HEALTHY", "ACTIVE", "HEALTHY"]);
const PROJECT_FATAL_STATUSES = new Set([
  "INACTIVE",
  "REMOVED",
  "RESTORE_FAILED",
  "PAUSE_FAILED",
  "UPGRADING",
]);

export const DEFAULT_PROJECT_REGION = "us-east-1";
export const DEFAULT_PROJECT_PLAN = "free";

export interface Organization {
  id: string;
  name: string;
  slug?: string;
}

export interface CreatedProject {
  id: string;
  ref: string;
  name: string;
  region: string;
  status: string;
}

export interface ProjectStatus {
  id: string;
  status: string;
  ready: boolean;
}

export interface ApiKeys {
  publishableKey: string;
  secretKey: string;
}

interface RequestOptions {
  accessToken: string;
  method?: string;
  body?: unknown;
}

async function callManagementApi<T>(path: string, opts: RequestOptions): Promise<T> {
  const response = await fetch(`${MANAGEMENT_API}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      Accept: "application/json",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new ManagementApiError(response.status, path, text);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export class ManagementApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    public readonly body: string,
  ) {
    super(`Supabase Management API ${path} → ${status}: ${body}`);
    this.name = "ManagementApiError";
  }
}

export async function listOrganizations(accessToken: string): Promise<Organization[]> {
  return callManagementApi<Organization[]>("/v1/organizations", { accessToken });
}

export interface CreateProjectParams {
  accessToken: string;
  organizationId: string;
  name: string;
  region?: string;
  plan?: string;
  dbPassword: string;
}

export async function createProject({
  accessToken,
  organizationId,
  name,
  region = DEFAULT_PROJECT_REGION,
  plan = DEFAULT_PROJECT_PLAN,
  dbPassword,
}: CreateProjectParams): Promise<CreatedProject> {
  return callManagementApi<CreatedProject>("/v1/projects", {
    accessToken,
    method: "POST",
    body: {
      organization_id: organizationId,
      name,
      region,
      plan,
      db_pass: dbPassword,
    },
  });
}

export async function getProjectStatus(
  accessToken: string,
  projectRef: string,
): Promise<ProjectStatus> {
  const project = await callManagementApi<{ id: string; status: string }>(
    `/v1/projects/${projectRef}`,
    { accessToken },
  );
  return {
    id: project.id,
    status: project.status,
    ready: PROJECT_READY_STATUSES.has(project.status),
  };
}

export function isFatalStatus(status: string): boolean {
  return PROJECT_FATAL_STATUSES.has(status);
}

/**
 * Poll the project's status until it's ready, fatal, or the deadline passes.
 * Returns the final status.
 */
export async function waitForProjectReady(
  accessToken: string,
  projectRef: string,
  deadlineMs: number,
  pollIntervalMs = 4000,
): Promise<ProjectStatus> {
  const deadline = Date.now() + deadlineMs;
  while (true) {
    const status = await getProjectStatus(accessToken, projectRef);
    if (status.ready) return status;
    if (isFatalStatus(status.status)) return status;
    if (Date.now() + pollIntervalMs >= deadline) return status;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

/**
 * Fetch the project's API keys. The new naming is `publishable` / `secret`;
 * the older `anon` / `service_role` keys come through the same endpoint and
 * are equivalent. We accept either.
 */
export async function getProjectApiKeys(accessToken: string, projectRef: string): Promise<ApiKeys> {
  type Key = { name?: string; type?: string; api_key?: string };
  const keys = await callManagementApi<Key[]>(`/v1/projects/${projectRef}/api-keys`, {
    accessToken,
  });

  const publishable = keys.find(
    (k) => k.name === "publishable" || k.name === "anon" || k.type === "publishable",
  );
  const secret = keys.find(
    (k) => k.name === "secret" || k.name === "service_role" || k.type === "secret",
  );

  if (!publishable?.api_key || !secret?.api_key) {
    throw new Error(
      `Supabase project ${projectRef} did not return both publishable and secret keys`,
    );
  }
  return { publishableKey: publishable.api_key, secretKey: secret.api_key };
}

export async function getProjectJwtSecret(
  accessToken: string,
  projectRef: string,
): Promise<string> {
  // Path A — legacy projects expose the HS256 secret directly on
  // /config/auth. Newly-created projects (post the asymmetric signing-key
  // rollout in 2025-2026) no longer return this field and we fall through
  // to the signing-keys endpoint.
  const legacy = await callManagementApi<{ jwt_secret?: string }>(
    `/v1/projects/${projectRef}/config/auth`,
    { accessToken },
  );
  if (legacy.jwt_secret) return legacy.jwt_secret;

  // Path B — signing-keys endpoint. Supabase keeps an in-use HS256 key
  // for new projects too (PostgREST needs a shared secret for HMAC
  // verification). Reveal it via the per-key endpoint.
  type SigningKeySummary = {
    id?: string;
    algorithm?: string;
    status?: string;
  };
  const keys = await callManagementApi<SigningKeySummary[]>(
    `/v1/projects/${projectRef}/config/auth/signing-keys`,
    { accessToken },
  );
  const hs = keys.find(
    (k) =>
      typeof k.algorithm === "string" &&
      k.algorithm.toUpperCase().startsWith("HS") &&
      (k.status === "in_use" || k.status === "active" || k.status === "current"),
  );
  if (!hs?.id) {
    console.error(
      "[buendia] getProjectJwtSecret: no HS256 in signing-keys response:",
      JSON.stringify(keys),
    );
    throw new Error(
      `Supabase project ${projectRef}: no jwt_secret on /config/auth and no in-use HS key in /config/auth/signing-keys`,
    );
  }

  type RevealedKey = {
    id?: string;
    algorithm?: string;
    status?: string;
    secret?: string;
    private_key?: string;
    private_jwk?: { k?: string; kty?: string };
    jwt_secret?: string;
  };
  const revealed = await callManagementApi<RevealedKey>(
    `/v1/projects/${projectRef}/config/auth/signing-keys/${hs.id}?reveal=true`,
    { accessToken },
  );
  const secret =
    revealed.secret || revealed.jwt_secret || revealed.private_key || revealed.private_jwk?.k;
  if (!secret) {
    console.error(
      "[buendia] getProjectJwtSecret: revealed key missing secret material:",
      JSON.stringify({ ...revealed, secret: undefined, private_key: undefined }),
    );
    throw new Error(`Supabase project ${projectRef}: signing key ${hs.id} returned no HS secret`);
  }
  return secret;
}

export function projectUrl(projectRef: string): string {
  return `https://${projectRef}.supabase.co`;
}

/**
 * Run arbitrary SQL against the project's Postgres database. Used by the
 * schema provisioner (ticket 21). The Management API accepts a single
 * `query` string and returns the rows from the final statement.
 */
export async function executeSql<T = unknown>(
  accessToken: string,
  projectRef: string,
  query: string,
): Promise<T> {
  return callManagementApi<T>(`/v1/projects/${projectRef}/database/query`, {
    accessToken,
    method: "POST",
    body: { query },
  });
}
