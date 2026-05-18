import { NextResponse } from "next/server";
import { hashInvitationToken } from "@/lib/invitations";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * `GET /invite?token=<token>` — entry point for invitation links.
 *
 * - Validates the token against `public.invitations` via the admin
 *   client (it has to bypass RLS so unauthenticated visitors can
 *   resolve their own invite).
 * - Signed-in users whose Buendia email matches the invitation: accept
 *   immediately (insert app_shares, delete invitation), redirect to
 *   the app.
 * - Signed-in users whose email *doesn't* match: redirect to /signin
 *   with a hint that the invitation is for a different account.
 * - Signed-out users: redirect to /signup with the email + token
 *   prefilled. After signup, the auth action resolves any matching
 *   invitations.
 */

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/?invite=missing_token", url.origin));
  }

  const admin = createAdminClient();
  // Look up by SHA-256 of the plaintext — the DB never stores the
  // plaintext (audit §L3, migration 0014). The unique index on
  // token_hash makes this an O(1) lookup; we never branch on per-byte
  // equality, so no constant-time-compare gymnastics needed here.
  const tokenHash = `\\x${hashInvitationToken(token).toString("hex")}`;
  const { data: invitation } = await admin
    .from("invitations")
    .select("id, app_id, email, role, expires_at, app:apps!invitations_app_id_fkey(slug)")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!invitation) {
    return NextResponse.redirect(new URL("/?invite=invalid", url.origin));
  }

  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    return NextResponse.redirect(new URL("/?invite=expired", url.origin));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const app = (invitation.app as { slug?: string } | null) ?? null;
  const slug = app?.slug;
  if (!slug) {
    return NextResponse.redirect(new URL("/?invite=invalid", url.origin));
  }

  if (user) {
    if ((user.email ?? "").toLowerCase() !== invitation.email.toLowerCase()) {
      return NextResponse.redirect(
        new URL(
          `/?invite=email_mismatch&expected=${encodeURIComponent(invitation.email)}`,
          url.origin,
        ),
      );
    }

    await resolveInvitation(admin, invitation.id, invitation.app_id, user.id, invitation.role);
    return NextResponse.redirect(new URL(`/a/${slug}`, url.origin));
  }

  // Signed out — prefill the signup form with the invitation context.
  return NextResponse.redirect(
    new URL(
      `/signup?invitation=${encodeURIComponent(token)}&email=${encodeURIComponent(invitation.email)}`,
      url.origin,
    ),
  );
}

async function resolveInvitation(
  admin: ReturnType<typeof createAdminClient>,
  invitationId: string,
  appId: string,
  userId: string,
  role: string,
): Promise<void> {
  // Insert the share row (upsert to handle the rare race where the user
  // accepts twice). Use admin so RLS doesn't deny — they're not the
  // owner.
  await admin.from("app_shares").upsert(
    {
      app_id: appId,
      user_id: userId,
      role,
    },
    { onConflict: "app_id,user_id" },
  );
  await admin.from("invitations").delete().eq("id", invitationId);
}
