import { z } from "zod";

// Messages are i18n keys (see src/lib/i18n/pl.ts): these schemas run on both
// client and server without knowing the locale; renderers translate them.

export const listCreateSchema = z.object({
  title: z.string().trim().min(1, "validation.titleRequired").max(200, "validation.titleMax200"),
});

export type ListCreateInput = z.infer<typeof listCreateSchema>;

export const listRenameSchema = z.object({
  listId: z.uuid(),
  title: z.string().trim().min(1, "validation.titleRequired").max(200, "validation.titleMax200"),
});

export type ListRenameInput = z.infer<typeof listRenameSchema>;

export const listDeleteSchema = z.object({
  listId: z.uuid(),
});

export type ListDeleteInput = z.infer<typeof listDeleteSchema>;

export const itemCreateSchema = z
  .object({
    listId: z.uuid(),
    title: z.string().trim().min(1, "validation.titleRequired").max(500, "validation.titleMax500"),
    priceCents: z.number().int().nonnegative().optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, "validation.currencyIso")
      .optional(),
    link: z
      .url("validation.urlInvalid")
      .max(2000)
      .refine((u) => /^https?:\/\//i.test(u), "validation.urlHttp")
      .optional(),
  })
  .refine((v) => v.priceCents !== undefined || v.currency === undefined, {
    message: "validation.currencyRequiresPrice",
    path: ["currency"],
  });

export type ItemCreateInput = z.infer<typeof itemCreateSchema>;

export const itemUpdateSchema = z
  .object({
    itemId: z.uuid(),
    title: z.string().trim().min(1, "validation.titleRequired").max(500, "validation.titleMax500"),
    priceCents: z.number().int().nonnegative().optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, "validation.currencyIso")
      .optional(),
    link: z
      .url("validation.urlInvalid")
      .max(2000)
      .refine((u) => /^https?:\/\//i.test(u), "validation.urlHttp")
      .optional(),
  })
  .refine((v) => v.priceCents !== undefined || v.currency === undefined, {
    message: "validation.currencyRequiresPrice",
    path: ["currency"],
  });

export type ItemUpdateInput = z.infer<typeof itemUpdateSchema>;

export const itemDeleteSchema = z.object({
  itemId: z.uuid(),
});

export type ItemDeleteInput = z.infer<typeof itemDeleteSchema>;

export const reservationCreateSchema = z.object({
  itemId: z.uuid(),
});

export type ReservationCreateInput = z.infer<typeof reservationCreateSchema>;

export const reservationReleaseSchema = z.object({
  itemId: z.uuid(),
});

export type ReservationReleaseInput = z.infer<typeof reservationReleaseSchema>;

// Self-invite is enforced in the action handler (the schema doesn't know the
// current user's email). email is normalized to lowercase/trimmed to match the
// DB check constraint (email = lower(trim(email))) and unique (list_id, email).
export const invitationCreateSchema = z.object({
  listId: z.uuid(),
  email: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
    z.email("validation.emailInvalid").max(320),
  ),
});

export type InvitationCreateInput = z.infer<typeof invitationCreateSchema>;

export const invitationRevokeSchema = z.object({
  invitationId: z.uuid(),
});

export type InvitationRevokeInput = z.infer<typeof invitationRevokeSchema>;

export const invitationAcceptSchema = z.object({
  invitationId: z.uuid(),
});

export type InvitationAcceptInput = z.infer<typeof invitationAcceptSchema>;

// Shared client-form schema: priceInput is a user-typed decimal string that
// the action handler maps to priceCents (integer cents) before calling either
// items.create or items.update. AddItemForm and EditItemForm both consume this.
export const itemFormSchema = z.object({
  title: z.string().trim().min(1, "validation.titleRequired").max(500, "validation.titleMax500"),
  priceInput: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) >= 0), "validation.priceFormat"),
  link: z
    .string()
    .trim()
    .max(2000, "validation.linkMax2000")
    .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "validation.urlHttp"),
  currency: z.string().regex(/^[A-Z]{3}$/, "validation.currencySelect"),
});

export type ItemFormValues = z.infer<typeof itemFormSchema>;

function parsePriceCents(priceInput: string): number | undefined {
  if (priceInput === "") return undefined;
  return Math.round(Number(priceInput) * 100);
}

function normalizeLink(link: string): string | undefined {
  return link === "" ? undefined : link;
}

// Currency is only meaningful alongside a price; the server rejects one without the other.
export function mapItemFormToCreate(listId: string, values: ItemFormValues): ItemCreateInput {
  const priceCents = parsePriceCents(values.priceInput);
  return {
    listId,
    title: values.title,
    priceCents,
    currency: priceCents !== undefined ? values.currency : undefined,
    link: normalizeLink(values.link),
  };
}

export function mapItemFormToUpdate(itemId: string, values: ItemFormValues): ItemUpdateInput {
  const priceCents = parsePriceCents(values.priceInput);
  return {
    itemId,
    title: values.title,
    priceCents,
    currency: priceCents !== undefined ? values.currency : undefined,
    link: normalizeLink(values.link),
  };
}
