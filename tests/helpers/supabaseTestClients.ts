import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";
import type { Database } from "@/db/database.types";

export type Client = SupabaseClient<Database>;

export const FIXTURE_PASSWORD = "concurrency-fixture-pw-123!";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Integration env ${name} is not set (see tests/setup/integration.ts).`);
  return value;
}

export function anonClient(): Client {
  return createClient<Database>(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function adminClient(): Client {
  // Secret (service_role) key bypasses RLS — used ONLY to seed and inspect fixtures.
  return createClient<Database>(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function createMember(admin: Client, role: string): Promise<{ id: string; email: string }> {
  const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: FIXTURE_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  return { id: data.user.id, email };
}

export async function signIn(email: string): Promise<Client> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password: FIXTURE_PASSWORD });
  if (error) throw error;
  return client;
}

// Nulls auth.users.email_confirmed_at directly. GoTrue refuses a password
// session for an unconfirmed user and the admin API can't un-confirm, so the
// only way to exercise the accept_invitation P0001 gate with a live session is
// to sign in while confirmed, then flip the row here — the RPC re-reads it.
export async function unconfirmUserEmail(userId: string): Promise<void> {
  const pg = new PgClient({ connectionString: env("SUPABASE_DB_URL") });
  await pg.connect();
  try {
    await pg.query("update auth.users set email_confirmed_at = null where id = $1", [userId]);
  } finally {
    await pg.end();
  }
}
