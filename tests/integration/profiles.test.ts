import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { adminClient, createMember, signIn, type Client } from "../helpers/supabaseTestClients";
import { createItem, updateItem } from "@/lib/services/items";
import { createList } from "@/lib/services/lists";
import {
  getDefaultCurrency,
  getLanguage,
  updateDefaultCurrency,
  updateLanguage,
  getOwnProfile,
  getOwnProfileNames,
  updateProfileDetails,
  updateProfilePreferences,
} from "@/lib/services/profiles";
import { profileDetailsSchema } from "@/lib/schemas/profile";

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

  it("provisions nullable names without changing existing preference defaults", async () => {
    const { data, error } = await alice.client
      .from("profiles")
      .select("first_name, last_name, default_currency, language")
      .eq("id", alice.id)
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({ first_name: null, last_name: null, default_currency: "PLN", language: "pl" });
  });

  it("allows private Unicode names to be saved and cleared", async () => {
    const updated = await alice.client
      .from("profiles")
      .update({ first_name: "Łukasz", last_name: "Żółć" })
      .eq("id", alice.id)
      .select("first_name, last_name")
      .single();
    expect(updated.error).toBeNull();
    expect(updated.data).toEqual({ first_name: "Łukasz", last_name: "Żółć" });

    const otherRead = await bob.client.from("profiles").select("first_name, last_name").eq("id", alice.id);
    expect(otherRead.error).toBeNull();
    expect(otherRead.data).toEqual([]);
    const otherUpdate = await bob.client
      .from("profiles")
      .update({ first_name: "Changed" })
      .eq("id", alice.id)
      .select("id");
    expect(otherUpdate.error).toBeNull();
    expect(otherUpdate.data).toEqual([]);

    const cleared = await alice.client
      .from("profiles")
      .update({ first_name: null, last_name: null })
      .eq("id", alice.id)
      .select("first_name, last_name")
      .single();
    expect(cleared.error).toBeNull();
    expect(cleared.data).toEqual({ first_name: null, last_name: null });
  });

  it("enforces nonblank names and length boundaries in the database", async () => {
    for (const column of ["first_name", "last_name"] as const) {
      const valid = await alice.client
        .from("profiles")
        .update(column === "first_name" ? { first_name: "a".repeat(100) } : { last_name: "a".repeat(100) })
        .eq("id", alice.id);
      expect(valid.error).toBeNull();
      for (const value of ["", " \t\n", "a".repeat(101)]) {
        const invalid = await alice.client
          .from("profiles")
          .update(column === "first_name" ? { first_name: value } : { last_name: value })
          .eq("id", alice.id);
        expect(invalid.error?.code).toBe("23514");
      }
    }
  });

  it("saves normalized details through the service and clears optional names", async () => {
    const input = profileDetailsSchema.parse({ firstName: " Łukasz ", lastName: " Żółć " });
    const saved = await updateProfileDetails(alice.client, input);
    expect(saved).toMatchObject({ id: alice.id, first_name: "Łukasz", last_name: "Żółć" });
    expect(await getOwnProfileNames(alice.client)).toEqual({ first_name: "Łukasz", last_name: "Żółć" });
    const cleared = await updateProfileDetails(alice.client, profileDetailsSchema.parse({ firstName: " " }));
    expect(cleared).toMatchObject({ first_name: null, last_name: null });
    expect(await getOwnProfileNames(bob.client)).toEqual({ first_name: null, last_name: null });
  });

  it("saves currency and language atomically without changing names or another profile", async () => {
    await updateProfileDetails(alice.client, { firstName: "Anna", lastName: null });
    const saved = await updateProfilePreferences(alice.client, { defaultCurrency: "EUR", language: "en" });
    expect(saved).toMatchObject({ default_currency: "EUR", language: "en", first_name: "Anna" });

    const invalid = await alice.client
      .from("profiles")
      .update({ default_currency: "GBP", language: "de" })
      .eq("id", alice.id);
    expect(invalid.error?.code).toBe("23514");
    expect(await getOwnProfile(alice.client)).toMatchObject({ default_currency: "EUR", language: "en" });
    expect(await getOwnProfile(bob.client)).toMatchObject({ default_currency: "PLN", language: "pl" });
  });

  it("does not report missing profile reads or updates as successful", async () => {
    const deletion = await admin.from("profiles").delete().eq("id", alice.id);
    expect(deletion.error).toBeNull();
    await expect(getOwnProfile(alice.client)).rejects.toMatchObject({ code: "PGRST116" });
    await expect(getOwnProfileNames(alice.client)).rejects.toMatchObject({ code: "PGRST116" });
    await expect(updateProfileDetails(alice.client, { firstName: "Anna", lastName: null })).rejects.toMatchObject({
      code: "PGRST116",
    });
    await expect(
      updateProfilePreferences(alice.client, { defaultCurrency: "EUR", language: "en" }),
    ).rejects.toMatchObject({ code: "PGRST116" });
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
