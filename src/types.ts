import type { z } from "zod";
import type { listShareStateSchema, sharedListSchema } from "@/lib/schemas/list-shares";
import type { Database } from "@/db/database.types";
import type { profileDetailsSchema, profilePreferencesSchema } from "@/lib/schemas/profile";
import type {
  importantDateCreateSchema,
  importantDateUpdateSchema,
  importantDateDeleteSchema,
  repeatFrequencySchema,
} from "@/lib/schemas/important-dates";

export type SharedList = z.infer<typeof sharedListSchema>;
export type ListShareState = z.infer<typeof listShareStateSchema>;
export type ListShareView = { state: "not_created" | "disabled"; url: null } | { state: "active"; url: string };

export type ProfileDetailsInput = z.infer<typeof profileDetailsSchema>;
export type ProfilePreferencesInput = z.infer<typeof profilePreferencesSchema>;
export type ProfileSettingsData = ProfileDetailsInput & ProfilePreferencesInput;
export type ImportantDateCreateInput = z.infer<typeof importantDateCreateSchema>;
export type ImportantDateFormValues = z.input<typeof importantDateCreateSchema>;
export type ImportantDateUpdateInput = z.infer<typeof importantDateUpdateSchema>;
export type ImportantDateDeleteInput = z.infer<typeof importantDateDeleteSchema>;
export type RepeatFrequency = z.infer<typeof repeatFrequencySchema>;
export type ImportantDate = Database["public"]["Tables"]["profile_important_dates"]["Row"];
