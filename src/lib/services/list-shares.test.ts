import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/database.types";
import { sharedStoreLinkSchema } from "@/lib/schemas/list-shares";
import { formatPrice } from "@/lib/format-price";
import { canAccessSharedList, readListShare } from "./list-shares";

const token = "a".repeat(64);
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

beforeEach(() => {
  fetchMock.mockReset();
});

describe("readListShare", () => {
  it("rejects malformed tokens without making an RPC", async () => {
    for (const value of ["", "x".repeat(64), token.toUpperCase(), `${token}0`]) {
      expect(await readListShare(client, value)).toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null only for expected unavailable links", async () => {
    reply(null);
    expect(await readListShare(client, token)).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("parses nullable fields and empty lists without inventing defaults", async () => {
    const item = { title: "Gift", notes: null, price_cents: null, currency: null, link: null };
    reply({ list_id: listId, title: "Wishlist", items: [item] });
    expect(await readListShare(client, token)).toEqual({ list_id: listId, title: "Wishlist", items: [item] });
    reply({ list_id: listId, title: "Wishlist", items: [] });
    expect(await readListShare(client, token)).toEqual({ list_id: listId, title: "Wishlist", items: [] });
  });

  it("rejects unexpected identity/reservation fields, missing fields, and invalid shapes", async () => {
    for (const data of [
      {},
      [],
      { list_id: listId, title: "Wishlist", items: [], owner_id: listId },
      {
        list_id: listId,
        title: "Wishlist",
        items: [{ title: "Gift", notes: null, price_cents: null, currency: null, link: null, is_reserved: true }],
      },
      { list_id: "invalid", title: "Wishlist", items: [] },
      { list_id: listId, title: "Wishlist", items: null },
    ]) {
      reply(data);
      await expect(readListShare(client, token)).rejects.toBeDefined();
    }
  });

  it("propagates RPC failures instead of treating them as missing links", async () => {
    reply({ code: "XX000", message: "Database failure", details: "", hint: "" }, 500);
    await expect(readListShare(client, token)).rejects.toMatchObject({ code: "XX000" });
  });
});

describe("canAccessSharedList", () => {
  it("uses normal RLS visibility to distinguish members from outsiders", async () => {
    reply([{ id: listId }]);
    expect(await canAccessSharedList(client, listId)).toBe(true);
    reply([]);
    expect(await canAccessSharedList(client, listId)).toBe(false);
  });

  it("propagates query failures rather than silently classifying a member as an outsider", async () => {
    reply({ code: "XX000", message: "Database failure", details: "", hint: "" }, 500);
    await expect(canAccessSharedList(client, listId)).rejects.toMatchObject({ code: "XX000" });
  });
});

describe("shared item presentation", () => {
  it("allows only valid HTTP(S) store URLs, including legacy stored values", () => {
    for (const value of ["https://example.test/gift", "http://example.test/gift"]) {
      expect(sharedStoreLinkSchema.safeParse(value).success).toBe(true);
    }
    for (const value of ["javascript:alert(1)", "data:text/html,test", "ftp://example.test", "/relative", "", null]) {
      expect(sharedStoreLinkSchema.safeParse(value).success).toBe(false);
    }
  });

  it("preserves the existing price display and fallback convention", () => {
    expect(formatPrice(1234, "USD")).toBe("$12.34");
    expect(formatPrice(0, "USD")).toBe("$0.00");
    expect(formatPrice(1234, "invalid")).toBe("12.34 invalid");
  });
});
