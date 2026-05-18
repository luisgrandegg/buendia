"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { recordAudit } from "@buendia/db";
import { PAT_REVEAL_COOKIE } from "@/lib/pat-reveal-cookie";
import { mintPersonalAccessToken } from "@/lib/personal-access-tokens";
import { createClient } from "@/lib/supabase/server";

/**
 * Server actions for /settings/tokens.
 *
 * Creating a token returns the plaintext exactly once. Server actions
 * can't return data through the form-submission redirect, so we stash
 * the plaintext in a short-lived httpOnly cookie keyed by token id, and
 * the page reads + clears it on the next render. The cookie is
 * sameSite=strict + httpOnly so it's only readable by the same-origin
 * server render that consumes it, and it auto-expires after 5 minutes
 * if the user navigates away before seeing it.
 *
 * See decisions/0011-personal-access-tokens.md.
 */

const REVEAL_TTL_SECONDS = 5 * 60;
const MAX_NAME_LENGTH = 80;

type CreateStatus = "ok" | "unauthenticated" | "missing_name" | "write_failed";
type RevokeStatus = "ok" | "unauthenticated" | "not_found";

function tokensRedirect(params: Record<string, string>): never {
  const qs = new URLSearchParams(params).toString();
  redirect(`/settings/tokens${qs ? `?${qs}` : ""}`);
}

export async function createPersonalAccessTokenAction(formData: FormData): Promise<void> {
  const rawName = formData.get("name");
  const name = typeof rawName === "string" ? rawName.trim().slice(0, MAX_NAME_LENGTH) : "";
  if (!name) tokensRedirect({ create: "missing_name" satisfies CreateStatus });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) tokensRedirect({ create: "unauthenticated" satisfies CreateStatus });

  const minted = mintPersonalAccessToken();

  const { data, error } = await supabase
    .from("personal_access_tokens")
    .insert({
      user_id: user.id,
      name,
      token_prefix: minted.prefix,
      token_hash: `\\x${minted.hash.toString("hex")}`,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[buendia] pat create failed:", error);
    tokensRedirect({ create: "write_failed" satisfies CreateStatus });
  }

  await recordAudit(supabase, {
    actorId: user.id,
    action: "pat.created",
    metadata: { token_id: data.id, name },
  });

  const cookieJar = await cookies();
  cookieJar.set({
    name: PAT_REVEAL_COOKIE,
    value: JSON.stringify({ id: data.id, plaintext: minted.plaintext }),
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/settings/tokens",
    maxAge: REVEAL_TTL_SECONDS,
  });

  tokensRedirect({ create: "ok" satisfies CreateStatus });
}

export async function revokePersonalAccessTokenAction(formData: FormData): Promise<void> {
  const rawId = formData.get("id");
  const id = typeof rawId === "string" ? rawId : "";
  if (!id) tokensRedirect({ revoke: "not_found" satisfies RevokeStatus });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) tokensRedirect({ revoke: "unauthenticated" satisfies RevokeStatus });

  // RLS limits the update to the caller's own rows, so a wrong id here
  // just returns zero affected rows — no cross-user leak risk.
  const { data, error } = await supabase
    .from("personal_access_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null)
    .select("id, name")
    .maybeSingle();

  if (error) {
    console.error("[buendia] pat revoke failed:", error);
    tokensRedirect({ revoke: "not_found" satisfies RevokeStatus });
  }
  if (!data) tokensRedirect({ revoke: "not_found" satisfies RevokeStatus });

  await recordAudit(supabase, {
    actorId: user.id,
    action: "pat.revoked",
    metadata: { token_id: data.id, name: data.name },
  });

  tokensRedirect({ revoke: "ok" satisfies RevokeStatus });
}

/**
 * Server action invoked by a tiny client component on the tokens page
 * once the plaintext has been rendered. Drops the reveal cookie so a
 * page refresh won't show the token again. Best-effort: if the user
 * closes the tab first, the cookie still expires via its 5-minute
 * maxAge.
 */
export async function clearRevealedTokenAction(): Promise<void> {
  const cookieJar = await cookies();
  cookieJar.delete({ name: PAT_REVEAL_COOKIE, path: "/settings/tokens" });
}
