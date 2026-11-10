import { describe, expect, it } from "vitest";
import { formatCalendarDate, sortImportantDates } from "./important-dates";
import type { ImportantDate } from "@/types";

describe("calendar-date display", () => {
  it("keeps the original day in a timezone west of UTC", () => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      expect(formatCalendarDate("2000-02-29", "en")).toBe("February 29, 2000");
      expect(formatCalendarDate("2026-01-31", "pl")).toBe("31 stycznia 2026");
      expect(formatCalendarDate("0001-01-01", "en")).toBe("January 1, 1");
    } finally {
      if (previousTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimezone;
    }
  });

  it("reconciles by original date and ID without mutating saved state", () => {
    function row(id: string, date: string): ImportantDate {
      return {
        id,
        date,
        profile_id: "owner",
        heading: "Occasion",
        description: null,
        repeat_frequency: "yearly",
        created_at: "",
        updated_at: "",
      };
    }
    const entries = [row("b", "2026-01-31"), row("c", "2000-02-29"), row("a", "2026-01-31")];
    expect(sortImportantDates(entries).map((entry) => entry.id)).toEqual(["c", "a", "b"]);
    expect(entries.map((entry) => entry.id)).toEqual(["b", "c", "a"]);
  });
});
