import { ActionError, defineAction } from "astro:actions";
import {
  listCreateSchema,
  listRenameSchema,
  listDeleteSchema,
  itemCreateSchema,
  itemUpdateSchema,
  itemDeleteSchema,
  invitationCreateSchema,
  invitationRevokeSchema,
  invitationAcceptSchema,
} from "@/lib/schemas/wishlist";
import { createList, updateList, deleteList } from "@/lib/services/lists";
import { createItem, updateItem, deleteItem } from "@/lib/services/items";
import { createInvitation, deleteInvitation, acceptInvitation } from "@/lib/services/invitations";

function requireSupabase(locals: App.Locals) {
  if (!locals.supabase) {
    throw new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Supabase client unavailable",
    });
  }
  if (!locals.user) {
    throw new ActionError({
      code: "UNAUTHORIZED",
      message: "You must be signed in",
    });
  }
  return locals.supabase;
}

export const server = {
  lists: {
    create: defineAction({
      accept: "json",
      input: listCreateSchema,
      handler: async (input, context) => {
        const client = requireSupabase(context.locals);
        try {
          return await createList(client, input);
        } catch (err) {
          // eslint-disable-next-line no-console -- surface server-side action errors in Wrangler tail
          console.error("lists.create failed", err);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not create list",
          });
        }
      },
    }),
    rename: defineAction({
      accept: "json",
      input: listRenameSchema,
      handler: async (input, context) => {
        const client = requireSupabase(context.locals);
        try {
          return await updateList(client, input);
        } catch (err) {
          // eslint-disable-next-line no-console -- surface server-side action errors in Wrangler tail
          console.error("lists.rename failed", err);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not rename list",
          });
        }
      },
    }),
    delete: defineAction({
      accept: "json",
      input: listDeleteSchema,
      handler: async (input, context) => {
        const client = requireSupabase(context.locals);
        try {
          await deleteList(client, input);
          return { success: true as const };
        } catch (err) {
          // eslint-disable-next-line no-console -- surface server-side action errors in Wrangler tail
          console.error("lists.delete failed", err);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not delete list",
          });
        }
      },
    }),
  },
  items: {
    create: defineAction({
      accept: "json",
      input: itemCreateSchema,
      handler: async (input, context) => {
        const client = requireSupabase(context.locals);
        try {
          return await createItem(client, input);
        } catch (err) {
          // eslint-disable-next-line no-console -- surface server-side action errors in Wrangler tail
          console.error("items.create failed", err);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not add item",
          });
        }
      },
    }),
    update: defineAction({
      accept: "json",
      input: itemUpdateSchema,
      handler: async (input, context) => {
        const client = requireSupabase(context.locals);
        try {
          return await updateItem(client, input);
        } catch (err) {
          // eslint-disable-next-line no-console -- surface server-side action errors in Wrangler tail
          console.error("items.update failed", err);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not update item",
          });
        }
      },
    }),
    delete: defineAction({
      accept: "json",
      input: itemDeleteSchema,
      handler: async (input, context) => {
        const client = requireSupabase(context.locals);
        try {
          await deleteItem(client, input);
          return { success: true as const };
        } catch (err) {
          // eslint-disable-next-line no-console -- surface server-side action errors in Wrangler tail
          console.error("items.delete failed", err);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not delete item",
          });
        }
      },
    }),
  },
  invitations: {
    create: defineAction({
      accept: "json",
      input: invitationCreateSchema,
      handler: async (input, context) => {
        const client = requireSupabase(context.locals);
        const currentEmail = context.locals.user?.email?.toLowerCase().trim();
        if (currentEmail && currentEmail === input.email) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: "You can't invite yourself",
          });
        }
        try {
          const result = await createInvitation(client, input);
          if (!result.ok) {
            throw new ActionError({
              code: "BAD_REQUEST",
              message: "That email has already been invited to this list",
            });
          }
          // emailSent is wired to Resend in Phase 2; no delivery yet.
          return { invitation: result.invitation, emailSent: false as const };
        } catch (err) {
          if (err instanceof ActionError) throw err;
          // eslint-disable-next-line no-console -- surface server-side action errors in Wrangler tail
          console.error("invitations.create failed", err);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not send invitation",
          });
        }
      },
    }),
    revoke: defineAction({
      accept: "json",
      input: invitationRevokeSchema,
      handler: async (input, context) => {
        const client = requireSupabase(context.locals);
        try {
          await deleteInvitation(client, input);
          return { success: true as const };
        } catch (err) {
          // eslint-disable-next-line no-console -- surface server-side action errors in Wrangler tail
          console.error("invitations.revoke failed", err);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not revoke invitation",
          });
        }
      },
    }),
    accept: defineAction({
      accept: "json",
      input: invitationAcceptSchema,
      handler: async (input, context) => {
        const client = requireSupabase(context.locals);
        try {
          const result = await acceptInvitation(client, input);
          if (!result.ok) {
            const message =
              result.reason === "mismatch"
                ? "This invitation was sent to a different email address"
                : result.reason === "not_confirmed"
                  ? "Please confirm your email address first"
                  : result.reason === "not_found"
                    ? "Invitation not found"
                    : "Could not accept invitation";
            const code = result.reason === "not_found" ? "NOT_FOUND" : "BAD_REQUEST";
            throw new ActionError({ code, message });
          }
          return { listId: result.listId };
        } catch (err) {
          if (err instanceof ActionError) throw err;
          // eslint-disable-next-line no-console -- surface server-side action errors in Wrangler tail
          console.error("invitations.accept failed", err);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not accept invitation",
          });
        }
      },
    }),
  },
};
