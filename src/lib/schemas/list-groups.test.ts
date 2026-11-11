import { describe, expect, it } from "vitest";
import {
  LIST_GROUP_NAME_MAX,
  listGroupCreateSchema,
  listGroupDeleteSchema,
  listGroupMembershipSchema,
  listGroupRenameSchema,
} from "./list-groups";

const groupId = "4a3a3d2e-b196-4d64-9dc1-119f8213034f";
const listId = "8d1f6a0c-2b7e-4c1a-9e3f-5a6b7c8d9e0f";

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.success ? undefined : result.error?.issues[0].message;
}

describe("list group schemas", () => {
  it("trims names and accepts the max length", () => {
    expect(listGroupCreateSchema.parse({ name: "  Christmas " })).toEqual({ name: "Christmas" });
    expect(listGroupRenameSchema.parse({ groupId, name: "a".repeat(LIST_GROUP_NAME_MAX) }).name).toHaveLength(100);
  });

  it.each([
    ["", "validation.groupNameRequired"],
    [" \t\n", "validation.groupNameRequired"],
    [null, "validation.groupNameRequired"],
    [42, "validation.groupNameRequired"],
    ["a".repeat(101), "validation.groupNameMax100"],
  ])("rejects name %j with %s", (name, message) => {
    expect(firstMessage(listGroupCreateSchema.safeParse({ name }))).toBe(message);
    expect(firstMessage(listGroupRenameSchema.safeParse({ groupId, name }))).toBe(message);
  });

  it.each(["", "not-a-uuid", null, 42])("rejects invalid IDs %j", (id) => {
    expect(firstMessage(listGroupRenameSchema.safeParse({ groupId: id, name: "x" }))).toBe("validation.groupIdInvalid");
    expect(firstMessage(listGroupDeleteSchema.safeParse({ groupId: id }))).toBe("validation.groupIdInvalid");
    expect(firstMessage(listGroupMembershipSchema.safeParse({ groupId: id, listId }))).toBe(
      "validation.groupIdInvalid",
    );
    expect(firstMessage(listGroupMembershipSchema.safeParse({ groupId, listId: id }))).toBe("validation.listIdInvalid");
  });

  it("rejects client-supplied owner IDs and unknown fields", () => {
    expect(listGroupCreateSchema.safeParse({ name: "x", userId: groupId }).success).toBe(false);
    expect(listGroupRenameSchema.safeParse({ groupId, name: "x", user_id: groupId }).success).toBe(false);
    expect(listGroupDeleteSchema.safeParse({ groupId, cascadeLists: true }).success).toBe(false);
    expect(listGroupMembershipSchema.safeParse({ groupId, listId, userId: groupId }).success).toBe(false);
    expect(listGroupMembershipSchema.safeParse({ groupId }).success).toBe(false);
  });
});
