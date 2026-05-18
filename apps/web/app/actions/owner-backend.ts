"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { recordAudit } from "@buendia/db";
import { env } from "@/lib/env";
import {
  createProject,
  getProjectApiKeys,
  getProjectJwtSecret,
  isFatalStatus,
  ManagementApiError,
  listOrganizations,
  projectUrl,
  waitForProjectReady,
} from "@/lib/management-api";
import { refreshAccessToken } from "@/lib/oauth";
import { completeProvisioning, getOwnerRefreshToken } from "@/lib/owner-backend";
import { createClient } from "@/lib/supabase/server";

const PROJECT_NAME = "Buendia Apps";
const PROVISION_DEADLINE_MS = 50_000;

type ProvisionStatus =
  | "ok"
  | "unauthenticated"
  | "not_connected"
  | "oauth_refresh_failed"
  | "list_orgs_failed"
  | "no_organization"
  | "free_tier_limit"
  | "create_project_failed"
  | "project_unhealthy"
  | "still_provisioning"
  | "fetch_keys_failed"
  | "persist_failed";

function finish(status: ProvisionStatus): never {
  redirect(`/settings?provision=${status}`);
}

function logAndFinish(status: ProvisionStatus, err: unknown): never {
  console.error(`[buendia] provision error (${status}):`, err);
  finish(status);
}

export async function provisionProjectAction(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) finish("unauthenticated");

  const refreshToken = await getOwnerRefreshToken(user.id);
  if (!refreshToken) finish("not_connected");

  let access;
  try {
    access = await refreshAccessToken({
      refreshToken,
      clientId: env.supabaseOauthClientId,
      clientSecret: env.supabaseOauthClientSecret,
    });
  } catch (err) {
    logAndFinish("oauth_refresh_failed", err);
  }

  let orgs;
  try {
    orgs = await listOrganizations(access.accessToken);
  } catch (err) {
    logAndFinish("list_orgs_failed", err);
  }
  if (orgs.length === 0) finish("no_organization");
  const organization = orgs[0]!;

  const dbPassword = randomBytes(24).toString("base64");

  let created;
  try {
    created = await createProject({
      accessToken: access.accessToken,
      organizationId: organization.id,
      name: PROJECT_NAME,
      dbPassword,
    });
  } catch (err) {
    if (err instanceof ManagementApiError && err.status === 402) {
      finish("free_tier_limit");
    }
    logAndFinish("create_project_failed", err);
  }

  const projectRef = created.ref;
  const status = await waitForProjectReady(access.accessToken, projectRef, PROVISION_DEADLINE_MS);

  if (isFatalStatus(status.status)) {
    finish("project_unhealthy");
  }
  if (!status.ready) {
    finish("still_provisioning");
  }

  let apiKeys;
  let jwtSecret: string;
  try {
    [apiKeys, jwtSecret] = await Promise.all([
      getProjectApiKeys(access.accessToken, projectRef),
      getProjectJwtSecret(access.accessToken, projectRef),
    ]);
  } catch (err) {
    logAndFinish("fetch_keys_failed", err);
  }

  const persistResult = await completeProvisioning(user.id, {
    projectRef,
    projectUrl: projectUrl(projectRef),
    publishableKey: apiKeys.publishableKey,
    secretKey: apiKeys.secretKey,
    jwtSecret,
    newRefreshToken: access.refreshToken,
  });
  if (persistResult.error) {
    logAndFinish("persist_failed", persistResult.error);
  }

  await recordAudit(supabase, {
    actorId: user.id,
    action: "backend.project_provisioned",
    metadata: { project_ref: projectRef, organization_id: organization.id },
  });

  finish("ok");
}

/* -----------------------------------------------------------------------
 * Disconnect (ticket 52)
 *
 * The user wants out. We:
 *
 *   1. Delete the owner_backends row (encrypted credentials gone with it).
 *   2. Emit a backend.disconnected audit row.
 *   3. Redirect to /settings with an ok banner.
 *
 * Apps the user owned stay in the dashboard but lose serving capacity
 * (the edge route sees a missing owner_backends row and returns the
 * "App not ready" page). They can reconnect Supabase to bring serving
 * back. Schemas + data in their Supabase project are untouched —
 * disconnecting only ends Buendia's involvement.
 *
 * We don't attempt to revoke the OAuth grant at Supabase from here.
 * The user can revoke from Supabase's dashboard if they want; doing
 * it for them via a Supabase revoke endpoint is a follow-up if it
 * turns out to matter.
 * --------------------------------------------------------------------- */

export async function disconnectBuendiaAction(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { error } = await supabase.from("owner_backends").delete().eq("user_id", user.id);
  if (error) {
    console.error("[buendia] disconnect failed:", error);
    redirect("/settings?disconnect=write_failed");
  }

  await recordAudit(supabase, {
    actorId: user.id,
    action: "backend.disconnected",
  });

  redirect("/settings?disconnect=ok");
}

/* -----------------------------------------------------------------------
 * Refresh credentials (ticket 62)
 *
 * The user manually rotated their Supabase JWT secret, or our stored
 * keys went out of sync somehow. Trade the refresh token for a new
 * access token, re-fetch the project's URL + publishable key + secret
 * key + JWT secret, re-encrypt, write. The OAuth refresh token gets
 * rotated through the same flow.
 *
 * Cheap reuse of ticket 11's primitives — same Management API calls,
 * just without the project-creation step.
 * --------------------------------------------------------------------- */

type RefreshCredsStatus =
  | "ok"
  | "unauthenticated"
  | "not_connected"
  | "no_project"
  | "oauth_refresh_failed"
  | "fetch_keys_failed"
  | "persist_failed";

function refreshCredsFinish(status: RefreshCredsStatus): never {
  redirect(`/settings?refresh_creds=${status}`);
}

export async function refreshCredentialsAction(): Promise<void> {
  const { getProjectApiKeys, getProjectJwtSecret, projectUrl } =
    await import("@/lib/management-api");
  const { encrypt, loadMasterKey } = await import("@buendia/db");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) refreshCredsFinish("unauthenticated");

  const refreshToken = await getOwnerRefreshToken(user.id);
  if (!refreshToken) refreshCredsFinish("not_connected");

  const { data: backend } = await supabase
    .from("owner_backends")
    .select("supabase_project_ref")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!backend?.supabase_project_ref) refreshCredsFinish("no_project");

  let access;
  try {
    access = await refreshAccessToken({
      refreshToken,
      clientId: env.supabaseOauthClientId,
      clientSecret: env.supabaseOauthClientSecret,
    });
  } catch (err) {
    console.error("[buendia] oauth refresh failed during creds refresh:", err);
    refreshCredsFinish("oauth_refresh_failed");
  }

  let apiKeys;
  let jwtSecret: string;
  try {
    [apiKeys, jwtSecret] = await Promise.all([
      getProjectApiKeys(access.accessToken, backend.supabase_project_ref),
      getProjectJwtSecret(access.accessToken, backend.supabase_project_ref),
    ]);
  } catch (err) {
    console.error("[buendia] failed to fetch project keys for refresh:", err);
    refreshCredsFinish("fetch_keys_failed");
  }

  const masterKey = loadMasterKey();
  const { error } = await supabase
    .from("owner_backends")
    .update({
      supabase_url: projectUrl(backend.supabase_project_ref),
      supabase_publishable_key_encrypted: encrypt(apiKeys.publishableKey, masterKey),
      supabase_secret_key_encrypted: encrypt(apiKeys.secretKey, masterKey),
      supabase_jwt_secret_encrypted: encrypt(jwtSecret, masterKey),
      supabase_oauth_refresh_token_encrypted: encrypt(access.refreshToken, masterKey),
      grant_status: "ok",
      last_validated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);
  if (error) {
    console.error("[buendia] persist failed during creds refresh:", error);
    refreshCredsFinish("persist_failed");
  }

  await recordAudit(supabase, {
    actorId: user.id,
    action: "backend.credentials_refreshed",
    metadata: { source: "manual" },
  });

  refreshCredsFinish("ok");
}
