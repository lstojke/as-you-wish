import { z } from "zod";

export const LOCALES = ["pl", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "pl";

export const LOCALE_COOKIE = "lang";

export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const localeSchema = z.enum(LOCALES);

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

const INTL_LOCALES: Record<Locale, string> = { pl: "pl-PL", en: "en-US" };

export function intlLocale(locale: Locale): string {
  return INTL_LOCALES[locale];
}
