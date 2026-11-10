import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import { SYSTEM_DEFAULT_CURRENCY, type ProfileUpdateInput } from "@/lib/currency";
import { isLocale, type Locale } from "@/lib/i18n/config";
import type { ProfileDetailsInput, ProfilePreferencesInput } from "@/types";

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

type Client = SupabaseClient<Database>;

function requireProfileRow<T extends object>(data: T | null): T {
  if (!data) throw new Error("Profile not found");
  return data;
}

async function requireUserId(client: Client): Promise<string> {
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export async function getOwnProfile(client: Client): Promise<ProfileRow> {
  const userId = await requireUserId(client);
  const { data, error } = await client.from("profiles").select("*").eq("id", userId).single();
  if (error) throw error;
  return requireProfileRow(data);
}

export async function getOwnProfileNames(client: Client): Promise<Pick<ProfileRow, "first_name" | "last_name">> {
  const userId = await requireUserId(client);
  const { data, error } = await client.from("profiles").select("first_name, last_name").eq("id", userId).single();
  if (error) throw error;
  return requireProfileRow(data);
}

async function updateOwnProfile(client: Client, values: Database["public"]["Tables"]["profiles"]["Update"]) {
  const userId = await requireUserId(client);
  const { data, error } = await client.from("profiles").update(values).eq("id", userId).select("*").single();
  if (error) throw error;
  return requireProfileRow(data);
}

export function updateProfileDetails(client: Client, input: ProfileDetailsInput): Promise<ProfileRow> {
  return updateOwnProfile(client, { first_name: input.firstName, last_name: input.lastName });
}

export function updateProfilePreferences(client: Client, input: ProfilePreferencesInput): Promise<ProfileRow> {
  return updateOwnProfile(client, { default_currency: input.defaultCurrency, language: input.language });
}

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

export async function getLanguage(client: Client, userId: string): Promise<Locale | null> {
  const { data, error } = await client.from("profiles").select("language").eq("id", userId).maybeSingle();
  if (error) throw error;
  return isLocale(data?.language) ? data.language : null;
}

export async function updateLanguage(client: Client, userId: string, locale: Locale): Promise<void> {
  const { error } = await client.from("profiles").update({ language: locale }).eq("id", userId);
  if (error) throw error;
}
