import { describe, expect, it } from "vitest";
import { profileDisplayName } from "./profile-display-name";

describe("profile display name", () => {
  it("joins trimmed Unicode names", () => {
    expect(profileDisplayName(" Łukasz ", " Żółć ", "account@example.test")).toBe("Łukasz Żółć");
  });

  it("uses either name independently and falls back only when both are empty", () => {
    expect(profileDisplayName("Anna", null, "account@example.test")).toBe("Anna");
    expect(profileDisplayName(null, "Kowalska", "account@example.test")).toBe("Kowalska");
    expect(profileDisplayName(" ", null, "account@example.test")).toBe("account@example.test");
    expect(profileDisplayName(null, null, "")).toBe("");
  });
});
