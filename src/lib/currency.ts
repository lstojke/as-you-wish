import { z } from "zod";

export const SUPPORTED_CURRENCIES = ["PLN", "EUR", "USD", "GBP"] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const SYSTEM_DEFAULT_CURRENCY: SupportedCurrency = "PLN";

export const currencySchema = z.enum(SUPPORTED_CURRENCIES);

export const profileUpdateSchema = z.object({
  defaultCurrency: currencySchema,
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
