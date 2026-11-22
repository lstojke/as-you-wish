import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/database.types";
import { getListRole, renameCollaborativeList } from "./lists";

const listId = "00000000-0000-4000-8000-000000000001";
const fetchMock = vi.fn<typeof fetch>();
const client = createClient<Database>("http://127.0.0.1:54321", "test-key", {
  global: { fetch: fetchMock },
  auth: { persistSession: false, autoRefreshToken: false },
});

function reply(data: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }),
  );
}

beforeEach(() => fetchMock.mockReset());

describe("collaborative list services", () => {
  it("accepts only known role values or no membership", async () => {
    for (const role of ["owner", "collaborator", "viewer", null]) {
      reply(role);
      expect(await getListRole(client, listId)).toBe(role);
    }
    reply("administrator");
    await expect(getListRole(client, listId)).rejects.toBeDefined();
  });

  it("propagates database failures and rejects an empty rename result", async () => {
    reply({ code: "42501", message: "Not editable", details: "", hint: "" }, 403);
    await expect(getListRole(client, listId)).rejects.toMatchObject({ code: "42501" });
    reply([]);
    await expect(renameCollaborativeList(client, { listId, title: "Renamed" })).rejects.toThrow(
      "List not found or not editable",
    );
  });
});
