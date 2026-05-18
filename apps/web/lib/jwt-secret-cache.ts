/**
 * In-process LRU cache for owner-backend JWT secrets.
 *
 * Decrypting an owner's Supabase JWT secret on every refresh is an
 * unnecessary CPU amplification path — a misbehaving SDK that polls
 * `/api/jwt/refresh` in a tight loop forces an AES-256-GCM decrypt
 * per call. The cache holds the *plaintext* secret in process memory
 * for at most a minute keyed by owner id, so a hot path stays hot.
 *
 * Scope: per-Lambda-instance (Vercel) or per-Node-process (self-hosted).
 * Cold starts re-decrypt; that's expected and fine. No persistent
 * storage — the master key has to be invoked at some point on each
 * cold worker anyway.
 *
 * Audit ref: SECURITY_AUDIT.md §H6 (the cache half of ticket 70).
 */

interface CacheEntry {
  secret: string;
  expiresAt: number;
}

const TTL_MS = 60 * 1000;
const MAX_ENTRIES = 256;

const cache = new Map<string, CacheEntry>();

export interface DecryptedSecretCache {
  /**
   * Resolve the plaintext secret for `ownerId`, decrypting via `load`
   * on a miss or expired entry. The loader is only called on a miss,
   * so a stampede of refreshes for the same owner collapses to one
   * decrypt per TTL.
   */
  get(ownerId: string, load: () => Promise<string>): Promise<string>;
  /** Drop an entry (e.g. after a credential-refresh action rotates it). */
  invalidate(ownerId: string): void;
  /** Test seam: clear everything. */
  clear(): void;
}

export const jwtSecretCache: DecryptedSecretCache = {
  async get(ownerId, load) {
    const existing = cache.get(ownerId);
    const now = Date.now();
    if (existing && existing.expiresAt > now) {
      // LRU touch: move to most-recently-used end of the Map iteration order.
      cache.delete(ownerId);
      cache.set(ownerId, existing);
      return existing.secret;
    }
    const secret = await load();
    cache.set(ownerId, { secret, expiresAt: now + TTL_MS });
    // Trim oldest entries when over the cap. Maps preserve insertion order;
    // delete from the front.
    while (cache.size > MAX_ENTRIES) {
      const first = cache.keys().next().value;
      if (first === undefined) break;
      cache.delete(first);
    }
    return secret;
  },
  invalidate(ownerId) {
    cache.delete(ownerId);
  },
  clear() {
    cache.clear();
  },
};

// Test-only: tweak the TTL constants. Kept in the module to avoid
// re-exporting from the build.
export const _internalConstants = { TTL_MS, MAX_ENTRIES };
