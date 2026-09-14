import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acceptInvitation } from "@/lib/services/invitations";
import { setupInvitationScenario, type InvitationScenario } from "../helpers/invitationFixtures";

describe("invitation acceptance access grant (#2)", () => {
  let scenario: InvitationScenario;

  beforeEach(async () => {
    scenario = await setupInvitationScenario();
  });

  afterEach(async () => {
    await scenario.cleanup();
  });

  it("grants list access only to the invited, confirmed user", async () => {
    const { invitee, inviteeInvitation, listId, itemId } = scenario;

    const result = await acceptInvitation(invitee.client, { invitationId: inviteeInvitation.invitationId });
    expect(result).toEqual({ ok: true, listId });

    // After accepting, the invitee's own (publishable-key) client sees the list
    // and its items through is_list_invitee RLS — proof the grant is real.
    const { data: lists, error: listErr } = await invitee.client.from("lists").select("id").eq("id", listId);
    expect(listErr).toBeNull();
    expect(lists).toHaveLength(1);

    const { data: items, error: itemErr } = await invitee.client.from("items").select("id").eq("id", itemId);
    expect(itemErr).toBeNull();
    expect(items).toHaveLength(1);
  });

  it("denies acceptance when the caller's email does not match the invite", async () => {
    const { outsider, inviteeInvitation, admin } = scenario;

    const result = await acceptInvitation(outsider.client, { invitationId: inviteeInvitation.invitationId });
    expect(result).toEqual({ ok: false, reason: "mismatch" });

    // The invitation stays unaccepted (service-role read bypasses RLS).
    const { data, error } = await admin
      .from("invitations")
      .select("accepted_by_user_id")
      .eq("id", inviteeInvitation.invitationId)
      .single();
    expect(error).toBeNull();
    expect(data?.accepted_by_user_id).toBeNull();
  });

  it("denies acceptance when the caller's email is not confirmed", async () => {
    const { unconfirmedInvitee, unconfirmedInvitation } = scenario;

    const result = await acceptInvitation(unconfirmedInvitee.client, {
      invitationId: unconfirmedInvitation.invitationId,
    });
    expect(result).toEqual({ ok: false, reason: "not_confirmed" });
  });

  it("treats a replayed acceptance as an idempotent no-op", async () => {
    const { invitee, inviteeInvitation, listId, admin } = scenario;

    const first = await acceptInvitation(invitee.client, { invitationId: inviteeInvitation.invitationId });
    const second = await acceptInvitation(invitee.client, { invitationId: inviteeInvitation.invitationId });
    expect(first).toEqual({ ok: true, listId });
    expect(second).toEqual({ ok: true, listId });

    // Exactly one accepted grant exists for this invite — no double-grant.
    const { data, error } = await admin
      .from("invitations")
      .select("accepted_by_user_id")
      .eq("id", inviteeInvitation.invitationId)
      .eq("accepted_by_user_id", invitee.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});
