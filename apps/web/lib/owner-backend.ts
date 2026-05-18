import { byteaLiteral, decrypt, encrypt, loadMasterKey } from "@buendia/db";
import { createClient } from "@/lib/supabase/server";

/**
 * Helpers around `public.owner_backends`. Encryption happens here so the
 * encrypted columns never travel through code that doesn't need them.
 */

export type GrantStatus = "ok" | "revoked" | "unknown";

export interface OwnerBackendStatus {
  exists: boolean;
  connectedAt: string | null;
  hasProject: boolean;
  grantStatus: GrantStatus;
  lastValidatedAt: string | null;
}

export async function getOwnerBackendStatus(userId: string): Promise<OwnerBackendStatus> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("owner_backends")
    .select("user_id, supabase_project_ref, connected_at, grant_status, last_validated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    // RLS denies non-owner reads, which is fine; surface as "not connected".
    return {
      exists: false,
      connectedAt: null,
      hasProject: false,
      grantStatus: "ok",
      lastValidatedAt: null,
    };
  }
  return {
    exists: true,
    connectedAt: data.connected_at,
    hasProject: Boolean(data.supabase_project_ref),
    grantStatus: (data.grant_status as GrantStatus | null) ?? "ok",
    lastValidatedAt: data.last_validated_at,
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
  const encrypted = byteaLiteral(encrypt(refreshToken, masterKey));

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

/**
 * Return the user's decrypted Supabase OAuth refresh token, or `null` if
 * none is stored. Throws if BUENDIA_MASTER_KEY is missing or malformed —
 * those are configuration errors that should not be swallowed.
 */
export async function getOwnerRefreshToken(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("owner_backends")
    .select("supabase_oauth_refresh_token_encrypted")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data?.supabase_oauth_refresh_token_encrypted) {
    return null;
  }

  const blob = bufferFromBytea(data.supabase_oauth_refresh_token_encrypted);
  return decrypt(blob, loadMasterKey());
}

export interface ProvisionedProjectFields {
  projectRef: string;
  projectUrl: string;
  publishableKey: string;
  secretKey: string;
  jwtSecret: string;
  newRefreshToken?: string;
}

/**
 * Fill in the project-related columns on `owner_backends` after the
 * project has been created. Each sensitive value is envelope-encrypted
 * before it ever leaves this function.
 */
export async function completeProvisioning(
  userId: string,
  fields: ProvisionedProjectFields,
): Promise<{ error?: string }> {
  const masterKey = loadMasterKey();

  const row: Record<string, unknown> = {
    supabase_project_ref: fields.projectRef,
    supabase_url: fields.projectUrl,
    supabase_publishable_key_encrypted: byteaLiteral(encrypt(fields.publishableKey, masterKey)),
    supabase_secret_key_encrypted: byteaLiteral(encrypt(fields.secretKey, masterKey)),
    supabase_jwt_secret_encrypted: byteaLiteral(encrypt(fields.jwtSecret, masterKey)),
    last_validated_at: new Date().toISOString(),
  };
  if (fields.newRefreshToken) {
    row.supabase_oauth_refresh_token_encrypted = byteaLiteral(
      encrypt(fields.newRefreshToken, masterKey),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from("owner_backends").update(row).eq("user_id", userId);

  if (error) {
    return { error: error.message };
  }
  return {};
}

/**
 * Postgres `bytea` round-trips through PostgREST as either a Buffer
 * (Node), a hex string (`\x...`), or a Uint8Array, depending on driver
 * version. Normalise.
 */
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
