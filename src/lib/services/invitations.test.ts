import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/database.types";
import { invitationCreateSchema, invitationRoleChangeSchema } from "@/lib/schemas/wishlist";
import { changeInvitationRole, createInvitation } from "./invitations";

const listId = "00000000-0000-4000-8000-000000000001";
const invitationId = "00000000-0000-4000-8000-000000000002";
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

describe("invitation role services", () => {
  it("defaults old requests to viewer, normalizes email and rejects invalid roles", () => {
    expect(invitationCreateSchema.parse({ listId, email: "  Friend@Example.com " })).toEqual({
      listId,
      email: "friend@example.com",
      role: "viewer",
    });
    expect(invitationCreateSchema.safeParse({ listId, email: "friend@example.com", role: "owner" }).success).toBe(
      false,
    );
    expect(invitationRoleChangeSchema.safeParse({ invitationId, role: "owner" }).success).toBe(false);
  });

  it("persists the selected role and maps duplicate invites without retrying", async () => {
    const input = invitationCreateSchema.parse({ listId, email: "friend@example.com", role: "collaborator" });
    reply({ id: invitationId, list_id: listId, email: input.email, role: input.role });
    expect(await createInvitation(client, input)).toMatchObject({ ok: true, invitation: { role: "collaborator" } });
    const sent = fetchMock.mock.calls[0][1]?.body;
    if (typeof sent !== "string") throw new Error("Expected JSON request body");
    expect(JSON.parse(sent)).toMatchObject({ list_id: listId, role: "collaborator" });
    reply({ code: "23505", message: "Duplicate", details: "", hint: "" }, 409);
    expect(await createInvitation(client, input)).toEqual({ ok: false, reason: "already_invited" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces failed or unconfirmed role changes", async () => {
    const input = { invitationId, role: "collaborator" } as const;
    reply({ code: "42501", message: "Not owned", details: "", hint: "" }, 403);
    await expect(changeInvitationRole(client, input)).rejects.toMatchObject({ code: "42501" });
    reply(false);
    await expect(changeInvitationRole(client, input)).rejects.toThrow("not confirmed");
    reply(true);
    await expect(changeInvitationRole(client, input)).resolves.toBeUndefined();
  });
});
