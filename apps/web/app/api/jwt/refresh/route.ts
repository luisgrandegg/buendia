import { NextResponse } from "next/server";
import { decrypt, loadMasterKey } from "@buendia/db";
import { mintAppJwt, type AppRole } from "@/lib/jwt-mint";
import { createClient } from "@/lib/supabase/server";

/**
 * Mint a short-lived JWT scoped to a single app, signed with the *owner's*
 * Supabase project JWT secret. Every app request flows through this.
 *
 * - 401 if no Buendia session.
 * - 403 if the requester isn't a member of the requested app.
 * - 502 if the owner's backend isn't fully provisioned yet.
 * - 200 with `{ jwt, exp }` on success.
 *
 * The TTL is hard-capped at 15 minutes in `lib/jwt-mint.ts`. No knob.
 */
export async function POST(request: Request) {
  const appId = new URL(request.url).searchParams.get("app");
  if (!appId) {
    return NextResponse.json({ error: "missing_app" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // RLS on `app_members` (via the underlying apps + app_shares policies)
  // means a non-member sees nothing here.
  const { data: membership, error: membershipError } = await supabase
    .from("app_members")
    .select("app_id, user_id, role, team_id, schema_name")
    .eq("app_id", appId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Look up the owner's backend credentials. We read the owner row via a
  // separate fetch using owner_id from apps, because the requester may be
  // a collaborator (not the owner) and RLS on owner_backends denies them.
  const { data: ownership } = await supabase
    .from("apps")
    .select("owner_id")
    .eq("id", appId)
    .maybeSingle();
  if (!ownership) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // For MVP this fetch goes through a server-side Supabase client which
  // operates as the requester. If they're not the owner, RLS on
  // owner_backends won't return the row. Reading via the management API
  // or service role to bypass this lands in a follow-up; for now, the
  // owner can mint for themselves and collaborators get the path once
  // the edge route (ticket 22) consolidates the look-up server-side.
  const { data: backend } = await supabase
    .from("owner_backends")
    .select("supabase_jwt_secret_encrypted")
    .eq("user_id", ownership.owner_id)
    .maybeSingle();
  if (!backend?.supabase_jwt_secret_encrypted) {
    return NextResponse.json({ error: "backend_not_ready" }, { status: 502 });
  }

  let jwtSecret: string;
  try {
    const blob = bufferFromBytea(backend.supabase_jwt_secret_encrypted);
    jwtSecret = decrypt(blob, loadMasterKey());
  } catch (err) {
    console.error("[buendia] failed to decrypt owner jwt secret:", err);
    return NextResponse.json({ error: "decrypt_failed" }, { status: 500 });
  }

  const { jwt, exp } = mintAppJwt({
    jwtSecret,
    userId: user.id,
    appId: membership.app_id,
    appSchema: membership.schema_name,
    teamId: membership.team_id,
    role: membership.role as AppRole,
  });

  return NextResponse.json({ jwt, exp });
}

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
