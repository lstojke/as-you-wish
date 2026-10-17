import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { adminClient, createMember, signIn, type Client } from "../helpers/supabaseTestClients";
import { createItem, updateItem } from "@/lib/services/items";
import { createList } from "@/lib/services/lists";
import { getDefaultCurrency, getLanguage, updateDefaultCurrency, updateLanguage } from "@/lib/services/profiles";

interface Member {
  id: string;
  email: string;
  client: Client;
}

describe("profiles", () => {
  const admin = adminClient();
  let alice: Member;
  let bob: Member;
  let createdIds: string[] = [];

  beforeEach(async () => {
    createdIds = [];
    const a = await createMember(admin, "profile-alice");
    createdIds.push(a.id);
    const b = await createMember(admin, "profile-bob");
    createdIds.push(b.id);
    alice = { ...a, client: await signIn(a.email) };
    bob = { ...b, client: await signIn(b.email) };
  });

  afterEach(async () => {
    for (const id of createdIds) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw error;
    }
  });

  it("provisions a PLN profile for every new user", async () => {
    const { data, error } = await admin
      .from("profiles")
      .select("id, default_currency")
      .in("id", [alice.id, bob.id])
      .order("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(data?.every((row) => row.default_currency === "PLN")).toBe(true);
  });

  it("lets a user read and update only their own profile", async () => {
    const own = await alice.client.from("profiles").select("id, default_currency").eq("id", alice.id).single();
    expect(own.error).toBeNull();
    expect(own.data).toEqual({ id: alice.id, default_currency: "PLN" });

    const updated = await alice.client
      .from("profiles")
      .update({ default_currency: "EUR" })
      .eq("id", alice.id)
      .select("default_currency")
      .single();
    expect(updated.error).toBeNull();
    expect(updated.data?.default_currency).toBe("EUR");

    const visible = await alice.client.from("profiles").select("id");
    expect(visible.error).toBeNull();
    expect(visible.data).toEqual([{ id: alice.id }]);

    const otherRead = await alice.client.from("profiles").select("id").eq("id", bob.id);
    expect(otherRead.error).toBeNull();
    expect(otherRead.data).toEqual([]);

    const otherUpdate = await alice.client
      .from("profiles")
      .update({ default_currency: "GBP" })
      .eq("id", bob.id)
      .select("id");
    expect(otherUpdate.error).toBeNull();
    expect(otherUpdate.data).toEqual([]);

    const bobRow = await admin.from("profiles").select("default_currency").eq("id", bob.id).single();
    expect(bobRow.data?.default_currency).toBe("PLN");
  });

  it("rejects inserting a profile for another user", async () => {
    const { error } = await alice.client.from("profiles").insert({ id: bob.id });
    expect(error?.code).toBe("42501");
  });

  it("defaults language to Polish and lets a user change only their own", async () => {
    expect(await getLanguage(alice.client, alice.id)).toBe("pl");

    await updateLanguage(alice.client, alice.id, "en");
    expect(await getLanguage(alice.client, alice.id)).toBe("en");

    // RLS silently filters the other user's row; their language stays untouched.
    await updateLanguage(alice.client, bob.id, "en");
    const bobRow = await admin.from("profiles").select("language").eq("id", bob.id).single();
    expect(bobRow.data?.language).toBe("pl");
  });

  it("rejects unsupported language values", async () => {
    const { error } = await alice.client.from("profiles").update({ language: "de" }).eq("id", alice.id);
    expect(error?.code).toBe("23514");
  });

  it("stamps new priced items with the profile default and preserves stored currency on edit", async () => {
    const client = alice.client;
    expect(await getDefaultCurrency(client)).toBe("PLN");
    await updateDefaultCurrency(client, { defaultCurrency: "EUR" });
    const defaultCurrency = await getDefaultCurrency(client);
    expect(defaultCurrency).toBe("EUR");

    const list = await createList(client, { title: "Currency list" });
    const priced = await createItem(client, { listId: list.id, title: "Priced", priceCents: 1000 }, defaultCurrency);
    expect(priced.currency).toBe("EUR");

    const unpriced = await createItem(client, { listId: list.id, title: "Unpriced" }, defaultCurrency);
    expect(unpriced.currency).toBeNull();

    const legacy = await createItem(
      client,
      { listId: list.id, title: "Legacy", priceCents: 500, currency: "USD" },
      defaultCurrency,
    );
    const renamed = await updateItem(
      client,
      { itemId: legacy.id, title: "Legacy renamed", priceCents: 500 },
      defaultCurrency,
    );
    expect(renamed.currency).toBe("USD");

    const newlyPriced = await updateItem(
      client,
      { itemId: unpriced.id, title: "Unpriced", priceCents: 700 },
      defaultCurrency,
    );
    expect(newlyPriced.currency).toBe("EUR");
  });
});
