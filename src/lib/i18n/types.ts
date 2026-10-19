import type { pl } from "./pl";

export interface PluralForms {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

type Widen<T> = T extends string ? string : T extends { other: string } ? PluralForms : { [K in keyof T]: Widen<T[K]> };

export type Dictionary = Widen<typeof pl>;

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string | { other: string } ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type TranslationKey = Leaves<typeof pl>;

export type TranslationParams = Record<string, string | number>;
