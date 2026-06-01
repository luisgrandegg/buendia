/**
 * Schema provisioner: take a user-supplied `schema.sql`, run it inside a
 * dedicated `app_<slug>` schema in the owner's Supabase project, and add
 * the columns + RLS policies every Buendia table is required to carry.
 *
 * Constitution-mandated invariants enforced here:
 *
 *   - Every table in the app schema gets RLS enabled (Architecture
 *     Invariants §Every table gets RLS).
 *   - Validation rejects anything that disables RLS, manipulates roles,
 *     installs extensions, or escapes the app schema before any DDL runs.
 *   - The resulting schema is keyed by JWT claims (`team_id`,
 *     `buendia_role`) per `MVP.md §Auth & isolation`.
 */

export interface ValidationFinding {
  pattern: string;
  excerpt: string;
}

export interface ValidationResult {
  ok: boolean;
  findings: ValidationFinding[];
}

interface ForbiddenPattern {
  label: string;
  regex: RegExp;
}

const FORBIDDEN_PATTERNS: ForbiddenPattern[] = [
  { label: "disabling row-level security", regex: /\bdisable\s+row\s+level\s+security\b/i },
  {
    label: "force-disabling row-level security",
    regex: /\balter\s+table[^;]*no\s+force\s+row\s+level\s+security\b/i,
  },
  { label: "installing extensions", regex: /\bcreate\s+extension\b/i },
  { label: "dropping the database", regex: /\bdrop\s+database\b/i },
  { label: "creating a schema", regex: /\bcreate\s+schema\b/i },
  { label: "dropping a schema", regex: /\bdrop\s+schema\b/i },
  { label: "GRANT statements", regex: /\bgrant\s+/i },
  { label: "REVOKE statements", regex: /\brevoke\s+/i },
  {
    label: "SET ROLE / SET SESSION AUTHORIZATION",
    regex: /\bset\s+(role|session\s+authorization)\b/i,
  },
  { label: "role / user manipulation", regex: /\b(create|drop|alter)\s+(role|user|group)\b/i },
  { label: "SECURITY DEFINER (privilege escalation)", regex: /\bsecurity\s+definer\b/i },
  { label: "COPY ... PROGRAM (shell escape)", regex: /\bcopy\b[^;]*\bprogram\b/i },
  { label: "psql meta-commands", regex: /(^|\n)\s*\\[a-z]/i },
  {
    label: "cross-schema reference (forbidden schema name)",
    regex:
      /\b(pg_catalog|information_schema|auth|storage|public|extensions|graphql_public|pgsodium|realtime|vault)\s*\./i,
  },
];

/**
 * Run the user's `schema.sql` through the deny list. Returns every
 * finding so the dashboard can list them all rather than dripping one
 * error per retry.
 */
export function validateSchemaSql(sql: string): ValidationResult {
  const findings: ValidationFinding[] = [];
  for (const { label, regex } of FORBIDDEN_PATTERNS) {
    const match = regex.exec(sql);
    if (match) {
      findings.push({
        pattern: label,
        excerpt: contextAround(sql, match.index, match[0].length),
      });
    }
  }
  return { ok: findings.length === 0, findings };
}

function contextAround(source: string, index: number, length: number): string {
  const start = Math.max(0, index - 30);
  const end = Math.min(source.length, index + length + 30);
  return source.slice(start, end).replace(/\s+/g, " ").trim();
}

const SCHEMA_NAME_REGEX = /^app_[a-z0-9_]+$/;

function assertSafeSchemaName(name: string): void {
  if (!SCHEMA_NAME_REGEX.test(name)) {
    throw new Error(`Refusing to provision into unsafe schema name: ${name}`);
  }
}

/**
 * Postgres identifier quoting. Wraps `name` in double quotes and
 * doubles any embedded double quotes — equivalent to `quote_ident(...)`
 * / `format('%I', ...)` on the SQL side.
 *
 * `assertSafeSchemaName` makes today's inputs safe even unquoted, but
 * the moment anyone relaxes that regex (unicode handles, longer
 * prefixes, hyphens, …) bare interpolation becomes SQL injection
 * against the owner's Supabase project — where Buendia runs with
 * elevated grants. Quote unconditionally so the SQL stays safe under
 * regex drift. See SECURITY_AUDIT.md §H1 and
 * backlog/done/66-provisioner-identifier-quoting.md.
 */
export function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/**
 * Postgres string-literal quoting, for the single spot we have to
 * splice the schema name into a string context (the
 * `pg_tables.schemaname = '<name>'` predicate in the DO block). Use
 * `quoteIdent` everywhere else.
 */
function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Build the full SQL script that gets executed in a single Management
 * API call. Wrapped in a transaction so a failure rolls back cleanly.
 *
 * Layout (top to bottom):
 *   - drop the schema if it exists (idempotent re-provisioning)
 *   - create the schema
 *   - set search_path so the user's DDL lands inside it
 *   - run the user's DDL
 *   - augment every table the user created with created_by + team_id,
 *     enable RLS, and install the default policies
 */
export function buildProvisionSql(schemaName: string, userSql: string): string {
  assertSafeSchemaName(schemaName);
  const ident = quoteIdent(schemaName);
  const literal = quoteLiteral(schemaName);

  const cleaned = userSql.trim();
  const userBody = cleaned.length > 0 ? cleaned + (cleaned.endsWith(";") ? "" : ";") : "";

  return `
begin;

drop schema if exists ${ident} cascade;
create schema ${ident};
set local search_path = ${ident}, public;

${userBody}

do $buendia_provision$
declare
  t text;
begin
  for t in
    select tablename from pg_tables where schemaname = ${literal}
  loop
    execute format(
      'alter table ${ident}.%I add column if not exists created_by uuid default auth.uid()',
      t
    );
    execute format(
      'alter table ${ident}.%I add column if not exists team_id uuid default ((auth.jwt() ->> ''team_id'')::uuid)',
      t
    );
    execute format('alter table ${ident}.%I enable row level security', t);

    -- Drop policies before recreating so re-provisioning is idempotent.
    execute format('drop policy if exists "buendia members read" on ${ident}.%I', t);
    execute format('drop policy if exists "buendia editors write" on ${ident}.%I', t);

    execute format(
      $p$create policy "buendia members read" on ${ident}.%I for select using (team_id = ((auth.jwt() ->> 'team_id')::uuid))$p$,
      t
    );
    execute format(
      $p$create policy "buendia editors write" on ${ident}.%I for all using (team_id = ((auth.jwt() ->> 'team_id')::uuid) and (auth.jwt() ->> 'buendia_role') in ('owner','editor')) with check (team_id = ((auth.jwt() ->> 'team_id')::uuid))$p$,
      t
    );
  end loop;
end
$buendia_provision$;

commit;
`.trim();
}

/**
 * SQL to drop the schema and everything in it. Used when an app is
 * deleted (ticket 50).
 */
export function buildDropSchemaSql(schemaName: string): string {
  assertSafeSchemaName(schemaName);
  return `drop schema if exists ${quoteIdent(schemaName)} cascade;`;
}
