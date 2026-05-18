"use client";

import { useEffect } from "react";
import { clearRevealedTokenAction } from "@/app/actions/personal-access-tokens";

/**
 * Fired once after the reveal panel paints, this clears the httpOnly
 * cookie so a hard refresh won't show the plaintext again. If the user
 * closes the tab first, the 5-minute cookie TTL is the backstop.
 */
export function ClearRevealOnMount() {
  useEffect(() => {
    void clearRevealedTokenAction();
  }, []);
  return null;
}
