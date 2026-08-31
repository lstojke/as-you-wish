import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { InvitationCreateInput, InvitationRevokeInput, InvitationAcceptInput } from "@/lib/schemas/wishlist";

export type InvitationRow = Database["public"]["Tables"]["invitations"]["Row"];

type Client = SupabaseClient<Database>;

export type CreateInvitationResult = { ok: true; invitation: InvitationRow } | { ok: false; reason: "already_invited" };

// RLS invitations_insert gates to is_list_owner(list_id); no app-side owner check.
// unique (list_id, email) surfaces re-invites/existing members as a 23505 we map
// to a friendly outcome rather than a raw throw.
export async function createInvitation(client: Client, input: InvitationCreateInput): Promise<CreateInvitationResult> {
  const { data, error } = await client
    .from("invitations")
    .insert({ list_id: input.listId, email: input.email })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, reason: "already_invited" };
    throw error;
  }
  return { ok: true, invitation: data };
}

// Owner visibility comes from invitations_select RLS (is_list_owner).
export async function listInvitations(client: Client, listId: string): Promise<InvitationRow[]> {
  const { data, error } = await client
    .from("invitations")
    .select("*")
    .eq("list_id", listId)
    .order("invited_at", { ascending: false });
  if (error) throw error;
  return data;
}

// RLS invitations_delete gates to is_list_owner; used to revoke a pending invite.
export async function deleteInvitation(client: Client, input: InvitationRevokeInput): Promise<void> {
  const { error } = await client.from("invitations").delete().eq("id", input.invitationId);
  if (error) throw error;
}

export type AcceptInvitationReason = "mismatch" | "not_found" | "not_confirmed" | "unauthenticated" | "unknown";

export type AcceptInvitationResult = { ok: true; listId: string } | { ok: false; reason: AcceptInvitationReason };

function mapAcceptError(error: PostgrestError): AcceptInvitationReason {
  switch (error.code) {
    case "P0001":
      return "not_confirmed";
    case "P0002":
      return "not_found";
    case "P0003":
      return "mismatch";
    case "28000":
      return "unauthenticated";
    default:
      return "unknown";
  }
}

// Acceptance runs through the accept_invitation RPC (SECURITY DEFINER) so it
// does not depend on the often-absent email_verified JWT claim — see the
// migration and lessons.md. Returns the list_id for redirect on success.
export async function acceptInvitation(client: Client, input: InvitationAcceptInput): Promise<AcceptInvitationResult> {
  const { data, error } = await client.rpc("accept_invitation", { invite_id: input.invitationId });
  if (error) {
    return { ok: false, reason: mapAcceptError(error) };
  }
  return { ok: true, listId: data };
}
