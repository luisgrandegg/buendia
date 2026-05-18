function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const env = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabasePublishableKey() {
    return required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  },
  /**
   * Control-plane secret key (Supabase service-role replacement). Server
   * only — never imported by code that runs in the browser. Used by the
   * admin client in `lib/supabase/admin.ts` to read owner_backends + the
   * app-html bucket from collaborator routes.
   */
  get supabaseSecretKey() {
    return required("SUPABASE_SECRET_KEY");
  },
  /**
   * Master KEK for envelope-encrypting owner-backend credentials. Decoded by
   * `loadMasterKey()` in `@buendia/db`.
   */
  get buendiaMasterKey() {
    return required("BUENDIA_MASTER_KEY");
  },
  /**
   * Supabase Management OAuth app credentials. The operator registers a
   * Supabase OAuth app and supplies these. See
   * decisions/0003-supabase-management-oauth.md.
   */
  get supabaseOauthClientId() {
    return required("SUPABASE_OAUTH_CLIENT_ID");
  },
  get supabaseOauthClientSecret() {
    return required("SUPABASE_OAUTH_CLIENT_SECRET");
  },
  /**
   * Shared secret the Vercel cron sends as `Authorization: Bearer ...`.
   * Required by `/api/cron/*` routes; missing → cron requests are
   * rejected. Vercel auto-injects this when configured in the project
   * settings; locally it lives in `.env.local`.
   */
  get cronSecret() {
    return required("CRON_SECRET");
  },
};
