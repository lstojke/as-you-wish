import { z } from "zod";

export const listCreateSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title must be 200 characters or fewer"),
});

export type ListCreateInput = z.infer<typeof listCreateSchema>;

export const listRenameSchema = z.object({
  listId: z.uuid(),
  title: z.string().trim().min(1, "Title is required").max(200, "Title must be 200 characters or fewer"),
});

export type ListRenameInput = z.infer<typeof listRenameSchema>;

export const listDeleteSchema = z.object({
  listId: z.uuid(),
});

export type ListDeleteInput = z.infer<typeof listDeleteSchema>;

export const itemCreateSchema = z
  .object({
    listId: z.uuid(),
    title: z.string().trim().min(1, "Title is required").max(500, "Title must be 500 characters or fewer"),
    priceCents: z.number().int().nonnegative().optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO code (e.g. USD)")
      .optional(),
    link: z
      .url("Must be a valid URL")
      .max(2000)
      .refine((u) => /^https?:\/\//i.test(u), "Must be an http(s) URL")
      .optional(),
  })
  .refine((v) => v.priceCents !== undefined || v.currency === undefined, {
    message: "Currency requires a price",
    path: ["currency"],
  });

export type ItemCreateInput = z.infer<typeof itemCreateSchema>;

export const itemUpdateSchema = z
  .object({
    itemId: z.uuid(),
    title: z.string().trim().min(1, "Title is required").max(500, "Title must be 500 characters or fewer"),
    priceCents: z.number().int().nonnegative().optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO code (e.g. USD)")
      .optional(),
    link: z
      .url("Must be a valid URL")
      .max(2000)
      .refine((u) => /^https?:\/\//i.test(u), "Must be an http(s) URL")
      .optional(),
  })
  .refine((v) => v.priceCents !== undefined || v.currency === undefined, {
    message: "Currency requires a price",
    path: ["currency"],
  });

export type ItemUpdateInput = z.infer<typeof itemUpdateSchema>;

export const itemDeleteSchema = z.object({
  itemId: z.uuid(),
});

export type ItemDeleteInput = z.infer<typeof itemDeleteSchema>;

// Shared client-form schema: priceInput is a user-typed decimal string that
// the action handler maps to priceCents (integer cents) before calling either
// items.create or items.update. AddItemForm and EditItemForm both consume this.
export const itemFormSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(500, "Title must be 500 characters or fewer"),
  priceInput: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) >= 0),
      "Enter a non-negative number (max 2 decimals)",
    ),
  link: z
    .string()
    .trim()
    .max(2000, "Link must be 2000 characters or fewer")
    .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Must be an http(s) URL"),
});

export type ItemFormValues = z.infer<typeof itemFormSchema>;

function parsePriceCents(priceInput: string): number | undefined {
  if (priceInput === "") return undefined;
  return Math.round(Number(priceInput) * 100);
}

function normalizeLink(link: string): string | undefined {
  return link === "" ? undefined : link;
}

export function mapItemFormToCreate(listId: string, values: ItemFormValues): ItemCreateInput {
  return {
    listId,
    title: values.title,
    priceCents: parsePriceCents(values.priceInput),
    link: normalizeLink(values.link),
  };
}

export function mapItemFormToUpdate(itemId: string, values: ItemFormValues): ItemUpdateInput {
  return {
    itemId,
    title: values.title,
    priceCents: parsePriceCents(values.priceInput),
    link: normalizeLink(values.link),
  };
}
