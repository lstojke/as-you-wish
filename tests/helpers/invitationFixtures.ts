import { adminClient, createMember, signIn, unconfirmUserEmail, type Client } from "./supabaseTestClients";

export interface Member {
  id: string;
  email: string;
  client: Client;
}

export interface PendingInvitation {
  invitationId: string;
  email: string;
}

export interface InvitationScenario {
  listId: string;
  itemId: string;
  owner: Member;
  /** Confirmed member with a pending (un-accepted) invitation to the list. */
  invitee: Member;
  inviteeInvitation: PendingInvitation;
  /** Unconfirmed member (email_confirm: false) with a pending invitation. */
  unconfirmedInvitee: Member;
  unconfirmedInvitation: PendingInvitation;
  /** Confirmed member with no invitation to this list. */
  outsider: Member;
  /** Service-role client for RLS-bypassing seeding and assertions. */
  admin: Client;
  cleanup: () => Promise<void>;
}

async function seedPendingInvitation(admin: Client, listId: string, email: string): Promise<PendingInvitation> {
  const { data, error } = await admin.from("invitations").insert({ list_id: listId, email }).select("id").single();
  if (error) throw error;
  return { invitationId: data.id, email };
}

/**
 * Seeds the membership graph the accept (#2) and IDOR (#3) specs need: an owner
 * with a list + item, a confirmed invitee holding a PENDING invitation, an
 * unconfirmed invitee holding a PENDING invitation, and an unrelated outsider —
 * all as signed-in member clients so RLS/RPC are genuinely exercised. Teardown
 * deletes the auth users, cascading away lists/items/invitations/reservations.
 */
export async function setupInvitationScenario(): Promise<InvitationScenario> {
  const admin = adminClient();

  const ownerUser = await createMember(admin, "owner");
  const inviteeUser = await createMember(admin, "invitee");
  // Created confirmed so a password session is obtainable, then un-confirmed at
  // the DB layer below — GoTrue won't sign in an unconfirmed user.
  const unconfirmedUser = await createMember(admin, "unconfirmed");
  const outsiderUser = await createMember(admin, "outsider");

  const { data: list, error: listErr } = await admin
    .from("lists")
    .insert({ owner_id: ownerUser.id, title: "Invitation fixture list" })
    .select("id")
    .single();
  if (listErr) throw listErr;

  const { data: item, error: itemErr } = await admin
    .from("items")
    .insert({ list_id: list.id, title: "Fixture gift" })
    .select("id")
    .single();
  if (itemErr) throw itemErr;

  const inviteeInvitation = await seedPendingInvitation(admin, list.id, inviteeUser.email);
  const unconfirmedInvitation = await seedPendingInvitation(admin, list.id, unconfirmedUser.email);

  const [ownerClient, inviteeClient, unconfirmedClient, outsiderClient] = await Promise.all([
    signIn(ownerUser.email),
    signIn(inviteeUser.email),
    signIn(unconfirmedUser.email),
    signIn(outsiderUser.email),
  ]);

  // Session is already minted; nulling email_confirmed_at now makes the RPC's
  // confirmation guard fire while the JWT stays valid.
  await unconfirmUserEmail(unconfirmedUser.id);

  return {
    listId: list.id,
    itemId: item.id,
    owner: { ...ownerUser, client: ownerClient },
    invitee: { ...inviteeUser, client: inviteeClient },
    inviteeInvitation,
    unconfirmedInvitee: { ...unconfirmedUser, client: unconfirmedClient },
    unconfirmedInvitation,
    outsider: { ...outsiderUser, client: outsiderClient },
    admin,
    cleanup: async () => {
      await Promise.allSettled([
        admin.auth.admin.deleteUser(ownerUser.id),
        admin.auth.admin.deleteUser(inviteeUser.id),
        admin.auth.admin.deleteUser(unconfirmedUser.id),
        admin.auth.admin.deleteUser(outsiderUser.id),
      ]);
    },
  };
}
