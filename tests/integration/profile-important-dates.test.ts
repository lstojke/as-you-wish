import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { adminClient, anonClient, createMember, signIn, type Client } from "../helpers/supabaseTestClients";
import type { Database } from "@/db/database.types";
import { importantDateCreateSchema } from "@/lib/schemas/important-dates";
import {
  createImportantDate,
  updateImportantDate,
  deleteImportantDate,
  listImportantDates,
} from "@/lib/services/important-dates";

type DateInsert = Database["public"]["Tables"]["profile_important_dates"]["Insert"];
type DateRow = Database["public"]["Tables"]["profile_important_dates"]["Row"];

interface Member {
  id: string;
  email: string;
  client: Client;
}

describe("private profile important dates", () => {
  const admin = adminClient();
  let alice: Member;
  let bob: Member;
  let createdIds: string[] = [];

  beforeEach(async () => {
    createdIds = [];
    const a = await createMember(admin, "dates-alice");
    createdIds.push(a.id);
    const b = await createMember(admin, "dates-bob");
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

  async function createDate(overrides: Partial<DateInsert> = {}): Promise<DateRow> {
    const { data, error } = await alice.client
      .from("profile_important_dates")
      .insert({ profile_id: alice.id, date: "2000-02-29", heading: "Birthday", ...overrides })
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  it("supports service CRUD, normalized descriptions, duplicates, and original-date ordering", async () => {
    const input = importantDateCreateSchema.parse({ date: "2026-01-31", heading: " Anniversary ", description: " " });
    const first = await createImportantDate(alice.client, input);
    const duplicate = await createImportantDate(alice.client, input);
    const earlier = await createImportantDate(alice.client, { ...input, date: "2000-02-29" });
    expect(first).toMatchObject({ heading: "Anniversary", description: null, repeat_frequency: "yearly" });
    expect(duplicate.id).not.toBe(first.id);
    expect((await listImportantDates(alice.client)).map((row) => row.id)).toEqual([
      earlier.id,
      ...[first.id, duplicate.id].sort(),
    ]);
    for (const repeatFrequency of ["none", "weekly", "monthly", "yearly"] as const) {
      const saved = await updateImportantDate(alice.client, {
        ...input,
        importantDateId: first.id,
        description: "Details",
        repeatFrequency,
      });
      expect(saved).toMatchObject({ date: "2026-01-31", repeat_frequency: repeatFrequency, description: "Details" });
    }
    const cleared = await updateImportantDate(alice.client, { ...input, importantDateId: first.id });
    expect(cleared.description).toBeNull();
    expect((await deleteImportantDate(alice.client, { importantDateId: first.id })).id).toBe(first.id);
    expect((await listImportantDates(alice.client)).map((row) => row.id)).not.toContain(first.id);
  });

  it("fails explicitly for inaccessible and nonexistent service targets", async () => {
    const row = await createDate();
    expect(await listImportantDates(bob.client)).toEqual([]);
    const missingId = crypto.randomUUID();
    for (const [client, importantDateId] of [
      [bob.client, row.id],
      [alice.client, missingId],
    ] as const) {
      await expect(
        updateImportantDate(client, {
          ...importantDateCreateSchema.parse({ date: row.date, heading: "Changed" }),
          importantDateId,
        }),
      ).rejects.toMatchObject({ code: "PGRST116" });
      await expect(deleteImportantDate(client, { importantDateId })).rejects.toMatchObject({ code: "PGRST116" });
    }
    const persisted = await admin.from("profile_important_dates").select("*").eq("id", row.id).single();
    expect(persisted.error).toBeNull();
    expect(persisted.data).toEqual(row);
  });

  it("supports own-row CRUD, yearly defaults, and optional descriptions", async () => {
    const row = await createDate();
    expect(row).toMatchObject({
      profile_id: alice.id,
      date: "2000-02-29",
      heading: "Birthday",
      description: null,
      repeat_frequency: "yearly",
    });
    expect(row.id).toBeTruthy();
    expect(row.created_at).toBeTruthy();
    expect(row.updated_at).toBeTruthy();

    const read = await alice.client.from("profile_important_dates").select("*").eq("id", row.id).single();
    expect(read.error).toBeNull();
    expect(read.data).toEqual(row);

    const updated = await alice.client
      .from("profile_important_dates")
      .update({ heading: "Anniversary", description: "Family occasion", repeat_frequency: "monthly" })
      .eq("id", row.id)
      .select("*")
      .single();
    expect(updated.error).toBeNull();
    expect(updated.data).toMatchObject({
      date: "2000-02-29",
      heading: "Anniversary",
      description: "Family occasion",
      repeat_frequency: "monthly",
      created_at: row.created_at,
    });
    expect(Date.parse(updated.data?.updated_at ?? "")).toBeGreaterThan(Date.parse(row.updated_at));

    const cleared = await alice.client
      .from("profile_important_dates")
      .update({ description: null })
      .eq("id", row.id)
      .select("description")
      .single();
    expect(cleared.error).toBeNull();
    expect(cleared.data?.description).toBeNull();

    const deleted = await alice.client.from("profile_important_dates").delete().eq("id", row.id).select("id");
    expect(deleted.error).toBeNull();
    expect(deleted.data).toEqual([{ id: row.id }]);
    const remaining = await admin.from("profile_important_dates").select("id").eq("id", row.id);
    expect(remaining.error).toBeNull();
    expect(remaining.data).toEqual([]);
  });

  it("hides other users' dates and filters cross-user updates and deletes", async () => {
    const row = await createDate();
    const read = await bob.client.from("profile_important_dates").select("*").eq("id", row.id);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);
    const update = await bob.client
      .from("profile_important_dates")
      .update({ heading: "Intruder" })
      .eq("id", row.id)
      .select("id");
    expect(update.error).toBeNull();
    expect(update.data).toEqual([]);
    const deletion = await bob.client.from("profile_important_dates").delete().eq("id", row.id).select("id");
    expect(deletion.error).toBeNull();
    expect(deletion.data).toEqual([]);
    const persisted = await admin.from("profile_important_dates").select("*").eq("id", row.id).single();
    expect(persisted.error).toBeNull();
    expect(persisted.data).toEqual(row);
  });

  it("rejects inserting for another owner and transferring ownership", async () => {
    const spoofed = await alice.client
      .from("profile_important_dates")
      .insert({ profile_id: bob.id, date: "2026-01-31", heading: "Spoofed" });
    expect(spoofed.error?.code).toBe("42501");
    const row = await createDate();
    const transferred = await alice.client
      .from("profile_important_dates")
      .update({ profile_id: bob.id })
      .eq("id", row.id);
    expect(transferred.error?.code).toBe("42501");
    const persisted = await admin.from("profile_important_dates").select("profile_id").eq("id", row.id).single();
    expect(persisted.error).toBeNull();
    expect(persisted.data?.profile_id).toBe(alice.id);
  });

  it("does not allow anonymous reads, inserts, updates, or deletes", async () => {
    const row = await createDate();
    const anonymous = anonClient();
    const read = await anonymous.from("profile_important_dates").select("*");
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);
    const insert = await anonymous
      .from("profile_important_dates")
      .insert({ profile_id: alice.id, date: "2026-01-31", heading: "Anonymous" });
    expect(insert.error?.code).toBe("42501");
    const update = await anonymous
      .from("profile_important_dates")
      .update({ heading: "Anonymous" })
      .eq("id", row.id)
      .select("id");
    expect(update.error).toBeNull();
    expect(update.data).toEqual([]);
    const deletion = await anonymous.from("profile_important_dates").delete().eq("id", row.id).select("id");
    expect(deletion.error).toBeNull();
    expect(deletion.data).toEqual([]);
    const persisted = await admin.from("profile_important_dates").select("*").eq("id", row.id).single();
    expect(persisted.error).toBeNull();
    expect(persisted.data).toEqual(row);
  });

  it("allows duplicate entries and every supported frequency without shifting the date", async () => {
    const first = await createDate({ date: "2026-01-31" });
    const duplicate = await createDate({ date: "2026-01-31" });
    expect(duplicate.id).not.toBe(first.id);
    for (const repeat_frequency of ["none", "weekly", "monthly", "yearly"]) {
      const updated = await alice.client
        .from("profile_important_dates")
        .update({ repeat_frequency })
        .eq("id", first.id)
        .select("date, repeat_frequency")
        .single();
      expect(updated.error).toBeNull();
      expect(updated.data).toEqual({ date: "2026-01-31", repeat_frequency });
    }
  });

  it("enforces text constraints on direct database writes", async () => {
    const boundary = await createDate({ heading: "a".repeat(100), description: "a".repeat(1000) });
    expect(boundary.heading).toHaveLength(100);
    expect(boundary.description).toHaveLength(1000);
    const invalidFields: Partial<DateInsert>[] = [
      { heading: "" },
      { heading: " \t\n" },
      { heading: "a".repeat(101) },
      { description: "" },
      { description: " \t\n" },
      { description: "a".repeat(1001) },
      { repeat_frequency: "daily" },
    ];
    for (const fields of invalidFields) {
      const result = await alice.client
        .from("profile_important_dates")
        .insert({ profile_id: alice.id, date: "2026-01-31", heading: "Valid", ...fields });
      expect(result.error?.code).toBe("23514");
    }
  });

  it("accepts normalized schema output with blank descriptions cleared", async () => {
    const input = importantDateCreateSchema.parse({
      date: "2026-01-31",
      heading: "  Anniversary  ",
      description: " \t\n ",
    });
    const row = await createDate({
      date: input.date,
      heading: input.heading,
      description: input.description,
      repeat_frequency: input.repeatFrequency,
    });
    expect(row).toMatchObject({ heading: "Anniversary", description: null, repeat_frequency: "yearly" });
  });

  it("accepts past/future date boundaries and rejects invalid or out-of-range dates", async () => {
    for (const date of ["0001-01-01", "2000-02-29", "9999-12-31"]) {
      expect((await createDate({ date })).date).toBe(date);
    }
    for (const date of ["infinity", "-infinity", "10000-01-01", "0001-01-01 BC"]) {
      const result = await alice.client
        .from("profile_important_dates")
        .insert({ profile_id: alice.id, date, heading: "Invalid range" });
      expect(result.error?.code).toBe("23514");
    }
    for (const date of ["2026-02-30", "1900-02-29"]) {
      const result = await alice.client
        .from("profile_important_dates")
        .insert({ profile_id: alice.id, date, heading: "Invalid date" });
      expect(result.error?.code).toBe("22008");
    }
  });

  it("cascades profile dates when their Auth owner is deleted", async () => {
    const row = await createDate();
    const deletion = await admin.auth.admin.deleteUser(alice.id);
    expect(deletion.error).toBeNull();
    createdIds = createdIds.filter((id) => id !== alice.id);
    const remaining = await admin.from("profile_important_dates").select("id").eq("id", row.id);
    expect(remaining.error).toBeNull();
    expect(remaining.data).toEqual([]);
  });
});
