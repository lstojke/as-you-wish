import { z } from "zod";

export const listShareTokenSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const listShareManageSchema = z.object({ listId: z.uuid() });

export const listShareStateSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("not_created"), token: z.null() }),
  z.strictObject({ state: z.literal("disabled"), token: z.null() }),
  z.strictObject({ state: z.literal("active"), token: listShareTokenSchema }),
]);

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

export const sharedStoreLinkSchema = z.url().refine((url) => /^https?:\/\//i.test(url), "validation.urlHttp");
