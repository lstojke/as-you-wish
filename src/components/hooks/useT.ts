import { useContext } from "react";
import { I18nContext } from "@/components/I18nProvider";
import { t as translate, translateMessage, type TranslationKey, type TranslationParams } from "@/lib/i18n";

export function useT() {
  const locale = useContext(I18nContext);
  if (!locale) throw new Error("useT must be used inside <I18nProvider>");
  return {
    locale,
    t: (key: TranslationKey, params?: TranslationParams) => translate(locale, key, params),
    // For messages that may be i18n keys (zod schemas) or already-translated text (action errors).
    tm: (message: string) => translateMessage(locale, message),
  };
}
