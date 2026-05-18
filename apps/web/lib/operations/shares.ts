import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAudit } from "@buendia/db";
import { Errors, fail, ok, type OpResult } from "@/lib/api-errors";
import {
  generateInvitationToken,
  hashInvitationToken,
  invitationExpiry,
  invitationUrl,
} from "@/lib/invitations";

/**
 * Sharing operations. Both the dashboard's `/apps/[slug]` form actions
 * and `/api/v1/apps/:slug/shares` HTTP handlers go through here.
 *
 * Behaviour matches ticket 30 / 31: if the email belongs to a Buendia
 * account, we upsert `public.app_shares`. Otherwise we create a
 * `public.invitations` row and surface a sharable link; the recipient
 * signs up via /invite?token=… and the auth action resolves the
 * pending invitation into an app_shares row.
 */

interface OwnedAppContext {
  id: string;
  slug: string;
  owner_id: string;
}

async function loadOwnedApp(
  supabase: SupabaseClient,
  userId: string,
  slug: string,
): Promise<OpResult<OwnedAppContext>> {
  const { data: app } = await supabase
    .from("apps")
    .select("id, slug, owner_id")
    .eq("slug", slug)
    .maybeSingle();
  if (!app) return fail(Errors.notFound("App not found."));
  if (app.owner_id !== userId) return fail(Errors.forbidden("Only the owner can manage sharing."));
  return ok({ id: app.id, slug: app.slug, owner_id: app.owner_id });
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function normalizeRole(raw: string | null | undefined): "viewer" | "editor" {
  return raw === "editor" ? "editor" : "viewer";
}

/* ----------------------------------------------------------------------
 * Add collaborator (or create pending invitation)
 * -------------------------------------------------------------------- */

export type AddCollaboratorResult =
  | {
      kind: "share";
      user_id: string;
      role: "viewer" | "editor";
      previous_role: "viewer" | "editor" | null;
    }
  | {
      kind: "invitation";
      invitation_id: string;
      email: string;
      role: "viewer" | "editor";
      url: string;
      expires_at: string;
    };

export interface AddCollaboratorInput {
  email: string;
  role: string | null | undefined;
  /** Origin to embed in the invitation URL (request-derived). */
  origin: string;
}

export async function addCollaborator(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string,
  slug: string,
  input: AddCollaboratorInput,
): Promise<OpResult<AddCollaboratorResult>> {
  const ctx = await loadOwnedApp(supabase, userId, slug);
  if (!ctx.ok) return ctx;

  const email = normalizeEmail(input.email);
  if (!email) return fail(Errors.badRequest("Email is required."));
  if (email === userEmail.toLowerCase()) {
    return fail(Errors.badRequest("You can't invite yourself."));
  }
  const role = normalizeRole(input.role);

  const { data: invitee } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (invitee) {
    if (invitee.id === ctx.data.owner_id) {
      return fail(Errors.badRequest("That user already owns the app."));
    }
    const { data: existing } = await supabase
      .from("app_shares")
      .select("role")
      .eq("app_id", ctx.data.id)
      .eq("user_id", invitee.id)
      .maybeSingle();

    const { error: upsertError } = await supabase.from("app_shares").upsert(
      {
        app_id: ctx.data.id,
        user_id: invitee.id,
        role,
        invited_by: userId,
      },
      { onConflict: "app_id,user_id" },
    );
    if (upsertError) {
      console.error("[buendia] app_shares upsert failed:", upsertError);
      return fail(Errors.internal("Couldn't save the share."));
    }

    const previousRole = (existing?.role as "viewer" | "editor" | undefined) ?? null;
    const action = previousRole && previousRole !== role ? "share.role_changed" : "share.invited";

    await recordAudit(supabase, {
      actorId: userId,
      action,
      targetAppId: ctx.data.id,
      targetUserId: invitee.id,
      metadata: { slug, role, previous_role: previousRole },
    });

    return ok({
      kind: "share",
      user_id: invitee.id,
      role,
      previous_role: previousRole,
    });
  }

  // Email doesn't belong to a Buendia account — pending invitation path.
  // The plaintext token only ever lives in this scope and in the URL we
  // return to the caller. The DB sees only its SHA-256.
  const token = generateInvitationToken();
  const tokenHash = `\\x${hashInvitationToken(token).toString("hex")}`;
  const expiresAt = invitationExpiry().toISOString();

  const { data: invRow, error: invError } = await supabase
    .from("invitations")
    .upsert(
      {
        app_id: ctx.data.id,
        email,
        role,
        invited_by: userId,
        token_hash: tokenHash,
        expires_at: expiresAt,
      },
      { onConflict: "app_id,email" },
    )
    .select("id, email, role, expires_at")
    .single();
  if (invError || !invRow) {
    console.error("[buendia] invitations upsert failed:", invError);
    return fail(Errors.internal("Couldn't save the invitation."));
  }

  await recordAudit(supabase, {
    actorId: userId,
    action: "share.invited",
    targetAppId: ctx.data.id,
    metadata: { slug, role, invitation_email: email, pending: true },
  });

  return ok({
    kind: "invitation",
    invitation_id: invRow.id,
    email: invRow.email,
    role: invRow.role as "viewer" | "editor",
    expires_at: invRow.expires_at,
    url: invitationUrl(input.origin, token),
  });
}

/* ----------------------------------------------------------------------
 * Remove collaborator
 * -------------------------------------------------------------------- */

export async function removeCollaborator(
  supabase: SupabaseClient,
  userId: string,
  slug: string,
  collaboratorUserId: string,
): Promise<OpResult<{ user_id: string }>> {
  const ctx = await loadOwnedApp(supabase, userId, slug);
  if (!ctx.ok) return ctx;

  const { error } = await supabase
    .from("app_shares")
    .delete()
    .eq("app_id", ctx.data.id)
    .eq("user_id", collaboratorUserId);
  if (error) {
    console.error("[buendia] app_shares delete failed:", error);
    return fail(Errors.internal("Couldn't remove the share."));
  }

  await recordAudit(supabase, {
    actorId: userId,
    action: "share.removed",
    targetAppId: ctx.data.id,
    targetUserId: collaboratorUserId,
    metadata: { slug },
  });

  return ok({ user_id: collaboratorUserId });
}

/* ----------------------------------------------------------------------
 * Cancel pending invitation
 * -------------------------------------------------------------------- */

export async function cancelInvitation(
  supabase: SupabaseClient,
  userId: string,
  slug: string,
  invitationIdOrEmail: string,
): Promise<OpResult<{ invitation_id: string }>> {
  const ctx = await loadOwnedApp(supabase, userId, slug);
  if (!ctx.ok) return ctx;

  // The HTTP endpoint accepts either an invitation id or an email. The
  // dashboard always sends id; the API surface lets curl users do either.
  const looksLikeEmail = invitationIdOrEmail.includes("@");
  const query = supabase.from("invitations").delete().eq("app_id", ctx.data.id);
  const { data, error } = await (
    looksLikeEmail
      ? query.eq("email", normalizeEmail(invitationIdOrEmail))
      : query.eq("id", invitationIdOrEmail)
  )
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[buendia] invitations delete failed:", error);
    return fail(Errors.internal("Couldn't cancel the invitation."));
  }
  if (!data) return fail(Errors.notFound("No matching invitation."));

  await recordAudit(supabase, {
    actorId: userId,
    action: "share.removed",
    targetAppId: ctx.data.id,
    metadata: { slug, invitation_id: data.id },
  });

  return ok({ invitation_id: data.id });
}
