import type { z } from "zod";
import type { sharedListSchema } from "@/lib/schemas/list-shares";

export type SharedList = z.infer<typeof sharedListSchema>;
