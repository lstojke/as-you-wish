import { describe, expect, it } from "vitest";
import { authErrorCode, authErrorMessage } from "./auth-errors";

describe("authErrorCode", () => {
  it("passes through known Supabase codes", () => {
    expect(authErrorCode({ code: "invalid_credentials" })).toBe("invalid_credentials");
    expect(authErrorCode({ code: "weak_password" })).toBe("weak_password");
  });

  it("normalizes duplicate-account codes", () => {
    expect(authErrorCode({ code: "user_already_registered" })).toBe("user_already_exists");
    expect(authErrorCode({ code: "email_exists" })).toBe("user_already_exists");
  });

  it("falls back to unknown", () => {
    expect(authErrorCode({ code: "something_new" })).toBe("unknown");
    expect(authErrorCode({})).toBe("unknown");
    expect(authErrorCode(null)).toBe("unknown");
  });
});

describe("authErrorMessage", () => {
  it("translates known codes per locale", () => {
    expect(authErrorMessage("pl", "invalid_credentials")).toBe("Nieprawidłowy e-mail lub hasło.");
    expect(authErrorMessage("en", "invalid_credentials")).toBe("Invalid email or password.");
  });

  it("never echoes raw text from the URL", () => {
    expect(authErrorMessage("en", "<script>Invalid login</script>")).toBe("Something went wrong. Please try again.");
  });

  it("returns null without an error", () => {
    expect(authErrorMessage("pl", null)).toBeNull();
  });
});
