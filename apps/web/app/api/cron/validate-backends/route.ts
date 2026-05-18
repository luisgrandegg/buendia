import { NextResponse } from "next/server";
import { decrypt, loadMasterKey, recordAudit } from "@buendia/db";
import { env } from "@/lib/env";
import { ManagementApiError, listOrganizations, listRlsDisabledTables } from "@/lib/management-api";
import { refreshAccessToken } from "@/lib/oauth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * `GET /api/cron/validate-backends` — daily health check on every
 * stored OAuth grant.
 *
 * For each row in `owner_backends`:
 *   - Decrypt the refresh token.
 *   - Trade it for an access token (`refreshAccessToken`).
 *   - Hit `GET /v1/organizations` as a cheap liveness probe.
 *   - Update `grant_status` to `ok` / `revoked` and stamp
 *     `last_validated_at`.
 *
 * `grant_status='revoked'` is what the Settings page reads to surface
 * a Reconnect banner. We re-encrypt the rotated refresh token on every
 * successful check, so the row stays current even if the user hasn't
 * exercised the dashboard in a while.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`. Vercel injects this
 * automatically; without it the route is unreachable.
 *
 * Audit: each ok/revoked transition writes a
 * `backend.credentials_refreshed` row so an operator can see when a
 * grant flipped.
 */
export async function GET(request: Request) {
  const expected = `Bearer ${env.cronSecret}`;
  if (request.headers.get("authorization") !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("owner_backends")
    .select("user_id, supabase_project_ref, supabase_oauth_refresh_token_encrypted, grant_status");
  if (error) {
    console.error("[buendia] cron validate-backends fetch failed:", error);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  const masterKey = loadMasterKey();
  const { byteaLiteral, encrypt } = await import("@buendia/db");

  let checked = 0;
  let ok = 0;
  let revoked = 0;
  let degraded = 0;

  for (const row of rows ?? []) {
    checked += 1;

    if (!row.supabase_oauth_refresh_token_encrypted) {
      // Half-provisioned row; skip.
      continue;
    }

    let refreshToken: string;
    try {
      refreshToken = decrypt(
        bufferFromBytea(row.supabase_oauth_refresh_token_encrypted),
        masterKey,
      );
    } catch (err) {
      console.error("[buendia] cron decrypt failed for user", row.user_id, err);
      continue;
    }

    try {
      const access = await refreshAccessToken({
        refreshToken,
        clientId: env.supabaseOauthClientId,
        clientSecret: env.supabaseOauthClientSecret,
      });
      // Probe organisations as a liveness signal.
      await listOrganizations(access.accessToken);

      // RLS drift detection (SECURITY_AUDIT.md §M8). For each app the
      // user has provisioned in this project, ask Postgres whether any
      // tables have rowsecurity = false. The provisioner enables RLS
      // on every table it creates; if drift is detected the user has
      // manually disabled it, which silently un-locks the data. Flag
      // the row as 'degraded' so the dashboard can surface a banner.
      let drift: { schema: string; table: string }[] = [];
      if (row.supabase_project_ref) {
        try {
          const { data: ownerApps } = await admin
            .from("apps")
            .select("schema_name")
            .eq("owner_id", row.user_id)
            .not("schema_provisioned_at", "is", null);
          const schemas = (ownerApps ?? [])
            .map((a) => a.schema_name as string)
            .filter((s) => /^app_[a-z0-9_]+$/.test(s));
          if (schemas.length > 0) {
            drift = await listRlsDisabledTables(
              access.accessToken,
              row.supabase_project_ref,
              schemas,
            );
          }
        } catch (driftErr) {
          // Don't let an RLS-probe failure mask a successful auth check;
          // log and move on. The credentials_refreshed signal is the
          // primary purpose of this cron.
          console.error("[buendia] cron rls-drift probe failed for user", row.user_id, driftErr);
        }
      }

      const newStatus: "ok" | "degraded" = drift.length > 0 ? "degraded" : "ok";

      const update: Record<string, unknown> = {
        grant_status: newStatus,
        last_validated_at: new Date().toISOString(),
      };
      // Supabase rotates the refresh token on every exchange; persist.
      if (access.refreshToken && access.refreshToken !== refreshToken) {
        update.supabase_oauth_refresh_token_encrypted = byteaLiteral(
          encrypt(access.refreshToken, masterKey),
        );
      }
      await admin.from("owner_backends").update(update).eq("user_id", row.user_id);

      if (newStatus === "ok") {
        if (row.grant_status !== "ok") {
          await recordAudit(admin, {
            actorId: row.user_id,
            action: "backend.credentials_refreshed",
            metadata: { result: "recovered", source: "cron" },
          });
        }
        ok += 1;
      } else {
        if (row.grant_status !== "degraded") {
          await recordAudit(admin, {
            actorId: row.user_id,
            action: "backend.rls_disabled",
            // Keep the metadata bounded — operators can re-query the
            // project for the full set if there's an avalanche.
            metadata: { source: "cron", tables: drift.slice(0, 20), total: drift.length },
          });
        }
        degraded += 1;
      }
    } catch (err) {
      const isManagementError = err instanceof ManagementApiError;
      const isAuthFailure = isManagementError && (err.status === 401 || err.status === 403);
      // Token endpoint also surfaces a 401/403 via the thrown Error in
      // refreshAccessToken; match on the message as a fallback.
      const message = err instanceof Error ? err.message : String(err);
      const looksLikeAuth = /401|403|invalid_grant|unauthorized/i.test(message);

      if (isAuthFailure || looksLikeAuth) {
        await admin
          .from("owner_backends")
          .update({
            grant_status: "revoked",
            last_validated_at: new Date().toISOString(),
          })
          .eq("user_id", row.user_id);

        if (row.grant_status !== "revoked") {
          await recordAudit(admin, {
            actorId: row.user_id,
            action: "backend.credentials_refreshed",
            metadata: { result: "revoked", source: "cron" },
          });
        }
        revoked += 1;
      } else {
        // Transient (network, 5xx) — leave grant_status alone, stamp
        // last_validated_at as 'unknown' so we don't false-alarm.
        await admin
          .from("owner_backends")
          .update({
            grant_status: "unknown",
            last_validated_at: new Date().toISOString(),
          })
          .eq("user_id", row.user_id);
        console.error("[buendia] cron transient failure for user", row.user_id, err);
      }
    }
  }

  return NextResponse.json({ checked, ok, revoked, degraded });
}

function bufferFromBytea(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") {
    return value.startsWith("\\x")
      ? Buffer.from(value.slice(2), "hex")
      : Buffer.from(value, "base64");
  }
  throw new Error(`Unexpected bytea representation: ${typeof value}`);
}
