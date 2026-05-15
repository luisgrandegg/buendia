import { encrypt, loadMasterKey } from "@buendia/db";
import { createClient } from "@/lib/supabase/server";

/**
 * Helpers around `public.owner_backends`. Encryption happens here so the
 * encrypted columns never travel through code that doesn't need them.
 */

export interface OwnerBackendStatus {
  exists: boolean;
  connectedAt: string | null;
  hasProject: boolean;
}

export async function getOwnerBackendStatus(userId: string): Promise<OwnerBackendStatus> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("owner_backends")
    .select("user_id, supabase_project_ref, connected_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    // RLS denies non-owner reads, which is fine; surface as "not connected".
    return { exists: false, connectedAt: null, hasProject: false };
  }
  if (!data) {
    return { exists: false, connectedAt: null, hasProject: false };
  }
  return {
    exists: true,
    connectedAt: data.connected_at,
    hasProject: Boolean(data.supabase_project_ref),
  };
}

/**
 * Upsert a row with just the OAuth refresh token. The project columns stay
 * NULL until ticket 11's project provisioner fills them.
 */
export async function persistOauthRefreshToken(
  userId: string,
  refreshToken: string,
): Promise<{ error?: string }> {
  const masterKey = loadMasterKey();
  const encrypted = encrypt(refreshToken, masterKey);

  const supabase = await createClient();
  const { error } = await supabase.from("owner_backends").upsert(
    {
      user_id: userId,
      supabase_oauth_refresh_token_encrypted: encrypted,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return { error: error.message };
  }
  return {};
}
