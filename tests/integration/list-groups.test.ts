import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { adminClient, createMember, signIn, type Client } from "../helpers/supabaseTestClients";
import {
  addListToGroup,
  createListGroup,
  deleteListGroup,
  listGroupMemberships,
  listGroups,
  ListGroupNotFoundError,
  removeListFromGroup,
  renameListGroup,
} from "@/lib/services/list-groups";
import { listOwnedAndShared } from "@/lib/services/lists";

interface Member {
  id: string;
  email: string;
  client: Client;
}

const MISSING_ID = "00000000-0000-4000-8000-000000000000";

describe("personal list groups (RLS)", () => {
  const admin = adminClient();
  let alice: Member;
  let bob: Member;
  let mallory: Member;
  let aliceListId: string;
  let bobListId: string;
  let bobInvitationId: string;
  let malloryListId: string;
  let reservationId: string;
  let createdUserIds: string[] = [];

  async function member(role: string): Promise<Member> {
    const user = await createMember(admin, `groups-${role}`);
    createdUserIds.push(user.id);
    return { ...user, client: await signIn(user.email) };
  }

  async function seedList(ownerId: string, title: string): Promise<string> {
    const { data, error } = await admin.from("lists").insert({ owner_id: ownerId, title }).select("id").single();
    if (error) throw error;
    return data.id;
  }

  async function adminMemberships(groupId: string) {
    const { data, error } = await admin.from("list_group_members").select("list_id").eq("group_id", groupId);
    if (error) throw error;
    return data.map((row) => row.list_id);
  }

  beforeEach(async () => {
    createdUserIds = [];
    [alice, bob, mallory] = await Promise.all([member("alice"), member("bob"), member("mallory")]);
    aliceListId = await seedList(alice.id, "Alice list");
    bobListId = await seedList(bob.id, "Bob list shared with Alice");
    malloryListId = await seedList(mallory.id, "Mallory list");

    const { data: invitation, error: invErr } = await admin
      .from("invitations")
      .insert({
        list_id: bobListId,
        email: alice.email,
        accepted_at: new Date().toISOString(),
        accepted_by_user_id: alice.id,
      })
      .select("id")
      .single();
    if (invErr) throw invErr;
    bobInvitationId = invitation.id;

    const { data: item, error: itemErr } = await admin
      .from("items")
      .insert({ list_id: bobListId, title: "Gift" })
      .select("id")
      .single();
    if (itemErr) throw itemErr;
    const { data: reservation, error: resErr } = await admin
      .from("reservations")
      .insert({ item_id: item.id, claimer_id: alice.id })
      .select("id")
      .single();
    if (resErr) throw resErr;
    reservationId = reservation.id;
  });

  afterEach(async () => {
    for (const id of createdUserIds) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw error;
    }
  });

  it("creates, renames and organizes owned and shared lists across multiple groups", async () => {
    const christmas = await createListGroup(alice.client, { name: "Christmas" });
    const birthdays = await createListGroup(alice.client, { name: "Birthdays" });
    expect(christmas).toMatchObject({ user_id: alice.id, name: "Christmas" });

    await addListToGroup(alice.client, { groupId: christmas.id, listId: aliceListId });
    await addListToGroup(alice.client, { groupId: christmas.id, listId: bobListId });
    await addListToGroup(alice.client, { groupId: christmas.id, listId: bobListId }); // idempotent
    await addListToGroup(alice.client, { groupId: birthdays.id, listId: bobListId });

    const renamed = await renameListGroup(alice.client, { groupId: christmas.id, name: "Xmas" });
    expect(renamed).toMatchObject({ id: christmas.id, name: "Xmas" });

    expect((await listGroups(alice.client)).map((g) => g.id)).toEqual([christmas.id, birthdays.id]);
    const memberships = await listGroupMemberships(alice.client);
    expect(memberships).toHaveLength(3);
    expect(memberships).toEqual(
      expect.arrayContaining([
        { group_id: christmas.id, list_id: aliceListId },
        { group_id: christmas.id, list_id: bobListId },
        { group_id: birthdays.id, list_id: bobListId },
      ]),
    );

    await removeListFromGroup(alice.client, { groupId: christmas.id, listId: aliceListId });
    await removeListFromGroup(alice.client, { groupId: christmas.id, listId: aliceListId }); // idempotent
    expect(await adminMemberships(christmas.id)).toEqual([bobListId]);
    // Empty groups stay visible.
    await removeListFromGroup(alice.client, { groupId: birthdays.id, listId: bobListId });
    expect((await listGroups(alice.client)).map((g) => g.id)).toContain(birthdays.id);
  });

  it("isolates groups per user and rejects foreign group IDs", async () => {
    const group = await createListGroup(alice.client, { name: "Private" });
    await addListToGroup(alice.client, { groupId: group.id, listId: aliceListId });

    expect(await listGroups(mallory.client)).toEqual([]);
    expect(await listGroupMemberships(mallory.client)).toEqual([]);
    const { data: direct } = await mallory.client.from("list_groups").select("id").eq("id", group.id);
    expect(direct).toEqual([]);

    const groupId = group.id;
    await expect(renameListGroup(mallory.client, { groupId, name: "Hijack" })).rejects.toBeInstanceOf(
      ListGroupNotFoundError,
    );
    await expect(deleteListGroup(mallory.client, { groupId })).rejects.toBeInstanceOf(ListGroupNotFoundError);
    await expect(addListToGroup(mallory.client, { groupId, listId: malloryListId })).rejects.toBeInstanceOf(
      ListGroupNotFoundError,
    );
    await expect(removeListFromGroup(mallory.client, { groupId, listId: aliceListId })).rejects.toBeInstanceOf(
      ListGroupNotFoundError,
    );

    // Direct writes cannot forge ownership or move rows.
    const forged = await mallory.client
      .from("list_group_members")
      .insert({ group_id: groupId, list_id: malloryListId, user_id: alice.id });
    expect(forged.error?.code).toBe("42501");
    const forgedGroup = await mallory.client.from("list_groups").insert({ user_id: alice.id, name: "Forged" });
    expect(forgedGroup.error?.code).toBe("42501");
    const steal = await alice.client.from("list_groups").update({ user_id: mallory.id }).eq("id", groupId);
    expect(steal.error?.code).toBe("42501");

    expect((await listGroups(alice.client)).map((g) => g.name)).toEqual(["Private"]);
    expect(await adminMemberships(groupId)).toEqual([aliceListId]);
  });

  it("rejects inaccessible and nonexistent lists without granting access", async () => {
    const group = await createListGroup(alice.client, { name: "Mine" });
    await expect(addListToGroup(alice.client, { groupId: group.id, listId: malloryListId })).rejects.toBeInstanceOf(
      ListGroupNotFoundError,
    );
    await expect(addListToGroup(alice.client, { groupId: group.id, listId: MISSING_ID })).rejects.toBeInstanceOf(
      ListGroupNotFoundError,
    );
    await expect(addListToGroup(alice.client, { groupId: MISSING_ID, listId: aliceListId })).rejects.toBeInstanceOf(
      ListGroupNotFoundError,
    );
    await expect(
      removeListFromGroup(alice.client, { groupId: group.id, listId: malloryListId }),
    ).rejects.toBeInstanceOf(ListGroupNotFoundError);
    await expect(renameListGroup(alice.client, { groupId: MISSING_ID, name: "x" })).rejects.toBeInstanceOf(
      ListGroupNotFoundError,
    );
    await expect(deleteListGroup(alice.client, { groupId: MISSING_ID })).rejects.toBeInstanceOf(ListGroupNotFoundError);
    expect(await adminMemberships(group.id)).toEqual([]);

    // Grouping Bob's list grants Mallory nothing, and Alice's group stays invisible to Bob.
    await addListToGroup(alice.client, { groupId: group.id, listId: bobListId });
    const { data: leaked } = await mallory.client.from("lists").select("id").eq("id", bobListId);
    expect(leaked).toEqual([]);
    expect(await listGroupMemberships(bob.client)).toEqual([]);

    const blank = await alice.client.from("list_groups").insert({ user_id: alice.id, name: "   " });
    expect(blank.error?.code).toBe("23514");
  });

  it("hides stale memberships after revocation and lets the owner remove them", async () => {
    const group = await createListGroup(alice.client, { name: "Christmas" });
    await addListToGroup(alice.client, { groupId: group.id, listId: aliceListId });
    await addListToGroup(alice.client, { groupId: group.id, listId: bobListId });

    const { error: revokeErr } = await bob.client.from("invitations").delete().eq("id", bobInvitationId);
    expect(revokeErr).toBeNull();

    expect(await listGroupMemberships(alice.client)).toEqual([{ group_id: group.id, list_id: aliceListId }]);
    const { data: hidden } = await alice.client.from("list_group_members").select("list_id").eq("list_id", bobListId);
    expect(hidden).toEqual([]);
    expect((await adminMemberships(group.id)).sort()).toEqual([aliceListId, bobListId].sort());

    await expect(addListToGroup(alice.client, { groupId: group.id, listId: bobListId })).rejects.toBeInstanceOf(
      ListGroupNotFoundError,
    );
    const { data: lists } = await alice.client.from("lists").select("id").eq("id", bobListId);
    expect(lists).toEqual([]);

    await removeListFromGroup(alice.client, { groupId: group.id, listId: bobListId });
    expect(await adminMemberships(group.id)).toEqual([aliceListId]);
    // A second removal of the now-absent, inaccessible list is rejected, not silent.
    await expect(removeListFromGroup(alice.client, { groupId: group.id, listId: bobListId })).rejects.toBeInstanceOf(
      ListGroupNotFoundError,
    );
    const { count } = await admin.from("lists").select("id", { count: "exact", head: true }).eq("id", bobListId);
    expect(count).toBe(1);
  });

  it("deletes only the group and its associations", async () => {
    const group = await createListGroup(alice.client, { name: "Temporary" });
    const keep = await createListGroup(alice.client, { name: "Keep" });
    await addListToGroup(alice.client, { groupId: group.id, listId: aliceListId });
    await addListToGroup(alice.client, { groupId: group.id, listId: bobListId });
    await addListToGroup(alice.client, { groupId: keep.id, listId: bobListId });

    await deleteListGroup(alice.client, { groupId: group.id });

    expect((await listGroups(alice.client)).map((g) => g.id)).toEqual([keep.id]);
    expect(await adminMemberships(group.id)).toEqual([]);
    expect(await listGroupMemberships(alice.client)).toEqual([{ group_id: keep.id, list_id: bobListId }]);
    const { count: listCount } = await admin
      .from("lists")
      .select("id", { count: "exact", head: true })
      .in("id", [aliceListId, bobListId]);
    expect(listCount).toBe(2);
    const { data: reservation } = await admin
      .from("reservations")
      .select("released_at")
      .eq("id", reservationId)
      .single();
    expect(reservation?.released_at).toBeNull();
  });

  it("loads grouped owned and shared lists beyond the API row limit", async () => {
    const timestamp = "2026-01-01T00:00:00Z";
    const owned = Array.from({ length: 1001 }, (_, index) => ({
      id: crypto.randomUUID(),
      owner_id: alice.id,
      title: `Owned ${index}`,
      created_at: timestamp,
    }));
    const shared = Array.from({ length: 1001 }, (_, index) => ({
      id: crypto.randomUUID(),
      owner_id: bob.id,
      title: `Shared ${index}`,
      created_at: timestamp,
    }));
    for (const rows of [owned, shared]) {
      for (let offset = 0; offset < rows.length; offset += 500) {
        const { error } = await admin.from("lists").insert(rows.slice(offset, offset + 500));
        if (error) throw error;
      }
    }
    const invitations = shared.map((list) => ({
      list_id: list.id,
      email: alice.email,
      accepted_at: timestamp,
      accepted_by_user_id: alice.id,
    }));
    for (let offset = 0; offset < invitations.length; offset += 500) {
      const { error } = await admin.from("invitations").insert(invitations.slice(offset, offset + 500));
      if (error) throw error;
    }

    const group = await createListGroup(alice.client, { name: "Large group" });
    await addListToGroup(alice.client, { groupId: group.id, listId: owned[0].id });
    await addListToGroup(alice.client, { groupId: group.id, listId: shared[0].id });
    const { owned: loadedOwned, shared: loadedShared } = await listOwnedAndShared(alice.client);
    expect(loadedOwned).toHaveLength(1002);
    expect(loadedShared).toHaveLength(1002);
    expect(new Set(loadedOwned.map((list) => list.id)).size).toBe(1002);
    expect(new Set(loadedShared.map((list) => list.id)).size).toBe(1002);
    const accessible = new Set([...loadedOwned, ...loadedShared].map((list) => list.id));
    const memberships = await listGroupMemberships(alice.client);
    expect(memberships.filter((entry) => accessible.has(entry.list_id))).toEqual(
      expect.arrayContaining([
        { group_id: group.id, list_id: owned[0].id },
        { group_id: group.id, list_id: shared[0].id },
      ]),
    );
    expect(accessible.has(malloryListId)).toBe(false);
  });
});
