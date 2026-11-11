import { z } from "zod";

export const LIST_GROUP_NAME_MAX = 100;

const groupNameSchema = z
  .string({ error: "validation.groupNameRequired" })
  .trim()
  .min(1, "validation.groupNameRequired")
  .max(LIST_GROUP_NAME_MAX, "validation.groupNameMax100");

const groupIdSchema = z.uuid({ error: "validation.groupIdInvalid" });
const listIdSchema = z.uuid({ error: "validation.listIdInvalid" });

export const listGroupCreateSchema = z.strictObject({ name: groupNameSchema }, { error: "validation.inputInvalid" });

export const listGroupRenameSchema = z.strictObject(
  { groupId: groupIdSchema, name: groupNameSchema },
  { error: "validation.inputInvalid" },
);

export const listGroupDeleteSchema = z.strictObject({ groupId: groupIdSchema }, { error: "validation.inputInvalid" });

export const listGroupMembershipSchema = z.strictObject(
  { groupId: groupIdSchema, listId: listIdSchema },
  { error: "validation.inputInvalid" },
);

export type ListGroupCreateInput = z.infer<typeof listGroupCreateSchema>;
export type ListGroupRenameInput = z.infer<typeof listGroupRenameSchema>;
export type ListGroupDeleteInput = z.infer<typeof listGroupDeleteSchema>;
export type ListGroupMembershipInput = z.infer<typeof listGroupMembershipSchema>;
