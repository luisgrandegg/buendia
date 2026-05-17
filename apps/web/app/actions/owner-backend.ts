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
