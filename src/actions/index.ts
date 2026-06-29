import { ActionError, defineAction } from "astro:actions";
import {
  listCreateSchema,
  listRenameSchema,
  listDeleteSchema,
  itemCreateSchema,
  itemUpdateSchema,
  itemDeleteSchema,
} from "@/lib/schemas/wishlist";
import { createList, updateList, deleteList } from "@/lib/services/lists";
import { createItem, updateItem, deleteItem } from "@/lib/services/items";

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
};
