import { AuthSessionMissingError, createClient, type User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/database.types";
import type { ImportantDate } from "@/types";
import { importantDateCreateSchema } from "@/lib/schemas/important-dates";
import { createImportantDate, deleteImportantDate, listImportantDates, updateImportantDate } from "./important-dates";

const fetchMock = vi.fn<typeof fetch>();
const client = createClient<Database>("http://127.0.0.1:54321", "test-key", {
  global: { fetch: fetchMock },
  auth: { persistSession: false, autoRefreshToken: false },
});
const user: User = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-10-19T00:00:00Z",
};
const input = importantDateCreateSchema.parse({ date: "2000-02-29", heading: " Birthday ", description: " " });
const row: ImportantDate = {
  id: "00000000-0000-4000-8000-000000000002",
  profile_id: user.id,
  date: input.date,
  heading: input.heading,
  description: null,
  repeat_frequency: "yearly",
  created_at: user.created_at,
  updated_at: user.created_at,
};

function reply(data: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }),
  );
}

function request(index = 0) {
  const [input, options] = fetchMock.mock.calls[index];
  const url = new URL(input instanceof Request ? input.url : input);
  const body: unknown = typeof options?.body === "string" ? JSON.parse(options.body) : undefined;
  return { url, options, body };
}

beforeEach(() => {
  vi.restoreAllMocks();
  fetchMock.mockReset();
  vi.spyOn(client.auth, "getUser").mockResolvedValue({ data: { user }, error: null });
});

describe("important-date services", () => {
  it("lists only the owner with stable original-date and ID ordering", async () => {
    reply([row]);
    expect(await listImportantDates(client)).toEqual([row]);
    const { url } = request();
    expect(url.searchParams.get("profile_id")).toBe(`eq.${user.id}`);
    expect(url.searchParams.get("order")).toBe("date.asc,id.asc");
  });

  it("continues past a full page rather than truncating a large collection", async () => {
    const page = Array.from({ length: 500 }, (_, index) => ({ ...row, id: `row-${index}` }));
    reply(page);
    reply([row]);
    expect(await listImportantDates(client)).toHaveLength(501);
    expect(request(0).url.searchParams.get("offset")).toBe("0");
    expect(request(0).url.searchParams.get("limit")).toBe("500");
    expect(request(1).url.searchParams.get("offset")).toBe("500");
  });

  it("does not return a partial collection when a later page fails", async () => {
    reply(Array.from({ length: 500 }, () => row));
    reply({ code: "XX000", message: "Failed", details: "", hint: "" }, 500);
    await expect(listImportantDates(client)).rejects.toMatchObject({ code: "XX000" });
  });

  it("creates normalized values using the authenticated owner and yearly default", async () => {
    reply(row);
    expect(await createImportantDate(client, input)).toEqual(row);
    expect(request().options?.method).toBe("POST");
    expect(request().body).toEqual({
      profile_id: user.id,
      date: "2000-02-29",
      heading: "Birthday",
      description: null,
      repeat_frequency: "yearly",
    });
  });

  it("updates a target under the owner filter without changing its calendar anchor", async () => {
    reply({ ...row, repeat_frequency: "monthly", description: null });
    const saved = await updateImportantDate(client, { ...input, repeatFrequency: "monthly", importantDateId: row.id });
    expect(saved.date).toBe("2000-02-29");
    const { url, options, body } = request();
    expect(options?.method).toBe("PATCH");
    expect(url.searchParams.get("id")).toBe(`eq.${row.id}`);
    expect(url.searchParams.get("profile_id")).toBe(`eq.${user.id}`);
    expect(body).toEqual({ date: input.date, heading: input.heading, description: null, repeat_frequency: "monthly" });
  });

  it("deletes only the owned target and returns its affected row", async () => {
    reply(row);
    expect(await deleteImportantDate(client, { importantDateId: row.id })).toEqual(row);
    const { url, options } = request();
    expect(options?.method).toBe("DELETE");
    expect(url.searchParams.get("id")).toBe(`eq.${row.id}`);
    expect(url.searchParams.get("profile_id")).toBe(`eq.${user.id}`);
  });
});

const operations = [
  ["list", () => listImportantDates(client)],
  ["create", () => createImportantDate(client, input)],
  ["update", () => updateImportantDate(client, { ...input, importantDateId: row.id })],
  ["delete", () => deleteImportantDate(client, { importantDateId: row.id })],
] as const;

describe.each(operations)("%s failures", (_name, operation) => {
  it("rejects a missing session before any query", async () => {
    vi.spyOn(client.auth, "getUser").mockResolvedValueOnce({
      data: { user: null },
      error: new AuthSessionMissingError(),
    });
    await expect(operation()).rejects.toBeInstanceOf(AuthSessionMissingError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propagates database failures", async () => {
    reply({ code: "XX000", message: "Failed", details: "", hint: "" }, 500);
    await expect(operation()).rejects.toMatchObject({ code: "XX000" });
  });

  it("rejects a missing response instead of reporting success", async () => {
    reply(null);
    await expect(operation()).rejects.toThrow(
      _name === "list" ? "Important dates response missing" : "Important date not found",
    );
  });
});

it.each([
  ["update", () => updateImportantDate(client, { ...input, importantDateId: row.id })],
  ["delete", () => deleteImportantDate(client, { importantDateId: row.id })],
] as const)("rejects filtered or nonexistent %s targets", async (_name, operation) => {
  reply({ code: "PGRST116", message: "No rows", details: "", hint: "" }, 406);
  await expect(operation()).rejects.toMatchObject({ code: "PGRST116" });
});
