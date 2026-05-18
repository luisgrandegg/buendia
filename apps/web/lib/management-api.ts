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
  const data = await callManagementApi<{ jwt_secret?: string }>(
    `/v1/projects/${projectRef}/config/auth`,
    { accessToken },
  );
  if (!data.jwt_secret) {
    throw new Error(`Supabase project ${projectRef} did not return a jwt_secret`);
  }
  return data.jwt_secret;
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

/**
 * Return any tables in the supplied app-* schemas where Row-Level
 * Security has been disabled. Used by the daily cron (ticket 61) to
 * detect RLS drift — the user might have run
 * `alter table … disable row level security` directly against their
 * project after Buendia provisioned it. See SECURITY_AUDIT.md §M8 and
 * the M8 item of backlog/74-rls-validation-cron-and-nits.md.
 *
 * Schema names come from `public.apps.schema_name` (which the
 * provisioner mints and matches `^app_[a-z0-9_]+$`). They're quoted
 * as SQL string literals before splicing — belt-and-braces on top of
 * the regex.
 */
export interface RlsDisabledRow {
  schema: string;
  table: string;
}

export async function listRlsDisabledTables(
  accessToken: string,
  projectRef: string,
  schemas: string[],
): Promise<RlsDisabledRow[]> {
  if (schemas.length === 0) return [];
  const literals = schemas.map((s) => `'${s.replaceAll("'", "''")}'`).join(", ");
  const query = `
    select n.nspname as schema, c.relname as "table"
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r'
      and n.nspname in (${literals})
      and not c.relrowsecurity
    order by n.nspname, c.relname
  `;
  return executeSql<RlsDisabledRow[]>(accessToken, projectRef, query);
}
