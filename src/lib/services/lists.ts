import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { ListCreateInput, ListRenameInput, ListDeleteInput } from "@/lib/schemas/wishlist";
import { pageAll } from "@/lib/services/pagination";
import { z } from "zod";

export type ListRow = Database["public"]["Tables"]["lists"]["Row"];

type Client = SupabaseClient<Database>;

const listRoleSchema = z.enum(["owner", "collaborator", "viewer"]);
export type ListRole = z.infer<typeof listRoleSchema>;

export async function getListRole(client: Client, listId: string): Promise<ListRole | null> {
  const { data, error } = await client.rpc("get_list_role", { p_list_id: listId });
  if (error) throw error;
  return listRoleSchema.nullable().parse(data);
}

export async function renameCollaborativeList(client: Client, input: ListRenameInput): Promise<ListRow> {
  const { data, error } = await client.rpc("rename_collaborative_list", {
    p_list_id: input.listId,
    p_title: input.title,
  });
  if (error) throw error;
  if (data.length !== 1) throw new Error("List not found or not editable");
  return data[0];
}

export async function listOwnedAndShared(client: Client): Promise<{ owned: ListRow[]; shared: ListRow[] }> {
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError) throw authError;
  if (!user) {
    return { owned: [], shared: [] };
  }

  const [owned, shared] = await Promise.all([
    pageAll<ListRow>((from, to) =>
      client
        .from("lists")
        .select("*")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    ),
    // lists_select RLS and is_list_invitee() determine shared visibility; do not join invitations.
    pageAll<ListRow>((from, to) =>
      client
        .from("lists")
        .select("*")
        .neq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    ),
  ]);

  return { owned, shared };
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

// Cascade is enforced by items.list_id FK (on delete cascade) - see initial wishlist schema.
export async function deleteList(client: Client, input: ListDeleteInput): Promise<void> {
  const { data, error } = await client.from("lists").delete().eq("id", input.listId).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("List not found or not owned");
}
