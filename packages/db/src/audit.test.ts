import { describe, expect, it, vi } from "vitest";

import { AUDIT_ACTIONS, recordAudit, type AuditAction, type AuditWriter } from "./audit";

/**
 * Coverage for PR #9 (control-plane audit log helper). The helper inserts a
 * single row, normalises optional fields to null, and must never throw —
 * audit failures are logged-and-swallowed because they should not break the
 * user's primary action.
 */

function fakeClient(insertImpl: (row: object) => Promise<unknown>): AuditWriter {
  return {
    from: vi.fn(() => ({
      insert: insertImpl,
    })),
  } as unknown as AuditWriter;
}

describe("AUDIT_ACTIONS", () => {
  it("is a frozen-shape registry of well-known action strings", () => {
    expect(AUDIT_ACTIONS).toContain("auth.signed_in");
    expect(AUDIT_ACTIONS).toContain("backend.connected");
    expect(AUDIT_ACTIONS).toContain("share.invited");
    expect(AUDIT_ACTIONS).toContain("app.version.uploaded");
    // The registry's literal type is part of the contract — no duplicates.
    const set = new Set<string>(AUDIT_ACTIONS);
    expect(set.size).toBe(AUDIT_ACTIONS.length);
  });
});

describe("recordAudit", () => {
  it("inserts into the audit_log table with snake_case columns", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const client = fakeClient(insert);

    await recordAudit(client, {
      actorId: "user-1",
      action: "share.invited" as AuditAction,
      targetAppId: "app-1",
      targetUserId: "user-2",
      metadata: { email: "x@example.com" },
    });

    expect(client.from).toHaveBeenCalledWith("audit_log");
    expect(insert).toHaveBeenCalledWith({
      actor_id: "user-1",
      action: "share.invited",
      target_app_id: "app-1",
      target_user_id: "user-2",
      metadata: { email: "x@example.com" },
    });
  });

  it("defaults optional fields to null rather than omitting them", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const client = fakeClient(insert);

    await recordAudit(client, {
      actorId: "user-1",
      action: "auth.signed_in" as AuditAction,
    });

    expect(insert).toHaveBeenCalledWith({
      actor_id: "user-1",
      action: "auth.signed_in",
      target_app_id: null,
      target_user_id: null,
      metadata: null,
    });
  });

  it("swallows insert errors but logs them to stderr", async () => {
    const insert = vi.fn(async () => ({ error: { message: "rls denied" } }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = fakeClient(insert);

    await expect(
      recordAudit(client, { actorId: "x", action: "app.created" as AuditAction }),
    ).resolves.toBeUndefined();

    expect(errSpy).toHaveBeenCalled();
    expect(String(errSpy.mock.calls[0])).toMatch(/audit_log insert failed/);
  });

  it("swallows thrown rejections and logs them", async () => {
    const insert = vi.fn(async () => {
      throw new Error("network down");
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = fakeClient(insert);

    await expect(
      recordAudit(client, { actorId: "x", action: "backend.disconnected" as AuditAction }),
    ).resolves.toBeUndefined();

    expect(errSpy).toHaveBeenCalled();
    expect(String(errSpy.mock.calls[0])).toMatch(/audit_log insert threw/);
  });
});
