import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import { pageAll } from "@/lib/services/pagination";
import type {
  ListGroupCreateInput,
  ListGroupDeleteInput,
  ListGroupMembershipInput,
  ListGroupRenameInput,
} from "@/lib/schemas/list-groups";

type Client = SupabaseClient<Database>;

export type ListGroup = Database["public"]["Tables"]["list_groups"]["Row"];
export interface ListGroupMembership {
  group_id: string;
  list_id: string;
}

// Raised when a group or list is not the caller's (or does not exist). Both
// cases share one error so callers cannot probe other users' IDs.
export class ListGroupNotFoundError extends Error {
  constructor() {
    super("List group or list not found");
    this.name = "ListGroupNotFoundError";
  }
}

// RLS denial (42501), FK miss on (group_id, user_id)/list_id (23503) and the
// remove RPC's not-found (P0002) all mean "not yours / not accessible".
const NOT_FOUND_CODES = new Set(["42501", "23503", "P0002"]);

function isNotFound(error: { code?: string }): boolean {
  return NOT_FOUND_CODES.has(error.code ?? "");
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

export async function listGroups(client: Client): Promise<ListGroup[]> {
  const userId = await requireUserId(client);
  return pageAll<ListGroup>((from, to) =>
    client.from("list_groups").select("*").eq("user_id", userId).order("created_at").order("id").range(from, to),
  );
}

// RLS (list_group_members_select) hides associations whose list the user can
// no longer access, so revoked lists never surface here.
export async function listGroupMemberships(client: Client): Promise<ListGroupMembership[]> {
  const userId = await requireUserId(client);
  return pageAll<ListGroupMembership>((from, to) =>
    client
      .from("list_group_members")
      .select("group_id, list_id")
      .eq("user_id", userId)
      .order("group_id")
      .order("list_id")
      .range(from, to),
  );
}

export async function createListGroup(client: Client, input: ListGroupCreateInput): Promise<ListGroup> {
  const userId = await requireUserId(client);
  const { data, error } = await client
    .from("list_groups")
    .insert({ user_id: userId, name: input.name })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function renameListGroup(client: Client, input: ListGroupRenameInput): Promise<ListGroup> {
  const userId = await requireUserId(client);
  const { data, error } = await client
    .from("list_groups")
    .update({ name: input.name })
    .eq("id", input.groupId)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ListGroupNotFoundError();
  return data;
}

// Associations cascade with the group; lists and reservations are untouched.
export async function deleteListGroup(client: Client, input: ListGroupDeleteInput): Promise<void> {
  const userId = await requireUserId(client);
  const { data, error } = await client
    .from("list_groups")
    .delete()
    .eq("id", input.groupId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ListGroupNotFoundError();
}

export async function addListToGroup(client: Client, input: ListGroupMembershipInput): Promise<void> {
  const userId = await requireUserId(client);
  const { error } = await client
    .from("list_group_members")
    .insert({ group_id: input.groupId, list_id: input.listId, user_id: userId });
  if (!error) return;
  // Already associated (and still accessible, since RLS checks run first): idempotent.
  if (error.code === "23505") return;
  if (isNotFound(error)) throw new ListGroupNotFoundError();
  throw error;
}

// Uses a definer RPC so the owner can also drop stale associations to lists
// whose access was revoked (RLS hides those rows from a direct DELETE).
export async function removeListFromGroup(client: Client, input: ListGroupMembershipInput): Promise<void> {
  const { error } = await client.rpc("remove_list_from_group", {
    p_group_id: input.groupId,
    p_list_id: input.listId,
  });
  if (!error) return;
  if (isNotFound(error)) throw new ListGroupNotFoundError();
  throw error;
}
