import { describe, expect, it } from "vitest";

import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it("returns same-origin paths verbatim", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
    expect(safeNextPath("/a/my-slug")).toBe("/a/my-slug");
    expect(safeNextPath("/settings/tokens?revealed=1")).toBe("/settings/tokens?revealed=1");
  });

  it("rejects absolute URLs (the open-redirect primitive)", () => {
    expect(safeNextPath("https://attacker.example/")).toBe("/");
    expect(safeNextPath("http://attacker.example/")).toBe("/");
    expect(safeNextPath("javascript:alert(1)")).toBe("/");
  });

  it("rejects protocol-relative paths", () => {
    expect(safeNextPath("//attacker.example/")).toBe("/");
    expect(safeNextPath("/\\attacker.example")).toBe("/");
  });

  it("rejects bare or relative paths", () => {
    expect(safeNextPath("dashboard")).toBe("/");
    expect(safeNextPath("./dashboard")).toBe("/");
    expect(safeNextPath("../escape")).toBe("/");
  });

  it("returns `/` for null / undefined / empty", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("")).toBe("/");
  });
});
