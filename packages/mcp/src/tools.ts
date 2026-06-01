import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BuendiaApiError, type BuendiaClient } from "./client.js";

/**
 * Register every Buendia tool on the supplied MCP server. Tools are 1:1
 * with HTTP API endpoints from ticket 71 (no business logic lives here —
 * just argument shaping and error translation).
 *
 * Tool descriptions matter. Claude reads them to decide which tool to
 * call and how to populate its arguments, so each one starts with a
 * sentence about *when* to use it and lists any non-obvious rules. The
 * `host_app` description includes Buendia's schema-augmentation rules
 * so Claude generates compatible SQL on the first try (per ticket 72's
 * acceptance criteria).
 */

export interface RegisterToolsOptions {
  /**
   * Public-facing base URL used in tool descriptions and error hints.
   * Defaults to whatever the BuendiaClient was constructed with.
   */
  baseUrlForUser?: string;
}

const SCHEMA_RULES = `
**Schema rules (Buendia auto-augments your SQL — follow these so the
provisioner accepts it on the first try):**

- Write tables WITHOUT a schema prefix. Use \`create table todos (...)\`,
  not \`create table public.todos (...)\`. Buendia mounts your SQL
  inside a per-app schema and adds the prefix for you.
- Do NOT write \`grant\` statements or \`alter ... disable row level
  security\`. Buendia generates the right RLS policies automatically
  from the columns it auto-injects (\`created_by uuid\`, \`team_id uuid\`).
- Do NOT reference \`auth.users\` directly; reference \`created_by\` (a
  uuid the SDK fills in from the JWT) instead.
- Keep it to plain DDL: \`create table\`, \`create index\`, simple checks.
  No triggers, no functions, no \`security definer\`.
`.trim();

function toolError(err: unknown): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  if (err instanceof BuendiaApiError) {
    const hint = err.isAuth
      ? "\n\nReconnect Buendia in your MCP config: regenerate a personal access token at /settings/tokens and update BUENDIA_PAT."
      : "";
    const detail = err.details ? `\n\nDetails: ${JSON.stringify(err.details)}` : "";
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Buendia error (${err.status} ${err.code}): ${err.message}${detail}${hint}`,
        },
      ],
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: "text", text: `Unexpected error: ${message}` }],
  };
}

function okText(payload: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

/**
 * Encode a slug for use inside a URL path. Buendia slugs are
 * lowercase-alphanumeric + hyphens so encoding is usually a no-op, but
 * we go through encodeURIComponent for defence in depth.
 */
function encodeSlug(slug: string): string {
  return encodeURIComponent(slug);
}

export function registerTools(
  server: McpServer,
  client: BuendiaClient,
  options: RegisterToolsOptions = {},
): void {
  const baseUrl = options.baseUrlForUser;

  server.tool(
    "whoami",
    `Returns the Buendia account the current PAT belongs to (id + email).
Cheapest tool — call it once on startup to confirm wiring. Backend grant
metadata is dashboard-only and is not returned to PAT callers.`,
    {},
    async () => {
      try {
        const data = await client.get("/api/v1/me");
        return okText(data);
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.tool(
    "list_apps",
    "Lists the user's apps (apps they own + apps shared with them).",
    {},
    async () => {
      try {
        const data = await client.get("/api/v1/apps");
        return okText(data);
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.tool(
    "host_app",
    `Uploads a single-file HTML app to Buendia and registers it.

Use this when the user asks to "host this app," "put this on Buendia,"
"deploy this HTML," or similar. Returns the public URL so you can hand
it to the user. If the app stores data and you supply \`schema_sql\`,
follow this with a call to \`provision_schema\` to actually create the
tables in the user's Supabase project.

${SCHEMA_RULES}`,
    {
      html: z
        .string()
        .min(1)
        .describe(
          "The full HTML document, starting with `<!doctype html>` or `<html>`. Include the Buendia SDK <script> tag if the app reads or writes data.",
        ),
      name: z
        .string()
        .optional()
        .describe("Optional display name. Defaults to a slug from the filename."),
      schema_sql: z
        .string()
        .optional()
        .describe(
          "Optional schema.sql for the app's tables. Follow the schema rules above. Provision actually applies it via the `provision_schema` tool.",
        ),
      filename: z
        .string()
        .optional()
        .describe("Optional source filename — used to derive a slug when `name` isn't provided."),
    },
    async ({ html, name, schema_sql, filename }) => {
      try {
        const data = (await client.post("/api/v1/apps", {
          html,
          name,
          schema_sql,
          filename,
        })) as { id: string; slug: string; name: string; url: string };
        return okText({
          ...data,
          next_steps: schema_sql
            ? `Provision the schema with \`provision_schema({ slug: "${data.slug}" })\` before opening the URL.`
            : "Open the URL to view the hosted app.",
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.tool(
    "get_app",
    "Fetches metadata for a single app by slug: timestamps, collaborators, pending invitations (visible to the owner only).",
    {
      slug: z.string().describe("The app's slug, e.g. `project-tracker-a1b2c3`."),
    },
    async ({ slug }) => {
      try {
        const data = await client.get(`/api/v1/apps/${encodeSlug(slug)}`);
        return okText(data);
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.tool(
    "provision_schema",
    `Runs Buendia's schema provisioner against the user's connected Supabase
project. Uses the \`schema_sql\` stored alongside the app's current
version (so call \`host_app\` first with the schema, then this).

Owner-only. Idempotent — safe to call again after fixing schema_sql.`,
    {
      slug: z.string().describe("The app's slug."),
    },
    async ({ slug }) => {
      try {
        const data = await client.post(`/api/v1/apps/${encodeSlug(slug)}/provision`);
        return okText(data);
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.tool(
    "delete_app",
    `Deletes an app from Buendia and drops the corresponding schema in the
user's Supabase project. Owner-only. The HTML blob is removed; the
user's data in that schema is dropped. **Confirm with the user before
calling.**`,
    {
      slug: z.string().describe("The app's slug."),
    },
    async ({ slug }) => {
      try {
        const data = await client.delete(`/api/v1/apps/${encodeSlug(slug)}`);
        return okText(data);
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.tool(
    "invite_collaborator",
    `Invites someone to collaborate on an app by email.

If the email belongs to an existing Buendia account, returns
\`{ kind: "share" }\` and the collaborator gets immediate access. If
not, returns \`{ kind: "invitation", url }\` — pass the URL to the user
so they can deliver it (Buendia doesn't send the email itself for MVP).

Owner-only.`,
    {
      slug: z.string().describe("The app's slug."),
      email: z.string().email().describe("Collaborator's email."),
      role: z
        .enum(["viewer", "editor"])
        .default("viewer")
        .describe("`viewer` (read-only) or `editor` (read + write). Defaults to viewer."),
    },
    async ({ slug, email, role }) => {
      try {
        const data = await client.post(`/api/v1/apps/${encodeSlug(slug)}/shares`, {
          email,
          role,
        });
        return okText(data);
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.tool(
    "remove_collaborator",
    `Revokes a collaborator's access OR cancels a pending invitation.
Accepts either a user UUID or an email address as the target.`,
    {
      slug: z.string().describe("The app's slug."),
      user_or_email: z
        .string()
        .describe(
          "Either the collaborator's user UUID (from `get_app`) or the invitee's email address.",
        ),
    },
    async ({ slug, user_or_email }) => {
      try {
        const target = encodeURIComponent(user_or_email);
        const data = await client.delete(`/api/v1/apps/${encodeSlug(slug)}/shares/${target}`);
        return okText(data);
      } catch (err) {
        return toolError(err);
      }
    },
  );

  // baseUrl is accepted for future-proofing (e.g. embedding it in tool
  // descriptions) but unused today — keep the parameter in the public
  // signature so callers don't have to change when it gets used.
  void baseUrl;
}
