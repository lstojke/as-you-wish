import { z } from "zod";

export const listShareTokenSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const sharedListSchema = z.strictObject({
  list_id: z.uuid(),
  title: z.string(),
  items: z.array(
    z.strictObject({
      title: z.string(),
      notes: z.string().nullable(),
      price_cents: z.number().int().nonnegative().nullable(),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .nullable(),
      link: z.string().nullable(),
    }),
  ),
});

export const sharedStoreLinkSchema = z.url().refine((url) => /^https?:\/\//i.test(url), "Must be an http(s) URL");
