import { z } from "zod";
import { currencySchema } from "@/lib/currency";
import { localeSchema } from "@/lib/i18n/config";

const optionalNameSchema = z
  .string({ error: "validation.nameInvalid" })
  .trim()
  .max(100, "validation.nameMax100")
  .nullish()
  .transform((value) => (value === "" ? null : (value ?? null)));

export const profileDetailsSchema = z.strictObject(
  {
    firstName: optionalNameSchema,
    lastName: optionalNameSchema,
  },
  { error: "validation.inputInvalid" },
);

export const profilePreferencesSchema = z.strictObject(
  {
    defaultCurrency: z.enum(currencySchema.options, { error: "validation.currencySelect" }),
    language: z.enum(localeSchema.options, { error: "validation.languageSelect" }),
  },
  { error: "validation.inputInvalid" },
);
