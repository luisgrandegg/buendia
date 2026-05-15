import type { AppRole } from "@buendia/shared";

export type BuendiaMode = "hosted" | "standalone";

export interface BuendiaUser {
  id: string;
  email: string;
  displayName: string;
  role: AppRole;
}

export interface BuendiaApp {
  id: string;
  name: string;
}

export interface BuendiaClient {
  mode: BuendiaMode;
  user: BuendiaUser | null;
  app: BuendiaApp | null;
}

/**
 * Bootstrapping placeholder. The real implementation is tracked in
 * backlog/23-sdk-v1-hosted.md and backlog/24-sdk-standalone-overlay.md;
 * this stub exists only to lock in the public package surface and let the
 * monorepo build green.
 */
export const Buendia = {
  async init(): Promise<BuendiaClient> {
    return { mode: "standalone", user: null, app: null };
  },
};
