"use server";

import { redirect } from "next/navigation";
import { recordAudit } from "@buendia/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Server actions for the share panel on `/apps/[slug]`. Owners can invite
 * collaborators by email, change their role (viewer ↔ editor), and
 * remove them. Each path writes to `public.app_shares` and emits an
 * `audit_log` row.
 *
 * MVP scope: we can only invite users who already have a Buendia
 * account. Email-driven invitations for new users land with ticket 31.
 */

type ShareStatus =
  | "ok_invited"
  | "ok_role_changed"
  | "ok_removed"
  | "unauthenticated"
  | "missing_email"
  | "user_not_found"
  | "self_invite"
  | "not_owner"
  | "not_found"
  | "already_member"
  | "write_failed";

function shareRedirect(slug: string, status: ShareStatus): never {
  redirect(`/apps/${slug}?share=${status}`);
}

interface SessionContext {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string; email: string };
  app: { id: string; slug: string; owner_id: string };
}

async function loadOwnedApp(slug: string): Promise<SessionContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) shareRedirect(slug, "unauthenticated");

  const { data: app } = await supabase
    .from("apps")
    .select("id, slug, owner_id")
    .eq("slug", slug)
    .maybeSingle();
  if (!app) shareRedirect(slug, "not_found");
  if (app.owner_id !== user.id) shareRedirect(slug, "not_owner");

  return {
    supabase,
    user: { id: user.id, email: user.email ?? "" },
    app: { id: app.id, slug: app.slug, owner_id: app.owner_id },
  };
}

function readEmail(formData: FormData): string {
  const raw = formData.get("email");
  if (typeof raw !== "string" || !raw.trim()) {
    return "";
  }
  return raw.trim().toLowerCase();
}

function readRole(formData: FormData): "viewer" | "editor" {
  const raw = formData.get("role");
  return raw === "editor" ? "editor" : "viewer";
}

export async function inviteCollaboratorAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "");
  const ctx = await loadOwnedApp(slug);

  const email = readEmail(formData);
  if (!email) shareRedirect(slug, "missing_email");
  if (email === ctx.user.email.toLowerCase()) shareRedirect(slug, "self_invite");

  const role = readRole(formData);

  // We look the user up via the admin client because RLS on public.users
  // hides everyone except the requester. This is by design — letting the
  // browser look up arbitrary emails would be an enumeration oracle.
  const admin = createAdminClient();
  const { data: invitee } = await admin.from("users").select("id").eq("email", email).maybeSingle();
  if (!invitee) shareRedirect(slug, "user_not_found");

  // Disallow re-inviting the owner.
  if (invitee.id === ctx.app.owner_id) shareRedirect(slug, "self_invite");

  // If a row already exists, upsert acts as a role change; track which
  // case for the audit action emitted at the end.
  const { data: existing } = await ctx.supabase
    .from("app_shares")
    .select("role")
    .eq("app_id", ctx.app.id)
    .eq("user_id", invitee.id)
    .maybeSingle();

  const { error: upsertError } = await ctx.supabase.from("app_shares").upsert(
    {
      app_id: ctx.app.id,
      user_id: invitee.id,
      role,
      invited_by: ctx.user.id,
    },
    { onConflict: "app_id,user_id" },
  );
  if (upsertError) {
    console.error("[buendia] app_shares upsert failed:", upsertError);
    shareRedirect(slug, "write_failed");
  }

  await recordAudit(ctx.supabase, {
    actorId: ctx.user.id,
    action: existing && existing.role !== role ? "share.role_changed" : "share.invited",
    targetAppId: ctx.app.id,
    targetUserId: invitee.id,
    metadata: { slug: ctx.app.slug, role, previous_role: existing?.role ?? null },
  });

  shareRedirect(slug, existing && existing.role !== role ? "ok_role_changed" : "ok_invited");
}

export async function removeCollaboratorAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "");
  const ctx = await loadOwnedApp(slug);

  const userId = formData.get("user_id");
  if (typeof userId !== "string" || !userId) shareRedirect(slug, "not_found");

  const { error } = await ctx.supabase
    .from("app_shares")
    .delete()
    .eq("app_id", ctx.app.id)
    .eq("user_id", userId);
  if (error) {
    console.error("[buendia] app_shares delete failed:", error);
    shareRedirect(slug, "write_failed");
  }

  await recordAudit(ctx.supabase, {
    actorId: ctx.user.id,
    action: "share.removed",
    targetAppId: ctx.app.id,
    targetUserId: userId,
    metadata: { slug: ctx.app.slug },
  });

  shareRedirect(slug, "ok_removed");
}
