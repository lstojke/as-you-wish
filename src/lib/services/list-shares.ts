import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { ListShareState, ListShareView, SharedList } from "@/types";
import { listShareStateSchema, listShareTokenSchema, sharedListSchema } from "@/lib/schemas/list-shares";

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

export async function getListShareState(client: Client, listId: string): Promise<ListShareState> {
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError) throw authError;

  const { data: list, error: listError } = await client
    .from("lists")
    .select("id")
    .eq("id", listId)
    .eq("owner_id", auth.user.id)
    .maybeSingle();
  if (listError) throw listError;
  if (!list) throw new Error("List not found or not owned");

  const { data, error } = await client
    .from("list_share_links")
    .select("token, disabled_at")
    .eq("list_id", listId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { state: "not_created", token: null };
  return listShareStateSchema.parse(
    data.disabled_at === null ? { state: "active", token: data.token } : { state: "disabled", token: null },
  );
}

export async function manageListShare(
  client: Client,
  listId: string,
  operation: "create" | "disable" | "replace",
): Promise<ListShareState> {
  const functions = {
    create: "get_or_create_list_share",
    disable: "disable_list_share",
    replace: "replace_list_share",
  } as const;
  const { data, error } = await client.rpc(functions[operation], { p_list_id: listId });
  if (error) throw error;
  return listShareStateSchema.parse(data);
}

export function listShareView(state: ListShareState, requestUrl: string): ListShareView {
  if (state.state !== "active") return { state: state.state, url: null };
  return { state: "active", url: new URL(`/share/${state.token}`, new URL(requestUrl).origin).href };
}
