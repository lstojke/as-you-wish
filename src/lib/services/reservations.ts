import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { ReservationCreateInput, ReservationReleaseInput } from "@/lib/schemas/wishlist";

export type ReservationRow = Database["public"]["Tables"]["reservations"]["Row"];

type Client = SupabaseClient<Database>;

// Maps a createReservation failure to the action-layer error payload. A lost
// concurrency race surfaces as Postgres 23505 (the unique partial index
// reservations_one_active_per_item) and becomes a distinct CONFLICT; anything
// else is an opaque server error. Pure so it can be unit-tested without Astro.
export function reserveErrorPayload(err: unknown): {
  code: "CONFLICT" | "INTERNAL_SERVER_ERROR";
  message: string;
} {
  if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505") {
    return { code: "CONFLICT", message: "Someone just reserved this item first" };
  }
  return { code: "INTERNAL_SERVER_ERROR", message: "Could not reserve item" };
}

// Exclusivity is enforced by the unique partial index reservations_one_active_per_item
// and reservations_insert RLS (claimer_id = auth.uid() and is_item_list_member(item_id)).
// A lost concurrency race surfaces here as a Postgres 23505; it propagates so the action
// can map it to a CONFLICT.
export async function createReservation(client: Client, input: ReservationCreateInput): Promise<ReservationRow> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await client
    .from("reservations")
    .insert({ item_id: input.itemId, claimer_id: user.id })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

// RLS (reservations_update gates to claimer_id = auth.uid(); only released_at is writable)
// restricts the row to the caller's own active reservation — no app-side ownership check.
export async function releaseReservation(client: Client, input: ReservationReleaseInput): Promise<void> {
  const { error } = await client
    .from("reservations")
    .update({ released_at: new Date().toISOString() })
    .eq("item_id", input.itemId)
    .is("released_at", null);
  if (error) throw error;
}

// Identity-safe, claimer-scoped read: reservations_select RLS returns only the caller's own
// rows, so no join is needed (see lessons.md — rely on RLS, not an !inner join).
export async function listMyReservedItemIds(client: Client, itemIds: string[]): Promise<string[]> {
  if (itemIds.length === 0) return [];
  const { data, error } = await client
    .from("reservations")
    .select("item_id")
    .in("item_id", itemIds)
    .is("released_at", null);
  if (error) throw error;
  return data.map((row) => row.item_id);
}
