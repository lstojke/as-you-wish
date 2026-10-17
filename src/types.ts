import type { z } from "zod";
import type { listShareStateSchema, sharedListSchema } from "@/lib/schemas/list-shares";

export type SharedList = z.infer<typeof sharedListSchema>;
export type ListShareState = z.infer<typeof listShareStateSchema>;
export type ListShareView = { state: "not_created" | "disabled"; url: null } | { state: "active"; url: string };
