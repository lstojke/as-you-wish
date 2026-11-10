import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type {
  ImportantDate,
  ImportantDateCreateInput,
  ImportantDateUpdateInput,
  ImportantDateDeleteInput,
} from "@/types";

type Client = SupabaseClient<Database>;

async function requireUserId(client: Client): Promise<string> {
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

function requireDate(data: ImportantDate | null): ImportantDate {
  if (!data) throw new Error("Important date not found");
  return data;
}

function requireDates(data: ImportantDate[] | null): ImportantDate[] {
  if (!data) throw new Error("Important dates response missing");
  return data;
}

export async function listImportantDates(client: Client): Promise<ImportantDate[]> {
  const userId = await requireUserId(client);
  const entries: ImportantDate[] = [];
  const pageSize = 500;
  // Page below PostgREST's default row limit instead of silently truncating the collection.
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from("profile_important_dates")
      .select("*")
      .eq("profile_id", userId)
      .order("date")
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = requireDates(data);
    entries.push(...page);
    if (page.length < pageSize) return entries;
  }
}

function dateValues(input: ImportantDateCreateInput) {
  return {
    date: input.date,
    heading: input.heading,
    description: input.description,
    repeat_frequency: input.repeatFrequency,
  };
}

export async function createImportantDate(client: Client, input: ImportantDateCreateInput): Promise<ImportantDate> {
  const userId = await requireUserId(client);
  const { data, error } = await client
    .from("profile_important_dates")
    .insert({ ...dateValues(input), profile_id: userId })
    .select("*")
    .single();
  if (error) throw error;
  return requireDate(data);
}

export async function updateImportantDate(client: Client, input: ImportantDateUpdateInput): Promise<ImportantDate> {
  const userId = await requireUserId(client);
  const { data, error } = await client
    .from("profile_important_dates")
    .update(dateValues(input))
    .eq("id", input.importantDateId)
    .eq("profile_id", userId)
    .select("*")
    .single();
  if (error) throw error;
  return requireDate(data);
}

export async function deleteImportantDate(client: Client, input: ImportantDateDeleteInput): Promise<ImportantDate> {
  const userId = await requireUserId(client);
  const { data, error } = await client
    .from("profile_important_dates")
    .delete()
    .eq("id", input.importantDateId)
    .eq("profile_id", userId)
    .select("*")
    .single();
  if (error) throw error;
  return requireDate(data);
}
