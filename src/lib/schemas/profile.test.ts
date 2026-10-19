import { describe, expect, it } from "vitest";
import { profileDetailsSchema, profilePreferencesSchema } from "./profile";
import { profileUpdateSchema, SUPPORTED_CURRENCIES } from "@/lib/currency";
import { LOCALES } from "@/lib/i18n/config";

describe("profile details", () => {
  it("trims Unicode names and allows either name independently", () => {
    expect(profileDetailsSchema.parse({ firstName: "  Łukasz  " })).toEqual({
      firstName: "Łukasz",
      lastName: null,
    });
    expect(profileDetailsSchema.parse({ lastName: "  Żółć  " })).toEqual({
      firstName: null,
      lastName: "Żółć",
    });
  });

  it("normalizes empty, absent, and null names to null", () => {
    expect(profileDetailsSchema.parse({})).toEqual({ firstName: null, lastName: null });
    expect(profileDetailsSchema.parse({ firstName: " \t\n", lastName: null })).toEqual({
      firstName: null,
      lastName: null,
    });
  });

  it.each(["firstName", "lastName"])("enforces the %s length after trimming", (field) => {
    expect(profileDetailsSchema.safeParse({ [field]: ` ${"a".repeat(100)} ` }).success).toBe(true);
    const result = profileDetailsSchema.safeParse({ [field]: "a".repeat(101) });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("validation.nameMax100");
  });

  it.each([42, true, [], {}])("rejects non-text names: %j", (firstName) => {
    expect(profileDetailsSchema.safeParse({ firstName }).success).toBe(false);
  });

  it("does not accept owner IDs or account email", () => {
    expect(profileDetailsSchema.safeParse({ profileId: "other" }).success).toBe(false);
    expect(profileDetailsSchema.safeParse({ email: "other@example.test" }).success).toBe(false);
  });
});

describe("profile preferences", () => {
  it("accepts every existing currency and locale", () => {
    for (const defaultCurrency of SUPPORTED_CURRENCIES) {
      for (const language of LOCALES) {
        expect(profilePreferencesSchema.parse({ defaultCurrency, language })).toEqual({ defaultCurrency, language });
      }
    }
  });

  it.each([
    {},
    { defaultCurrency: "PLN" },
    { language: "pl" },
    { defaultCurrency: "CAD", language: "pl" },
    { defaultCurrency: "PLN", language: "de" },
    { defaultCurrency: null, language: "pl" },
    { defaultCurrency: "PLN", language: "en", profileId: "other" },
  ])("rejects incomplete or invalid preferences: %j", (input) => {
    expect(profilePreferencesSchema.safeParse(input).success).toBe(false);
  });

  it("preserves the existing currency-only contract", () => {
    expect(profileUpdateSchema.parse({ defaultCurrency: "EUR" })).toEqual({ defaultCurrency: "EUR" });
  });
});
