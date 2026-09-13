import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createReservation, releaseReservation } from "@/lib/services/reservations";
import { setupReservationScenario, type ReservationScenario } from "../helpers/reservationFixtures";

describe("reservation exclusivity under concurrency", () => {
  let scenario: ReservationScenario;

  beforeEach(async () => {
    scenario = await setupReservationScenario();
  });

  afterEach(async () => {
    await scenario.cleanup();
  });

  it("resolves two simultaneous reserves on one item to exactly one winner", async () => {
    const { itemId, owner, invitee, admin } = scenario;

    // Fire both reserves without awaiting the first — a genuine race exercised
    // through member (publishable-key) clients so RLS is really enforced.
    const results = await Promise.allSettled([
      createReservation(owner.client, { itemId }),
      createReservation(invitee.client, { itemId }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // The loser fails on the unique partial index, i.e. Postgres 23505.
    const reason = rejected[0].reason as { code?: string };
    expect(reason.code).toBe("23505");

    // Exactly one active reservation exists (service-role read bypasses RLS).
    const { data, error } = await admin.from("reservations").select("id").eq("item_id", itemId).is("released_at", null);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("frees the item after release so another member can reserve it", async () => {
    const { itemId, owner, invitee } = scenario;

    await createReservation(owner.client, { itemId });
    await releaseReservation(owner.client, { itemId });

    const reReserved = await createReservation(invitee.client, { itemId });
    expect(reReserved.item_id).toBe(itemId);
    expect(reReserved.claimer_id).toBe(invitee.id);
  });
});
