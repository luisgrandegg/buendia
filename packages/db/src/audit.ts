/**
 * Control-plane audit log helper.
 *
 * Every write-side action on Buendia's metadata goes through
 * {@link recordAudit}. RLS guarantees the row's `actor_id` matches the
 * caller's `auth.uid()`, so attribution can't be spoofed from the browser.
 *
 * SECURITY: do NOT put credentials, tokens, JWTs, or any other secret
 * inside `metadata`. The audit log is for human-readable context — app
 * names, share targets, role changes, free-form notes. If you find
 * yourself wanting to write a key here, you've probably already made the
 * wrong call. Reach for the storage that's encrypted at rest instead.
 */

/**
 * The canonical list of audit actions. The control-plane DB enforces a
 * CHECK constraint mirroring these values
 * (`packages/db/migrations/0013_audit_log_hardening.sql`). When you add
 * a value here, ship a migration that widens the constraint in lockstep
 * — otherwise the insert will fail at runtime.
 */
export const AUDIT_ACTIONS = [
  "auth.signed_up",
  "auth.signed_in",
  "backend.connected",
  "backend.project_provisioned",
  "backend.disconnected",
  "backend.credentials_refreshed",
  "app.created",
  "app.renamed",
  "app.deleted",
  "app.version.uploaded",
  "share.invited",
  "share.role_changed",
  "share.removed",
  "pat.created",
  "pat.revoked",
  "pat.used",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  actorId: string;
  action: AuditAction;
  targetAppId?: string;
  targetUserId?: string;
  /**
   * Free-form human-readable context. Never put credentials or tokens here.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Structural shape we need from a Supabase-style client. Kept generic so
 * `packages/db` doesn't take a dependency on `@supabase/supabase-js`.
 */
export type AuditWriter = {
  from(table: string): {
    insert(row: object): PromiseLike<unknown>;
  };
};

/**
 * Insert an audit row. Errors are logged to stderr and swallowed — a
 * logging failure should never break the user's primary action.
 */
export async function recordAudit(client: AuditWriter, entry: AuditEntry): Promise<void> {
  const row = {
    actor_id: entry.actorId,
    action: entry.action,
    target_app_id: entry.targetAppId ?? null,
    target_user_id: entry.targetUserId ?? null,
    metadata: entry.metadata ?? null,
  };

  try {
    const result = (await client.from("audit_log").insert(row)) as {
      error?: { message?: string } | null;
    } | null;
    if (result?.error) {
      console.error(
        `[buendia] audit_log insert failed (${entry.action}):`,
        result.error.message ?? result.error,
      );
    }
  } catch (err) {
    console.error(`[buendia] audit_log insert threw (${entry.action}):`, err);
  }
}
