import { describe, expect, it } from "vitest";
import { formatPrice } from "./format-price";

// Intl uses narrow no-break spaces in pl-PL; normalize for readable assertions.
const norm = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");

describe("formatPrice", () => {
  it("formats Polish style", () => {
    expect(norm(formatPrice(123450, "PLN", "pl"))).toBe("1234,50 zł");
    expect(norm(formatPrice(12345000, "PLN", "pl"))).toBe("123 450,00 zł");
  });

  it("formats English style", () => {
    expect(norm(formatPrice(123450, "PLN", "en"))).toBe("PLN 1,234.50");
    expect(formatPrice(123450, "USD", "en")).toBe("$1,234.50");
  });

  it("falls back for invalid currency codes", () => {
    expect(formatPrice(1000, "??", "pl")).toBe("10.00 ??");
  });
});
