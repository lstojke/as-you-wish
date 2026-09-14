import { adminClient, createMember, signIn, type Client } from "./supabaseTestClients";

export interface ReservationMember {
  id: string;
  email: string;
  client: Client;
}

export interface ReservationScenario {
  itemId: string;
  listId: string;
  owner: ReservationMember;
  invitee: ReservationMember;
  /** Service-role client for RLS-bypassing assertions (e.g. counting rows). */
  admin: Client;
  cleanup: () => Promise<void>;
}

/**
 * Seeds the membership graph a reserve requires: an owner and an accepted
 * invitee (both email-confirmed) of a list that holds one item. Returns two
 * signed-in member clients plus a teardown that deletes the users — cascading
 * away the list, item, invitation, and any reservations.
 */
export async function setupReservationScenario(): Promise<ReservationScenario> {
  const admin = adminClient();

  const ownerUser = await createMember(admin, "owner");
  const inviteeUser = await createMember(admin, "invitee");

  const { data: list, error: listErr } = await admin
    .from("lists")
    .insert({ owner_id: ownerUser.id, title: "Concurrency fixture list" })
    .select("id")
    .single();
  if (listErr) throw listErr;

  const { data: item, error: itemErr } = await admin
    .from("items")
    .insert({ list_id: list.id, title: "Contested gift" })
    .select("id")
    .single();
  if (itemErr) throw itemErr;

  // Accepted invitation makes the invitee a list member (satisfies is_list_invitee).
  const { error: invErr } = await admin.from("invitations").insert({
    list_id: list.id,
    email: inviteeUser.email,
    accepted_at: new Date().toISOString(),
    accepted_by_user_id: inviteeUser.id,
  });
  if (invErr) throw invErr;

  const [ownerClient, inviteeClient] = await Promise.all([signIn(ownerUser.email), signIn(inviteeUser.email)]);

  return {
    itemId: item.id,
    listId: list.id,
    owner: { ...ownerUser, client: ownerClient },
    invitee: { ...inviteeUser, client: inviteeClient },
    admin,
    cleanup: async () => {
      await Promise.allSettled([
        admin.auth.admin.deleteUser(ownerUser.id),
        admin.auth.admin.deleteUser(inviteeUser.id),
      ]);
    },
  };
}
