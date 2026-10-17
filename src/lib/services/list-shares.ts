import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { SharedList } from "@/types";
import { listShareTokenSchema, sharedListSchema } from "@/lib/schemas/list-shares";

type Client = SupabaseClient<Database>;

export async function readListShare(client: Client, token: string): Promise<SharedList | null> {
  if (!listShareTokenSchema.safeParse(token).success) return null;

  const { data, error } = await client.rpc("read_list_share", { p_token: token });
  if (error) throw error;
  if (data === null) return null;
  return sharedListSchema.parse(data);
}

export async function canAccessSharedList(client: Client, listId: string): Promise<boolean> {
  // lists_select RLS is authoritative; an invitations join can hide valid membership.
  const { data, error } = await client.from("lists").select("id").eq("id", listId).maybeSingle();
  if (error) throw error;
  return data !== null;
}
