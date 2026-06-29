import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { ListCreateInput, ListRenameInput, ListDeleteInput } from "@/lib/schemas/wishlist";

export type ListRow = Database["public"]["Tables"]["lists"]["Row"];

type Client = SupabaseClient<Database>;

export async function listOwnedAndShared(client: Client): Promise<{ owned: ListRow[]; shared: ListRow[] }> {
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError) throw authError;
  if (!user) {
    return { owned: [], shared: [] };
  }

  const ownedQuery = client.from("lists").select("*").eq("owner_id", user.id).order("created_at", { ascending: false });

  const sharedQuery = client
    .from("lists")
    .select("*")
    .neq("owner_id", user.id)
    .order("created_at", { ascending: false });

  const [ownedRes, sharedRes] = await Promise.all([ownedQuery, sharedQuery]);

  if (ownedRes.error) throw ownedRes.error;
  if (sharedRes.error) throw sharedRes.error;

  return { owned: ownedRes.data, shared: sharedRes.data };
}

export async function getListById(client: Client, listId: string): Promise<ListRow | null> {
  const { data, error } = await client.from("lists").select("*").eq("id", listId).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function createList(client: Client, input: ListCreateInput): Promise<ListRow> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await client
    .from("lists")
    .insert({ title: input.title, owner_id: user.id })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

// RLS gates update/delete to owner_id = auth.uid(); no app-side ownership check needed.
export async function updateList(client: Client, input: ListRenameInput): Promise<ListRow> {
  const { data, error } = await client
    .from("lists")
    .update({ title: input.title })
    .eq("id", input.listId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

// Cascade is enforced by items.list_id FK (on delete cascade) — see initial wishlist schema.
export async function deleteList(client: Client, input: ListDeleteInput): Promise<void> {
  const { error } = await client.from("lists").delete().eq("id", input.listId);
  if (error) throw error;
}
