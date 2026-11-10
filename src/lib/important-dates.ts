import { intlLocale, type Locale } from "@/lib/i18n/config";
import type { ImportantDate } from "@/types";

export function formatCalendarDate(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export function sortImportantDates(entries: ImportantDate[]): ImportantDate[] {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
