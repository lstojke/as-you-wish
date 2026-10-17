import { en } from "./en";
import { pl } from "./pl";
import { intlLocale, type Locale } from "./config";
import type { Dictionary, PluralForms, TranslationKey, TranslationParams } from "./types";

export * from "./config";
export type { Dictionary, TranslationKey, TranslationParams } from "./types";

const DICTIONARIES: Record<Locale, Dictionary> = { pl, en };

type Entry = string | PluralForms;

function lookup(locale: Locale, key: string): Entry | undefined {
  let node: unknown = DICTIONARIES[locale];
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node === "string") return node;
  if (node !== null && typeof node === "object" && typeof (node as PluralForms).other === "string") {
    return node as PluralForms;
  }
  return undefined;
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

const pluralRulesCache = new Map<Locale, Intl.PluralRules>();

function pluralRules(locale: Locale): Intl.PluralRules {
  let rules = pluralRulesCache.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(intlLocale(locale));
    pluralRulesCache.set(locale, rules);
  }
  return rules;
}

function resolve(locale: Locale, entry: Entry, params?: TranslationParams): string {
  if (typeof entry === "string") return interpolate(entry, params);
  const count = typeof params?.count === "number" ? params.count : 0;
  const category = pluralRules(locale).select(count);
  return interpolate(entry[category] ?? entry.other, params);
}

export function isTranslationKey(value: string): value is TranslationKey {
  return lookup("pl", value) !== undefined;
}

export function t(locale: Locale, key: TranslationKey, params?: TranslationParams): string {
  const entry = lookup(locale, key) ?? lookup("pl", key);
  return entry === undefined ? key : resolve(locale, entry, params);
}

// For messages that may be translation keys (zod/action messages) or plain
// text from elsewhere: translate known keys, pass anything else through.
export function translateMessage(locale: Locale, message: string, params?: TranslationParams): string {
  return isTranslationKey(message) ? t(locale, message, params) : message;
}
