import { ActionError, defineAction } from "astro:actions";
import { listCreateSchema, itemCreateSchema } from "@/lib/schemas/wishlist";
import { createList } from "@/lib/services/lists";
import { createItem } from "@/lib/services/items";

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
  },
};
