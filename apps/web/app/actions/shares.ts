"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { invitationUrl } from "@/lib/invitations";
import { originFromHeaders } from "@/lib/oauth";
import { addCollaborator, cancelInvitation, removeCollaborator } from "@/lib/operations/shares";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Thin form-action wrappers around `lib/operations/shares`. The dashboard
 * share panel + the HTTP API (`/api/v1/apps/:slug/shares`) both go
 * through those operations so behaviour and audit trail stay aligned.
 */

type ShareStatus =
  | "ok_invited"
  | "ok_invited_email"
  | "ok_role_changed"
  | "ok_removed"
  | "ok_invitation_removed"
  | "unauthenticated"
  | "missing_email"
  | "self_invite"
  | "not_owner"
  | "not_found"
  | "write_failed";

function shareRedirect(slug: string, status: ShareStatus): never {
  redirect(`/apps/${slug}?share=${status}`);
}

function shareStatusFor(code: string, message: string): ShareStatus {
  if (code === "not_found") return "not_found";
  if (code === "forbidden") return "not_owner";
  if (code === "bad_request") {
    if (message.includes("Email is required")) return "missing_email";
    if (message.includes("invite yourself")) return "self_invite";
    if (message.includes("already owns")) return "self_invite";
    return "missing_email";
  }
  return "write_failed";
}

async function resolveUser(): Promise<{ id: string; email: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { id: user.id, email: user.email ?? "" };
}

export async function inviteCollaboratorAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "");
  const user = await resolveUser();
  if (!user) shareRedirect(slug, "unauthenticated");

  const origin = originFromHeaders(await headers());
  const result = await addCollaborator(createAdminClient(), user.id, user.email, slug, {
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? "viewer"),
    origin,
  });

  if (!result.ok) {
    shareRedirect(slug, shareStatusFor(result.error.code, result.error.message));
  }
  if (result.data.kind === "invitation") {
    shareRedirect(slug, "ok_invited_email");
  }
  shareRedirect(slug, result.data.previous_role ? "ok_role_changed" : "ok_invited");
}

export async function removeCollaboratorAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "");
  const user = await resolveUser();
  if (!user) shareRedirect(slug, "unauthenticated");

  const userId = formData.get("user_id");
  if (typeof userId !== "string" || !userId) shareRedirect(slug, "not_found");

  const result = await removeCollaborator(createAdminClient(), user.id, slug, userId);
  if (!result.ok) {
    shareRedirect(slug, shareStatusFor(result.error.code, result.error.message));
  }
  shareRedirect(slug, "ok_removed");
}

export async function cancelInvitationAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "");
  const user = await resolveUser();
  if (!user) shareRedirect(slug, "unauthenticated");

  const invitationId = formData.get("invitation_id");
  if (typeof invitationId !== "string" || !invitationId) shareRedirect(slug, "not_found");

  const result = await cancelInvitation(createAdminClient(), user.id, slug, invitationId);
  if (!result.ok) {
    shareRedirect(slug, shareStatusFor(result.error.code, result.error.message));
  }
  shareRedirect(slug, "ok_invitation_removed");
}

export { invitationUrl };
