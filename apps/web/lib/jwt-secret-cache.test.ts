import { describe, expect, it, beforeEach, vi } from "vitest";

import { _internalConstants, jwtSecretCache } from "./jwt-secret-cache";

describe("jwtSecretCache", () => {
  beforeEach(() => {
    jwtSecretCache.clear();
    vi.useRealTimers();
  });

  it("decrypts only once within the TTL for the same owner", async () => {
    const load = vi.fn().mockResolvedValue("sekret");
    const a = await jwtSecretCache.get("owner-1", load);
    const b = await jwtSecretCache.get("owner-1", load);
    expect(a).toBe("sekret");
    expect(b).toBe("sekret");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("re-decrypts after the TTL expires", async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("second");
    expect(await jwtSecretCache.get("owner-1", load)).toBe("first");
    vi.advanceTimersByTime(_internalConstants.TTL_MS + 100);
    expect(await jwtSecretCache.get("owner-1", load)).toBe("second");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("isolates per owner id", async () => {
    const loadA = vi.fn().mockResolvedValue("a-secret");
    const loadB = vi.fn().mockResolvedValue("b-secret");
    expect(await jwtSecretCache.get("a", loadA)).toBe("a-secret");
    expect(await jwtSecretCache.get("b", loadB)).toBe("b-secret");
    expect(loadA).toHaveBeenCalledOnce();
    expect(loadB).toHaveBeenCalledOnce();
  });

  it("invalidate() drops the entry so the next get re-loads", async () => {
    const load = vi.fn().mockResolvedValueOnce("one").mockResolvedValueOnce("two");
    expect(await jwtSecretCache.get("o", load)).toBe("one");
    jwtSecretCache.invalidate("o");
    expect(await jwtSecretCache.get("o", load)).toBe("two");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
