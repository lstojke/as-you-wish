import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupInvitationScenario, type InvitationScenario, type Member } from "../helpers/invitationFixtures";
import { anonClient, createMember, signIn, type Client } from "../helpers/supabaseTestClients";
import { invitationCreateSchema } from "@/lib/schemas/wishlist";
import { changeInvitationRole, createInvitation } from "@/lib/services/invitations";

function expectDenied(result: { data: unknown; error: unknown }) {
  if (!result.error)
    expect(result.data === null || (Array.isArray(result.data) && result.data.length === 0)).toBe(true);
}

describe("collaborative list authorization", () => {
  let scenario: InvitationScenario;
  let viewer: Member;
  let viewerInvitationId: string;
  let otherListId: string;
  let foreignListId: string;
  let foreignItemId: string;

  async function accept(client: Client, invitationId: string) {
    const result = await client.rpc("accept_invitation", { invite_id: invitationId });
    expect(result.error).toBeNull();
    expect(result.data).toBe(scenario.listId);
  }

  async function setRole(invitationId: string, role: string) {
    const result = await scenario.owner.client.rpc("set_invitation_role", {
      p_invitation_id: invitationId,
      p_role: role,
    });
    expect(result.error).toBeNull();
    expect(result.data).toBe(true);
  }

  beforeEach(async () => {
    scenario = await setupInvitationScenario();
    const user = await createMember(scenario.admin, "collaboration-viewer");
    viewer = { ...user, client: await signIn(user.email) };
    const invitation = await scenario.admin
      .from("invitations")
      .insert({ list_id: scenario.listId, email: viewer.email })
      .select("id")
      .single();
    if (invitation.error) throw invitation.error;
    viewerInvitationId = invitation.data.id;

    const otherList = await scenario.admin
      .from("lists")
      .insert({ owner_id: scenario.owner.id, title: "Another owned list" })
      .select("id")
      .single();
    if (otherList.error) throw otherList.error;
    otherListId = otherList.data.id;
    const foreignList = await scenario.admin
      .from("lists")
      .insert({ owner_id: scenario.outsider.id, title: "Foreign list" })
      .select("id")
      .single();
    if (foreignList.error) throw foreignList.error;
    foreignListId = foreignList.data.id;
    const foreignItem = await scenario.admin
      .from("items")
      .insert({ list_id: foreignListId, title: "Foreign item" })
      .select("id")
      .single();
    if (foreignItem.error) throw foreignItem.error;
    foreignItemId = foreignItem.data.id;
  });

  afterEach(async () => {
    await scenario.admin.auth.admin.deleteUser(viewer.id);
    await scenario.cleanup();
  });

  it("defaults legacy invitations to viewer and rejects invalid roles and forged acceptance", async () => {
    const { owner, invitee, inviteeInvitation, listId, admin } = scenario;
    const legacy = await owner.client
      .from("invitations")
      .insert({ list_id: listId, email: "legacy@example.test" })
      .select("role, accepted_at, accepted_by_user_id")
      .single();
    expect(legacy.error).toBeNull();
    expect(legacy.data).toEqual({ role: "viewer", accepted_at: null, accepted_by_user_id: null });

    const invalid = await owner.client
      .from("invitations")
      .insert({ list_id: listId, email: "invalid@example.test", role: "owner" });
    expect(invalid.error).not.toBeNull();
    const forged = await owner.client.from("invitations").insert({
      list_id: listId,
      email: "forged@example.test",
      accepted_at: new Date().toISOString(),
      accepted_by_user_id: invitee.id,
    });
    expect(forged.error).not.toBeNull();
    const rows = await admin
      .from("invitations")
      .select("id")
      .in("email", ["invalid@example.test", "forged@example.test"]);
    expect(rows.error).toBeNull();
    expect(rows.data).toEqual([]);

    const before = await admin.from("invitations").select("role").eq("id", inviteeInvitation.invitationId).single();
    expect(before.error).toBeNull();
    expect(before.data?.role).toBe("viewer");
    await accept(invitee.client, inviteeInvitation.invitationId);
    const role = await invitee.client.rpc("get_list_role", { p_list_id: listId });
    expect(role.error).toBeNull();
    expect(role.data).toBe("viewer");
  });

  it("creates invitations with the selected role and changes accepted roles through the service", async () => {
    const { owner, invitee, inviteeInvitation, listId } = scenario;
    const input = invitationCreateSchema.parse({ listId, email: "service@example.test", role: "collaborator" });
    const created = await createInvitation(owner.client, input);
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("Invitation was not created");
    expect(created.invitation.role).toBe("collaborator");
    expect(await createInvitation(owner.client, input)).toEqual({ ok: false, reason: "already_invited" });
    await accept(invitee.client, inviteeInvitation.invitationId);
    await changeInvitationRole(owner.client, { invitationId: inviteeInvitation.invitationId, role: "collaborator" });
    expect((await invitee.client.rpc("get_list_role", { p_list_id: listId })).data).toBe("collaborator");
    await expect(
      changeInvitationRole(invitee.client, { invitationId: inviteeInvitation.invitationId, role: "viewer" }),
    ).rejects.toMatchObject({ code: "42501" });
    await changeInvitationRole(owner.client, { invitationId: inviteeInvitation.invitationId, role: "viewer" });
    expect((await invitee.client.rpc("get_list_role", { p_list_id: listId })).data).toBe("viewer");
  });

  it("preserves promotion through acceptance and applies demotion on the next request", async () => {
    const { owner, invitee, inviteeInvitation, outsider, listId } = scenario;
    const id = inviteeInvitation.invitationId;
    await setRole(id, "collaborator");
    for (const client of [invitee.client, outsider.client]) {
      const role = await client.rpc("get_list_role", { p_list_id: listId });
      expect(role.error).toBeNull();
      expect(role.data).toBeNull();
      const editor = await client.rpc("is_list_editor", { list_uuid: listId });
      expect(editor.error).toBeNull();
      expect(editor.data).toBe(false);
    }
    const anonymousRole = await anonClient().rpc("get_list_role", { p_list_id: listId });
    expect(anonymousRole.error !== null || anonymousRole.data === null).toBe(true);
    await accept(invitee.client, id);
    for (const [client, expected] of [
      [owner.client, "owner"],
      [invitee.client, "collaborator"],
    ] as const) {
      const role = await client.rpc("get_list_role", { p_list_id: listId });
      expect(role.error).toBeNull();
      expect(role.data).toBe(expected);
    }
    await setRole(id, "viewer");
    expect((await invitee.client.rpc("get_list_role", { p_list_id: listId })).data).toBe("viewer");
    expectDenied(await invitee.client.from("items").insert({ list_id: listId, title: "After demotion" }).select("id"));
    await setRole(id, "collaborator");
    const inserted = await invitee.client
      .from("items")
      .insert({ list_id: listId, title: "After promotion" })
      .select("id");
    expect(inserted.error).toBeNull();
    expect(inserted.data).toHaveLength(1);
  });

  it("serializes acceptance and role changes without losing the selected role", async () => {
    const { owner, invitee, inviteeInvitation, listId } = scenario;
    const [accepted, promoted] = await Promise.all([
      invitee.client.rpc("accept_invitation", { invite_id: inviteeInvitation.invitationId }),
      owner.client.rpc("set_invitation_role", {
        p_invitation_id: inviteeInvitation.invitationId,
        p_role: "collaborator",
      }),
    ]);
    expect(accepted.error).toBeNull();
    expect(accepted.data).toBe(listId);
    expect(promoted.error).toBeNull();
    expect(promoted.data).toBe(true);
    const role = await invitee.client.rpc("get_list_role", { p_list_id: listId });
    expect(role.error).toBeNull();
    expect(role.data).toBe("collaborator");
    for (const [client, editor] of [
      [owner.client, true],
      [invitee.client, true],
      [viewer.client, false],
    ] as const) {
      const result = await client.rpc("is_list_editor", { list_uuid: listId });
      expect(result.error).toBeNull();
      expect(result.data).toBe(editor);
    }
  });

  it("uses the highest accepted role across invitations for the same user", async () => {
    const { owner, invitee, inviteeInvitation, admin, listId } = scenario;
    await accept(invitee.client, inviteeInvitation.invitationId);
    const alternateEmail = `alternate-${invitee.id}@example.test`;
    const alternate = await owner.client
      .from("invitations")
      .insert({ list_id: listId, email: alternateEmail, role: "collaborator" })
      .select("id")
      .single();
    expect(alternate.error).toBeNull();
    if (!alternate.data) throw new Error("Alternate invitation was not created");
    const changed = await admin.auth.admin.updateUserById(invitee.id, { email: alternateEmail, email_confirm: true });
    expect(changed.error).toBeNull();
    await accept(invitee.client, alternate.data.id);

    const role = await invitee.client.rpc("get_list_role", { p_list_id: listId });
    expect(role.error).toBeNull();
    expect(role.data).toBe("collaborator");
    const created = await invitee.client.from("items").insert({ list_id: listId, title: "Multi-invitation editor" });
    expect(created.error).toBeNull();

    await setRole(inviteeInvitation.invitationId, "collaborator");
    await setRole(alternate.data.id, "viewer");
    const stillEditor = await invitee.client.rpc("get_list_role", { p_list_id: listId });
    expect(stillEditor.error).toBeNull();
    expect(stillEditor.data).toBe("collaborator");
    await setRole(inviteeInvitation.invitationId, "viewer");
    const demoted = await invitee.client.rpc("get_list_role", { p_list_id: listId });
    expect(demoted.error).toBeNull();
    expect(demoted.data).toBe("viewer");
    expectDenied(await invitee.client.from("items").insert({ list_id: listId, title: "Demoted" }).select("id"));
  });

  it("prevents role escalation through direct writes or another user's RPC", async () => {
    const { owner, invitee, inviteeInvitation, outsider, admin } = scenario;
    const id = inviteeInvitation.invitationId;
    await accept(invitee.client, id);
    for (const client of [owner.client, invitee.client, viewer.client, outsider.client, anonClient()]) {
      expectDenied(await client.from("invitations").update({ role: "collaborator" }).eq("id", id).select("id"));
    }
    for (const client of [invitee.client, viewer.client, outsider.client, anonClient()]) {
      const result = await client.rpc("set_invitation_role", { p_invitation_id: id, p_role: "collaborator" });
      if (!result.error) expect(result.data).not.toBe(true);
    }
    const badRole = await owner.client.rpc("set_invitation_role", { p_invitation_id: id, p_role: "owner" });
    if (!badRole.error) expect(badRole.data).not.toBe(true);
    const foreign = await outsider.client
      .from("invitations")
      .insert({ list_id: foreignListId, email: "foreign@example.test" })
      .select("id")
      .single();
    expect(foreign.error).toBeNull();
    if (!foreign.data) throw new Error("Foreign invitation was not created");
    const crossList = await owner.client.rpc("set_invitation_role", {
      p_invitation_id: foreign.data.id,
      p_role: "collaborator",
    });
    if (!crossList.error) expect(crossList.data).not.toBe(true);
    const foreignRow = await admin.from("invitations").select("role").eq("id", foreign.data.id).single();
    expect(foreignRow.error).toBeNull();
    expect(foreignRow.data?.role).toBe("viewer");
    const row = await admin.from("invitations").select("role").eq("id", id).single();
    expect(row.error).toBeNull();
    expect(row.data?.role).toBe("viewer");
  });

  it("enforces read, item CRUD and narrow rename for each role", async () => {
    const { owner, invitee, inviteeInvitation, unconfirmedInvitee, outsider, listId, itemId } = scenario;
    await setRole(inviteeInvitation.invitationId, "collaborator");
    await accept(invitee.client, inviteeInvitation.invitationId);
    await accept(viewer.client, viewerInvitationId);
    for (const client of [owner.client, invitee.client, viewer.client]) {
      const read = await client.from("items").select("id").eq("id", itemId);
      expect(read.error).toBeNull();
      expect(read.data).toHaveLength(1);
    }
    for (const client of [unconfirmedInvitee.client, outsider.client, anonClient()]) {
      expectDenied(await client.from("items").select("id").eq("id", itemId));
    }
    for (const client of [owner.client, invitee.client]) {
      const created = await client.from("items").insert({ list_id: listId, title: "Created" }).select("id").single();
      expect(created.error).toBeNull();
      if (!created.data) throw new Error("Item was not created");
      const updated = await client.from("items").update({ title: "Edited" }).eq("id", created.data.id).select("title");
      expect(updated.error).toBeNull();
      expect(updated.data).toEqual([{ title: "Edited" }]);
      const deleted = await client.from("items").delete().eq("id", created.data.id).select("id");
      expect(deleted.error).toBeNull();
      expect(deleted.data).toHaveLength(1);
      const renamed = await client.rpc("rename_collaborative_list", { p_list_id: listId, p_title: "Renamed" });
      expect(renamed.error).toBeNull();
      expect(renamed.data).toHaveLength(1);
      expect(renamed.data?.[0].title).toBe("Renamed");
    }
    for (const client of [viewer.client, unconfirmedInvitee.client, outsider.client, anonClient()]) {
      expectDenied(await client.from("items").insert({ list_id: listId, title: "Denied" }).select("id"));
      expectDenied(await client.from("items").update({ title: "Denied" }).eq("id", itemId).select("id"));
      expectDenied(await client.from("items").delete().eq("id", itemId).select("id"));
      expectDenied(await client.rpc("rename_collaborative_list", { p_list_id: listId, p_title: "Denied" }));
    }
    expectDenied(await invitee.client.from("lists").update({ title: "Direct rename" }).eq("id", listId).select("id"));
  });

  it("keeps identity and list membership immutable even when both lists are editable", async () => {
    const { owner, invitee, inviteeInvitation, listId, itemId, admin } = scenario;
    await setRole(inviteeInvitation.invitationId, "collaborator");
    await accept(invitee.client, inviteeInvitation.invitationId);
    const replacementId = crypto.randomUUID();
    for (const client of [owner.client, invitee.client]) {
      expectDenied(await client.from("items").update({ id: replacementId }).eq("id", itemId).select("id"));
      expectDenied(await client.from("items").update({ list_id: otherListId }).eq("id", itemId).select("id"));
      expectDenied(await client.from("items").update({ list_id: foreignListId }).eq("id", itemId).select("id"));
      expectDenied(await client.from("items").update({ list_id: listId }).eq("id", foreignItemId).select("id"));
      expectDenied(await client.from("lists").update({ owner_id: scenario.outsider.id }).eq("id", listId).select("id"));
      expectDenied(await client.from("lists").update({ id: replacementId }).eq("id", listId).select("id"));
    }
    const original = await admin.from("items").select("id, list_id").eq("id", itemId).single();
    expect(original.error).toBeNull();
    expect(original.data).toEqual({ id: itemId, list_id: listId });
  });

  it("reserves invitation and share management and list deletion for the owner", async () => {
    const { owner, invitee, inviteeInvitation, unconfirmedInvitee, outsider, listId, admin } = scenario;
    await setRole(inviteeInvitation.invitationId, "collaborator");
    await accept(invitee.client, inviteeInvitation.invitationId);
    await accept(viewer.client, viewerInvitationId);
    const created = await owner.client
      .from("invitations")
      .insert({ list_id: listId, email: "new@example.test", role: "collaborator" })
      .select("id")
      .single();
    expect(created.error).toBeNull();
    if (!created.data) throw new Error("Invitation was not created");
    const share = await owner.client.rpc("get_or_create_list_share", { p_list_id: listId });
    expect(share.error).toBeNull();
    if (
      !share.data ||
      typeof share.data !== "object" ||
      Array.isArray(share.data) ||
      typeof share.data.token !== "string"
    ) {
      throw new Error("Share token was not created");
    }
    const publicRead = await anonClient().rpc("read_list_share", { p_token: share.data.token });
    expect(publicRead.error).toBeNull();
    expect(publicRead.data).not.toBeNull();

    for (const client of [invitee.client, viewer.client, unconfirmedInvitee.client, outsider.client, anonClient()]) {
      expectDenied(
        await client.from("invitations").insert({ list_id: listId, email: "denied@example.test" }).select("id"),
      );
      expectDenied(await client.from("invitations").delete().eq("id", created.data.id).select("id"));
      for (const name of ["get_or_create_list_share", "disable_list_share", "replace_list_share"] as const) {
        const result = await client.rpc(name, { p_list_id: listId });
        expect(result.error).not.toBeNull();
      }
      expectDenied(await client.from("lists").delete().eq("id", listId).select("id"));
    }
    const intact = await admin.from("lists").select("id").eq("id", listId);
    expect(intact.data).toHaveLength(1);
    const revoke = await owner.client.from("invitations").delete().eq("id", created.data.id).select("id");
    expect(revoke.error).toBeNull();
    expect(revoke.data).toHaveLength(1);
    const removed = await owner.client.from("lists").delete().eq("id", listId).select("id");
    expect(removed.error).toBeNull();
    expect(removed.data).toHaveLength(1);
  });

  it("preserves reservation privacy, exclusive claims and release ownership", async () => {
    const { owner, invitee, inviteeInvitation, outsider, itemId, listId } = scenario;
    await setRole(inviteeInvitation.invitationId, "collaborator");
    await accept(invitee.client, inviteeInvitation.invitationId);
    await accept(viewer.client, viewerInvitationId);
    const claimed = await viewer.client
      .from("reservations")
      .insert({ item_id: itemId, claimer_id: viewer.id })
      .select("id")
      .single();
    expect(claimed.error).toBeNull();
    if (!claimed.data) throw new Error("Reservation was not created");
    for (const client of [owner.client, invitee.client]) {
      const rows = await client.from("reservations").select("id, claimer_id").eq("item_id", itemId);
      expect(rows.error).toBeNull();
      expect(rows.data).toEqual([]);
      const status = await client.from("item_reservation_status").select("is_reserved").eq("item_id", itemId).single();
      expect(status.error).toBeNull();
      expect(status.data?.is_reserved).toBe(true);
      expectDenied(
        await client
          .from("reservations")
          .update({ released_at: new Date().toISOString() })
          .eq("id", claimed.data.id)
          .select("id"),
      );
    }
    const competing = await invitee.client.from("reservations").insert({ item_id: itemId, claimer_id: invitee.id });
    expect(competing.error?.code).toBe("23505");
    expectDenied(
      await outsider.client.from("reservations").insert({ item_id: itemId, claimer_id: outsider.id }).select("id"),
    );
    const released = await viewer.client
      .from("reservations")
      .update({ released_at: new Date().toISOString() })
      .eq("id", claimed.data.id)
      .select("id");
    expect(released.error).toBeNull();
    expect(released.data).toHaveLength(1);
    const newClaim = await invitee.client
      .from("reservations")
      .insert({ item_id: itemId, claimer_id: invitee.id })
      .select("id");
    expect(newClaim.error).toBeNull();
    expect(newClaim.data).toHaveLength(1);
    const foreignStatus = await outsider.client.rpc("is_item_reserved", { item_uuid: itemId });
    expect(foreignStatus.error).toBeNull();
    expect(foreignStatus.data).toBe(false);
    expect((await outsider.client.rpc("get_list_role", { p_list_id: listId })).data).toBeNull();
  });
});
