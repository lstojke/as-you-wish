import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { ItemCreateInput } from "@/lib/schemas/wishlist";

export type ItemRow = Database["public"]["Tables"]["items"]["Row"];

type Client = SupabaseClient<Database>;

const DEFAULT_CURRENCY = "USD";

export async function listItems(client: Client, listId: string): Promise<ItemRow[]> {
  const { data, error } = await client
    .from("items")
    .select("*")
    .eq("list_id", listId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function createItem(client: Client, input: ItemCreateInput): Promise<ItemRow> {
  const currency = input.priceCents !== undefined ? (input.currency ?? DEFAULT_CURRENCY) : (input.currency ?? null);

  const { data, error } = await client
    .from("items")
    .insert({
      list_id: input.listId,
      title: input.title,
      price_cents: input.priceCents ?? null,
      currency,
      link: input.link ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
