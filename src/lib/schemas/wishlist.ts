import { z } from "zod";

export const listCreateSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title must be 200 characters or fewer"),
});

export type ListCreateInput = z.infer<typeof listCreateSchema>;

export const itemCreateSchema = z.object({
  listId: z.uuid(),
  title: z.string().trim().min(1, "Title is required").max(500, "Title must be 500 characters or fewer"),
  priceCents: z.number().int().nonnegative().optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO code (e.g. USD)")
    .optional(),
  link: z.url("Must be a valid URL").max(2000).optional(),
});

export type ItemCreateInput = z.infer<typeof itemCreateSchema>;
