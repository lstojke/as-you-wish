import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client as PgClient } from "pg";
import { setupReservationScenario, type ReservationScenario } from "../helpers/reservationFixtures";
import { anonClient, createMember, signIn, type Client } from "../helpers/supabaseTestClients";
import type { Json } from "@/db/database.types";
import { getListShareState, manageListShare } from "@/lib/services/list-shares";

const managementFunctions = ["get_or_create_list_share", "disable_list_share", "replace_list_share"] as const;

function activeToken(data: Json | null): string {
  if (!data || typeof data !== "object" || Array.isArray(data) || typeof data.token !== "string") {
    throw new Error("Expected an active sharing token");
  }
  expect(data.token).toMatch(/^[0-9a-f]{64}$/);
  expect(data).toEqual({ state: "active", token: data.token });
  return data.token;
}

async function createShare(client: Client, listId: string): Promise<string> {
  const { data, error } = await client.rpc("get_or_create_list_share", { p_list_id: listId });
  expect(error).toBeNull();
  return activeToken(data);
}

describe("read-only list sharing", () => {
  let scenario: ReservationScenario;
  let outsider: { id: string; email: string; client: Client };

  beforeEach(async () => {
    scenario = await setupReservationScenario();
    const member = await createMember(scenario.admin, "share-outsider");
    outsider = { ...member, client: await signIn(member.email) };
  });

  afterEach(async () => {
    try {
      const { error } = await scenario.admin.auth.admin.deleteUser(outsider.id);
      if (error) throw error;
    } finally {
      await scenario.cleanup();
    }
  });

  it("creates one stable token even for concurrent first requests from separate sessions", async () => {
    const { owner, listId, admin } = scenario;
    const secondSession = await signIn(owner.email);
    const tokens = await Promise.all([
      createShare(owner.client, listId),
      createShare(secondSession, listId),
      createShare(owner.client, listId),
    ]);
    expect(new Set(tokens).size).toBe(1);
    expect(await createShare(secondSession, listId)).toBe(tokens[0]);
    const { data, error } = await admin.from("list_share_links").select("*").eq("list_id", listId);
    expect(error).toBeNull();
    expect(data).toEqual([{ list_id: listId, token: tokens[0], disabled_at: null }]);
  });

  it("reads owner-only status without creating or reactivating sharing", async () => {
    const { owner, invitee, listId } = scenario;
    expect(await getListShareState(owner.client, listId)).toEqual({ state: "not_created", token: null });
    await expect(getListShareState(invitee.client, listId)).rejects.toThrow("List not found or not owned");
    await expect(getListShareState(outsider.client, listId)).rejects.toThrow("List not found or not owned");
    await expect(getListShareState(anonClient(), listId)).rejects.toBeDefined();
    const token = await createShare(owner.client, listId);
    expect(await getListShareState(owner.client, listId)).toEqual({ state: "active", token });
    expect(await manageListShare(owner.client, listId, "disable")).toEqual({ state: "disabled", token: null });
    expect(await getListShareState(owner.client, listId)).toEqual({ state: "disabled", token: null });
    const replacement = await manageListShare(owner.client, listId, "replace");
    expect(activeToken(replacement)).not.toBe(token);
  });

  it("returns only display fields, with no reservation information, for every reader", async () => {
    const { owner, invitee, listId, itemId, admin } = scenario;
    const { error: updateError } = await admin
      .from("items")
      .update({ notes: "A thoughtful gift", price_cents: 1234, currency: "EUR", link: "https://example.test/gift" })
      .eq("id", itemId);
    expect(updateError).toBeNull();
    const { error: reserveError } = await invitee.client
      .from("reservations")
      .insert({ item_id: itemId, claimer_id: invitee.id });
    expect(reserveError).toBeNull();
    const token = await createShare(owner.client, listId);
    const expected = {
      list_id: listId,
      title: "Concurrency fixture list",
      items: [
        {
          title: "Contested gift",
          notes: "A thoughtful gift",
          price_cents: 1234,
          currency: "EUR",
          link: "https://example.test/gift",
        },
      ],
    };
    for (const client of [anonClient(), outsider.client, invitee.client, owner.client]) {
      const { data, error } = await client.rpc("read_list_share", { p_token: token });
      expect(error).toBeNull();
      expect(data).toEqual(expected);
    }
  });

  it("returns current contents, deterministic item ordering, nullable fields, and an empty array", async () => {
    const { owner, listId, itemId, admin } = scenario;
    const { error: firstError } = await admin
      .from("items")
      .update({ created_at: "2026-01-02T00:00:00Z" })
      .eq("id", itemId);
    expect(firstError).toBeNull();
    const { error: insertError } = await admin.from("items").insert([
      {
        id: "00000000-0000-4000-8000-000000000002",
        list_id: listId,
        title: "Second",
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000001",
        list_id: listId,
        title: "First",
        created_at: "2026-01-01T00:00:00Z",
      },
    ]);
    expect(insertError).toBeNull();
    const token = await createShare(owner.client, listId);
    const { data, error } = await anonClient().rpc("read_list_share", { p_token: token });
    expect(error).toBeNull();
    expect(data).toEqual({
      list_id: listId,
      title: "Concurrency fixture list",
      items: ["First", "Second", "Contested gift"].map((title) => ({
        title,
        notes: null,
        price_cents: null,
        currency: null,
        link: null,
      })),
    });
    const { error: renameError } = await owner.client.from("lists").update({ title: "Updated" }).eq("id", listId);
    expect(renameError).toBeNull();
    const { error: deleteError } = await owner.client.from("items").delete().eq("list_id", listId);
    expect(deleteError).toBeNull();
    const refreshed = await anonClient().rpc("read_list_share", { p_token: token });
    expect(refreshed.error).toBeNull();
    expect(refreshed.data).toEqual({ list_id: listId, title: "Updated", items: [] });
  });

  it("does not create sharing when disabling a never-shared list", async () => {
    const { owner, listId, admin } = scenario;
    const { data, error } = await owner.client.rpc("disable_list_share", { p_list_id: listId });
    expect(error).toBeNull();
    expect(data).toEqual({ state: "not_created", token: null });
    const rows = await admin.from("list_share_links").select("*").eq("list_id", listId);
    expect(rows.error).toBeNull();
    expect(rows.data).toEqual([]);
  });

  it("disables idempotently, never reactivates on get/create, and replaces explicitly", async () => {
    const { owner, listId } = scenario;
    const token = await createShare(owner.client, listId);
    for (const name of ["disable_list_share", "disable_list_share", "get_or_create_list_share"] as const) {
      const { data, error } = await owner.client.rpc(name, { p_list_id: listId });
      expect(error).toBeNull();
      expect(data).toEqual({ state: "disabled", token: null });
    }
    const disabled = await anonClient().rpc("read_list_share", { p_token: token });
    expect(disabled.error).toBeNull();
    expect(disabled.data).toBeNull();
    const replaced = await owner.client.rpc("replace_list_share", { p_list_id: listId });
    expect(replaced.error).toBeNull();
    const replacement = activeToken(replaced.data);
    expect(replacement).not.toBe(token);
    expect(await createShare(owner.client, listId)).toBe(replacement);
    const oldRead = await anonClient().rpc("read_list_share", { p_token: token });
    expect(oldRead.error).toBeNull();
    expect(oldRead.data).toBeNull();
    const newRead = await anonClient().rpc("read_list_share", { p_token: replacement });
    expect(newRead.error).toBeNull();
    expect(newRead.data).not.toBeNull();
  });

  it("serializes replacements and disable without leaving multiple active tokens", async () => {
    const { owner, listId, admin } = scenario;
    const initial = await createShare(owner.client, listId);
    const secondSession = await signIn(owner.email);
    const replacements = await Promise.all([
      owner.client.rpc("replace_list_share", { p_list_id: listId }),
      secondSession.rpc("replace_list_share", { p_list_id: listId }),
    ]);
    const tokens = replacements.map(({ data, error }) => {
      expect(error).toBeNull();
      return activeToken(data);
    });
    expect(new Set(tokens).size).toBe(2);
    const current = await createShare(owner.client, listId);
    expect(tokens).toContain(current);
    for (const token of [initial, ...tokens.filter((value) => value !== current)]) {
      const result = await anonClient().rpc("read_list_share", { p_token: token });
      expect(result.error).toBeNull();
      expect(result.data).toBeNull();
    }
    const [disabled, replaced] = await Promise.all([
      owner.client.rpc("disable_list_share", { p_list_id: listId }),
      secondSession.rpc("replace_list_share", { p_list_id: listId }),
    ]);
    expect(disabled.error).toBeNull();
    expect(replaced.error).toBeNull();
    const finalToken = activeToken(replaced.data);
    const row = await admin.from("list_share_links").select("*").eq("list_id", listId).single();
    expect(row.error).toBeNull();
    expect(row.data?.token).toBe(finalToken);
    const finalRead = await anonClient().rpc("read_list_share", { p_token: finalToken });
    expect(finalRead.error).toBeNull();
    expect(finalRead.data === null).toBe(row.data?.disabled_at !== null);
    const previousRead = await anonClient().rpc("read_list_share", { p_token: current });
    expect(previousRead.error).toBeNull();
    expect(previousRead.data).toBeNull();
  });

  it("returns the same null result for malformed, unknown, and deleted-list links", async () => {
    const { owner, listId, admin } = scenario;
    const token = await createShare(owner.client, listId);
    for (const value of ["", "invalid", token.toUpperCase(), `${token}0`, "0".repeat(64)]) {
      const { data, error } = await anonClient().rpc("read_list_share", { p_token: value });
      expect(error).toBeNull();
      expect(data).toBeNull();
    }
    const { error: deleteError } = await owner.client.from("lists").delete().eq("id", listId);
    expect(deleteError).toBeNull();
    const deleted = await anonClient().rpc("read_list_share", { p_token: token });
    expect(deleted.error).toBeNull();
    expect(deleted.data).toBeNull();
    const rows = await admin.from("list_share_links").select("*").eq("list_id", listId);
    expect(rows.error).toBeNull();
    expect(rows.data).toEqual([]);
  });

  it("allows only the owner to read the token record or call management functions", async () => {
    const { owner, invitee, listId } = scenario;
    const token = await createShare(owner.client, listId);
    const ownerRead = await owner.client.from("list_share_links").select("*").eq("list_id", listId);
    expect(ownerRead.error).toBeNull();
    expect(ownerRead.data).toEqual([{ list_id: listId, token, disabled_at: null }]);
    for (const client of [invitee.client, outsider.client]) {
      const rows = await client.from("list_share_links").select("*").eq("list_id", listId);
      expect(rows.error).toBeNull();
      expect(rows.data).toEqual([]);
      for (const name of managementFunctions) {
        const result = await client.rpc(name, { p_list_id: listId });
        expect(result.error?.code).toBe("42501");
        expect(result.data).toBeNull();
      }
    }
    const anonymous = anonClient();
    const rows = await anonymous.from("list_share_links").select("*");
    expect(rows.error?.code).toBe("42501");
    for (const name of managementFunctions) {
      const result = await anonymous.rpc(name, { p_list_id: listId });
      expect(result.error?.code).toBe("42501");
    }
    for (const name of managementFunctions) {
      const result = await owner.client.rpc(name, { p_list_id: "00000000-0000-4000-8000-000000000000" });
      expect(result.error?.code).toBe("42501");
    }
    expect(await createShare(owner.client, listId)).toBe(token);
  });

  it("denies direct client writes even for the owner", async () => {
    const { owner, invitee, listId } = scenario;
    const token = await createShare(owner.client, listId);
    for (const client of [anonClient(), outsider.client, invitee.client, owner.client]) {
      const inserted = await client.from("list_share_links").insert({ list_id: listId, token: "1".repeat(64) });
      expect(inserted.error?.code).toBe("42501");
      const updated = await client.from("list_share_links").update({ disabled_at: null }).eq("list_id", listId);
      expect(updated.error?.code).toBe("42501");
      const deleted = await client.from("list_share_links").delete().eq("list_id", listId);
      expect(deleted.error?.code).toBe("42501");
    }
    expect(await createShare(owner.client, listId)).toBe(token);
  });

  it("isolates lists and grants no membership or ordinary API access to link holders", async () => {
    const { owner, listId, itemId, admin } = scenario;
    const otherList = await owner.client
      .from("lists")
      .insert({ owner_id: owner.id, title: "Other list" })
      .select()
      .single();
    expect(otherList.error).toBeNull();
    if (!otherList.data) throw new Error("Missing second list");
    const token = await createShare(owner.client, listId);
    const otherToken = await createShare(owner.client, otherList.data.id);
    expect(otherToken).not.toBe(token);
    const otherRead = await anonClient().rpc("read_list_share", { p_token: otherToken });
    expect(otherRead.error).toBeNull();
    expect(otherRead.data).toEqual({ list_id: otherList.data.id, title: "Other list", items: [] });
    const invitation = await admin.from("invitations").insert({ list_id: listId, email: outsider.email });
    expect(invitation.error).toBeNull();
    for (const client of [anonClient(), outsider.client]) {
      const read = await client.rpc("read_list_share", { p_token: token });
      expect(read.error).toBeNull();
      expect(read.data).not.toBeNull();
      const ordinaryReads = await Promise.all([
        client.from("lists").select("*"),
        client.from("items").select("*"),
        client.from("reservations").select("*"),
        client.from("item_reservation_status").select("*"),
      ]);
      for (const rows of ordinaryReads) {
        expect(rows.error).toBeNull();
        expect(rows.data).toEqual([]);
      }
      const inserted = await client.from("reservations").insert({ item_id: itemId, claimer_id: outsider.id });
      expect(inserted.error).not.toBeNull();
    }
    const pending = await admin
      .from("invitations")
      .select("accepted_at, accepted_by_user_id")
      .eq("list_id", listId)
      .eq("email", outsider.email)
      .single();
    expect(pending.error).toBeNull();
    expect(pending.data).toEqual({ accepted_at: null, accepted_by_user_id: null });
    const accepted = await scenario.invitee.client.from("lists").select("id").eq("id", listId);
    expect(accepted.error).toBeNull();
    expect(accepted.data).toEqual([{ id: listId }]);
  });

  it("pins function search paths and grants only public reads to anonymous callers", async () => {
    const connectionString = process.env.SUPABASE_DB_URL;
    if (!connectionString) throw new Error("SUPABASE_DB_URL is required for grant assertions");
    const pg = new PgClient({ connectionString });
    await pg.connect();
    try {
      const result = await pg.query<{
        proname: string;
        prosecdef: boolean;
        proconfig: string[];
        anon_execute: boolean;
        member_execute: boolean;
      }>(
        `select p.proname, p.prosecdef, p.proconfig,
          pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
          pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') as member_execute
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any($1::text[])`,
        [[...managementFunctions, "read_list_share"]],
      );
      expect(result.rows).toHaveLength(4);
      for (const row of result.rows) {
        expect(row.prosecdef).toBe(true);
        expect(row.proconfig).toEqual(['search_path=""']);
        expect(row.anon_execute).toBe(row.proname === "read_list_share");
        expect(row.member_execute).toBe(true);
      }
      const grants = await pg.query<{ role: string; selectable: boolean; writable: boolean }>(
        `select role,
          pg_catalog.has_table_privilege(role, 'public.list_share_links', 'SELECT') as selectable,
          pg_catalog.has_table_privilege(role, 'public.list_share_links', 'INSERT,UPDATE,DELETE,TRUNCATE') as writable
        from unnest(array['anon', 'authenticated']) as role`,
      );
      expect(grants.rows).toEqual([
        { role: "anon", selectable: false, writable: false },
        { role: "authenticated", selectable: true, writable: false },
      ]);
    } finally {
      await pg.end();
    }
  });
});
