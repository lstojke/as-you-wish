import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { ItemCreateInput, ItemUpdateInput, ItemDeleteInput } from "@/lib/schemas/wishlist";

export type ItemRow = Database["public"]["Tables"]["items"]["Row"];

type Client = SupabaseClient<Database>;

const DEFAULT_CURRENCY = "USD";

function resolveCurrency(priceCents: number | undefined, currency: string | undefined): string | null {
  return priceCents !== undefined ? (currency ?? DEFAULT_CURRENCY) : (currency ?? null);
}

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
  const { data, error } = await client
    .from("items")
    .insert({
      list_id: input.listId,
      title: input.title,
      price_cents: input.priceCents ?? null,
      currency: resolveCurrency(input.priceCents, input.currency),
      link: input.link ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

// RLS gates update/delete to is_list_owner(list_id); no app-side ownership check needed.
export async function updateItem(client: Client, input: ItemUpdateInput): Promise<ItemRow> {
  // Preserve the item's stored currency on edit; only fall back to the default
  // when a price is newly added to an item that had none. Revisit when a
  // per-user default currency (profile setting) ships.
  const { data: existing, error: readError } = await client
    .from("items")
    .select("currency")
    .eq("id", input.itemId)
    .single();
  if (readError) throw readError;

  const currency = input.priceCents !== undefined ? (input.currency ?? existing.currency ?? DEFAULT_CURRENCY) : null;

  const { data, error } = await client
    .from("items")
    .update({
      title: input.title,
      price_cents: input.priceCents ?? null,
      currency,
      link: input.link ?? null,
    })
    .eq("id", input.itemId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteItem(client: Client, input: ItemDeleteInput): Promise<void> {
  const { error } = await client.from("items").delete().eq("id", input.itemId);
  if (error) throw error;
}
