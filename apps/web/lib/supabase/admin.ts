import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Admin client for the *control-plane* Supabase project. Uses the secret
 * key (service-role replacement), so it bypasses RLS — never import this
 * from code that runs in the browser.
 *
 * Used by:
 *   - The edge serve route (`/a/[slug]`) to read `owner_backends` and
 *     download the HTML blob for a collaborator who has membership but
 *     no direct RLS access.
 *   - The JWT mint endpoint (`/api/jwt/refresh`) for the same reason
 *     (resolves ADR 0007's deferred gap).
 *
 * Never use this for app data — that always goes through the per-user
 * Supabase project with a scoped JWT, per the JWT-scope invariant.
 */
export function createAdminClient() {
  return createClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
