import { cookies } from "next/headers";

/**
 * Shared name + read helper for the one-time PAT reveal cookie. The
 * cookie is set by createPersonalAccessTokenAction and read here by the
 * settings/tokens page. Clearing happens via clearRevealedTokenAction
 * (so the "use server" file only contains actions).
 */
export const PAT_REVEAL_COOKIE = "buendia_pat_reveal";

export async function readRevealedPat(): Promise<{ id: string; plaintext: string } | null> {
  const cookieJar = await cookies();
  const raw = cookieJar.get(PAT_REVEAL_COOKIE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw.value) as { id?: string; plaintext?: string };
    if (typeof parsed.id !== "string" || typeof parsed.plaintext !== "string") return null;
    return { id: parsed.id, plaintext: parsed.plaintext };
  } catch {
    return null;
  }
}
