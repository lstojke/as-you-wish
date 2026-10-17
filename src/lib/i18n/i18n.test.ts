import { describe, expect, it } from "vitest";
import { en } from "./en";
import { pl } from "./pl";
import { DEFAULT_LOCALE, isLocale, isTranslationKey, t, translateMessage } from "./index";

function flatten(node: unknown, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string" || (value && typeof value === "object" && "other" in value)) {
      out[path] = value;
    } else {
      Object.assign(out, flatten(value, path));
    }
  }
  return out;
}

describe("dictionaries", () => {
  const plFlat = flatten(pl);
  const enFlat = flatten(en);

  it("have identical key sets", () => {
    expect(Object.keys(enFlat).sort()).toEqual(Object.keys(plFlat).sort());
  });

  it("contain no empty strings", () => {
    for (const flat of [plFlat, enFlat]) {
      for (const [key, value] of Object.entries(flat)) {
        const strings = typeof value === "string" ? [value] : Object.values(value as Record<string, string>);
        for (const s of strings) expect(s.trim(), key).not.toBe("");
      }
    }
  });

  it("give every Polish plural the one/few/many forms", () => {
    for (const [key, value] of Object.entries(plFlat)) {
      if (typeof value === "string") continue;
      expect(Object.keys(value as object).sort(), key).toEqual(["few", "many", "one", "other"]);
    }
  });
});

describe("t", () => {
  it("defaults to Polish", () => {
    expect(DEFAULT_LOCALE).toBe("pl");
  });

  it("returns the locale's string", () => {
    expect(t("pl", "language.label")).toBe("Język");
    expect(t("en", "language.label")).toBe("Language");
  });

  it("selects Polish plural categories", () => {
    expect(t("pl", "common.itemCount", { count: 1 })).toBe("1 pozycja");
    expect(t("pl", "common.itemCount", { count: 2 })).toBe("2 pozycje");
    expect(t("pl", "common.itemCount", { count: 5 })).toBe("5 pozycji");
    expect(t("pl", "common.itemCount", { count: 22 })).toBe("22 pozycje");
    expect(t("pl", "common.itemCount", { count: 25 })).toBe("25 pozycji");
    expect(t("pl", "common.itemCount", { count: 0 })).toBe("0 pozycji");
  });

  it("selects English plural categories", () => {
    expect(t("en", "common.itemCount", { count: 1 })).toBe("1 item");
    expect(t("en", "common.itemCount", { count: 2 })).toBe("2 items");
  });

  it("leaves unknown placeholders intact", () => {
    expect(t("en", "language.label", { other: "x" })).toBe("Language");
  });
});

describe("translateMessage", () => {
  it("translates known keys and passes other text through", () => {
    expect(translateMessage("en", "language.label")).toBe("Language");
    expect(translateMessage("pl", "Some raw message")).toBe("Some raw message");
    expect(translateMessage("pl", "language")).toBe("language");
  });

  it("detects translation keys", () => {
    expect(isTranslationKey("language.pl")).toBe(true);
    expect(isTranslationKey("language")).toBe(false);
    expect(isTranslationKey("nope.nope")).toBe(false);
  });
});

describe("isLocale", () => {
  it("accepts only supported locales", () => {
    expect(isLocale("pl")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale("")).toBe(false);
  });
});
