// Canonical dictionary: its shape defines every translation key. Add new keys
// here first; `en.ts` is typed against this shape, so a missing English key is
// a type error. Plural entries are objects keyed by Intl.PluralRules category.
export const pl = {
  common: {
    appName: "AsYouWish",
    itemCount: { one: "{count} pozycja", few: "{count} pozycje", many: "{count} pozycji", other: "{count} pozycji" },
  },
  language: {
    label: "Język",
    pl: "Polski",
    en: "English",
  },
} as const;
