import { describe, expect, it } from "vitest";
import {
  importantDateCreateSchema,
  importantDateUpdateSchema,
  importantDateDeleteSchema,
  REPEAT_FREQUENCIES,
} from "./important-dates";

const input = { date: "2000-02-29", heading: "Birthday" };
const importantDateId = "4a3a3d2e-b196-4d64-9dc1-119f8213034f";

describe("important dates", () => {
  it("defaults to yearly and normalizes heading and optional description", () => {
    expect(importantDateCreateSchema.parse({ ...input, heading: " Birthday ", description: " \t" })).toEqual({
      ...input,
      description: null,
      repeatFrequency: "yearly",
    });
    expect(importantDateCreateSchema.parse({ ...input, description: " Family " }).description).toBe("Family");
    expect(importantDateCreateSchema.parse({ ...input, description: null }).description).toBeNull();
  });

  it.each(REPEAT_FREQUENCIES)("accepts %s without shifting the original date", (repeatFrequency) => {
    expect(importantDateCreateSchema.parse({ ...input, repeatFrequency }).date).toBe(input.date);
    expect(importantDateUpdateSchema.parse({ ...input, importantDateId, repeatFrequency })).toEqual({
      ...input,
      importantDateId,
      description: null,
      repeatFrequency,
    });
  });

  it.each(["0001-01-01", "0099-12-31", "1900-02-28", "2000-02-29", "2024-02-29", "9999-12-31"])(
    "accepts valid full calendar date %s",
    (date) => {
      expect(importantDateCreateSchema.safeParse({ ...input, date }).success).toBe(true);
    },
  );

  it.each([
    "",
    "0000-01-01",
    "10000-01-01",
    "1900-02-29",
    "2100-02-29",
    "2026-02-29",
    "2026-02-30",
    "2026-04-31",
    "2026-00-01",
    "2026-13-01",
    "2026-01-00",
    "2026-1-01",
    "2026-01-01T00:00:00Z",
    " 2026-01-01 ",
    null,
    20260101,
  ])("rejects invalid calendar date %j", (date) => {
    const result = importantDateCreateSchema.safeParse({ ...input, date });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("validation.dateInvalid");
  });

  it("accepts boundary text lengths and rejects blank or oversized fields", () => {
    expect(
      importantDateCreateSchema.safeParse({
        ...input,
        heading: "a".repeat(100),
        description: "a".repeat(1000),
      }).success,
    ).toBe(true);
    for (const fields of [
      { heading: "" },
      { heading: " \t\n" },
      { heading: "a".repeat(101) },
      { description: "a".repeat(1001) },
      { description: 42 },
      { repeatFrequency: "daily" },
      { repeatFrequency: null },
    ]) {
      expect(importantDateCreateSchema.safeParse({ ...input, ...fields }).success).toBe(false);
    }
  });

  it("rejects client-supplied owner IDs and unknown fields on all mutations", () => {
    expect(importantDateCreateSchema.safeParse({ ...input, profileId: importantDateId }).success).toBe(false);
    expect(
      importantDateUpdateSchema.safeParse({ ...input, importantDateId, profile_id: importantDateId }).success,
    ).toBe(false);
    expect(importantDateDeleteSchema.safeParse({ importantDateId, profileId: importantDateId }).success).toBe(false);
  });

  it("requires a valid target UUID for updates and deletes", () => {
    expect(importantDateUpdateSchema.safeParse(input).success).toBe(false);
    expect(importantDateDeleteSchema.parse({ importantDateId })).toEqual({ importantDateId });
    for (const id of ["", "not-a-uuid", null, 42]) {
      expect(importantDateUpdateSchema.safeParse({ ...input, importantDateId: id }).success).toBe(false);
      expect(importantDateDeleteSchema.safeParse({ importantDateId: id }).success).toBe(false);
    }
  });
});
