import { z } from "zod";

export const REPEAT_FREQUENCIES = ["none", "weekly", "monthly", "yearly"] as const;
export const DEFAULT_REPEAT_FREQUENCY = "yearly";

export const repeatFrequencySchema = z.enum(REPEAT_FREQUENCIES, { error: "validation.repeatFrequencyInvalid" });

const calendarDateSchema = z
  .string({ error: "validation.dateInvalid" })
  .regex(/^(?!0000)\d{4}-\d{2}-\d{2}$/, "validation.dateInvalid")
  .refine((value) => z.iso.date().safeParse(value).success, "validation.dateInvalid");

export const importantDateCreateSchema = z.strictObject(
  {
    date: calendarDateSchema,
    heading: z
      .string({ error: "validation.headingRequired" })
      .trim()
      .min(1, "validation.headingRequired")
      .max(100, "validation.headingMax100"),
    description: z
      .string({ error: "validation.descriptionInvalid" })
      .trim()
      .max(1000, "validation.descriptionMax1000")
      .nullish()
      .transform((value) => (value === "" ? null : (value ?? null))),
    repeatFrequency: repeatFrequencySchema.default(DEFAULT_REPEAT_FREQUENCY),
  },
  { error: "validation.inputInvalid" },
);

export const importantDateUpdateSchema = importantDateCreateSchema.extend({
  importantDateId: z.uuid({ error: "validation.importantDateIdInvalid" }),
});

export const importantDateDeleteSchema = z.strictObject(
  {
    importantDateId: z.uuid({ error: "validation.importantDateIdInvalid" }),
  },
  { error: "validation.inputInvalid" },
);
