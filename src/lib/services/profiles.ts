import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import { SYSTEM_DEFAULT_CURRENCY, type ProfileUpdateInput } from "@/lib/currency";

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

type Client = SupabaseClient<Database>;

export async function getDefaultCurrency(client: Client): Promise<string> {
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError) throw authError;
  if (!user) return SYSTEM_DEFAULT_CURRENCY;

  const { data, error } = await client.from("profiles").select("default_currency").eq("id", user.id).maybeSingle();
  if (error) throw error;
  // The handle_new_user() trigger should guarantee a row; fall back defensively.
  return data?.default_currency ?? SYSTEM_DEFAULT_CURRENCY;
}

export async function updateDefaultCurrency(client: Client, input: ProfileUpdateInput): Promise<ProfileRow> {
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await client
    .from("profiles")
    .update({ default_currency: input.defaultCurrency })
    .eq("id", user.id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
