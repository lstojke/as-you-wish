import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";

type Client = SupabaseClient<Database>;

const FIXTURE_PASSWORD = "concurrency-fixture-pw-123!";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Integration env ${name} is not set (see tests/setup/integration.ts).`);
  return value;
}

function anonClient(): Client {
  return createClient<Database>(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function adminClient(): Client {
  // Secret (service_role) key bypasses RLS — used ONLY to seed and inspect fixtures.
  return createClient<Database>(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

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

async function createMember(admin: Client, role: string): Promise<{ id: string; email: string }> {
  const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: FIXTURE_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  return { id: data.user.id, email };
}

async function signIn(email: string): Promise<Client> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password: FIXTURE_PASSWORD });
  if (error) throw error;
  return client;
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
