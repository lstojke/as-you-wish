import { createContext, type ReactNode } from "react";
import type { Locale } from "@/lib/i18n/config";

export const I18nContext = createContext<Locale | null>(null);

// Each Astro island is its own React root, so every island root must wrap its
// tree in this provider with the `locale` prop passed from Astro.locals.locale.
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <I18nContext.Provider value={locale}>{children}</I18nContext.Provider>;
}
