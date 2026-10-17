import { describe, expect, it } from "vitest";
import { safeLocalPath } from "./safe-return-path";

describe("safeLocalPath", () => {
  it("keeps same-origin paths", () => {
    expect(safeLocalPath("/dashboard")).toBe("/dashboard");
    expect(safeLocalPath("/lists/abc?x=1#y")).toBe("/lists/abc?x=1#y");
  });

  it("rejects off-site and malformed values", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "evil", "", null, undefined, 42]) {
      expect(safeLocalPath(bad)).toBe("/");
    }
  });
});
