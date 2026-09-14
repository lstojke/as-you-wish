import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createReservation } from "@/lib/services/reservations";
import { setupInvitationScenario, type InvitationScenario } from "../helpers/invitationFixtures";

describe("non-member access control (#3)", () => {
  let scenario: InvitationScenario;

  beforeEach(async () => {
    scenario = await setupInvitationScenario();
  });

  afterEach(async () => {
    await scenario.cleanup();
  });

  it("hides another owner's list and items from a non-member's reads", async () => {
    const { outsider, admin, listId, itemId } = scenario;

    const { data: lists, error: listErr } = await outsider.client.from("lists").select("id").eq("id", listId);
    expect(listErr).toBeNull();
    expect(lists).toHaveLength(0);

    const { data: items, error: itemErr } = await outsider.client.from("items").select("id").eq("list_id", listId);
    expect(itemErr).toBeNull();
    expect(items).toHaveLength(0);

    // Control: the rows genuinely exist (service-role bypasses RLS) — so the
    // empty reads above are RLS denial, not a seeding gap.
    const { data: ctlLists } = await admin.from("lists").select("id").eq("id", listId);
    const { data: ctlItems } = await admin.from("items").select("id").eq("id", itemId);
    expect(ctlLists).toHaveLength(1);
    expect(ctlItems).toHaveLength(1);
  });

  it("rejects a non-member's attempt to reserve an item", async () => {
    const { outsider, admin, itemId } = scenario;

    await expect(createReservation(outsider.client, { itemId })).rejects.toBeDefined();

    // No reservation row was created (service-role read bypasses RLS).
    const { data, error } = await admin.from("reservations").select("id").eq("item_id", itemId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});
