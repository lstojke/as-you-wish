import { ActionError, defineAction } from "astro:actions";
import { t } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n/types";
import {
  listCreateSchema,
  listRenameSchema,
  listDeleteSchema,
  itemCreateSchema,
  itemUpdateSchema,
  itemDeleteSchema,
  reservationCreateSchema,
  reservationReleaseSchema,
  invitationCreateSchema,
  invitationRevokeSchema,
  invitationAcceptSchema,
} from "@/lib/schemas/wishlist";
import { createList, updateList, deleteList, getListById } from "@/lib/services/lists";
import { createItem, updateItem, deleteItem } from "@/lib/services/items";
import {
  getDefaultCurrency,
  updateDefaultCurrency,
  updateProfileDetails,
  updateProfilePreferences,
} from "@/lib/services/profiles";
import { profileDetailsSchema, profilePreferencesSchema } from "@/lib/schemas/profile";
import { setLocaleCookie } from "@/lib/i18n/cookie";
import { profileUpdateSchema } from "@/lib/currency";
import { createReservation, releaseReservation, reserveErrorPayload } from "@/lib/services/reservations";
import { createInvitation, deleteInvitation, acceptInvitation } from "@/lib/services/invitations";
import { sendInvitationEmail } from "@/lib/services/email";
import { listShareManageSchema } from "@/lib/schemas/list-shares";
import { getListShareState, listShareView, manageListShare } from "@/lib/services/list-shares";
import {
  importantDateCreateSchema,
  importantDateUpdateSchema,
  importantDateDeleteSchema,
} from "@/lib/schemas/important-dates";
import { createImportantDate, updateImportantDate, deleteImportantDate } from "@/lib/services/important-dates";
import {
  listGroupCreateSchema,
  listGroupRenameSchema,
  listGroupDeleteSchema,
  listGroupMembershipSchema,
} from "@/lib/schemas/list-groups";
import {
  createListGroup,
  renameListGroup,
  deleteListGroup,
  addListToGroup,
  removeListFromGroup,
  ListGroupNotFoundError,
} from "@/lib/services/list-groups";

function requireSupabase(locals: App.Locals) {
  if (!locals.supabase) {
    throw new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: t(locals.locale, "errors.unavailable"),
    });
  }
  if (!locals.user) {
    throw new ActionError({
      code: "UNAUTHORIZED",
      message: t(locals.locale, "errors.signedOut"),
    });
  }
  return locals.supabase;
}

function shareAction(operation: "status" | "create" | "disable" | "replace") {
  return defineAction({
    accept: "json",
    input: listShareManageSchema,
    handler: async (input, context) => {
      const client = requireSupabase(context.locals);
      try {
        const state =
          operation === "status"
            ? await getListShareState(client, input.listId)
            : await manageListShare(client, input.listId, operation);
        return listShareView(state, context.request.url);
      } catch {
        // eslint-disable-next-line no-console -- never log bearer tokens or raw sharing errors
        console.error(`listShares.${operation} failed`);
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: t(context.locals.locale, "errors.shareUpdate"),
        });
      }
    },
  });
}

function listGroupError(err: unknown, locale: App.Locals["locale"], name: string, failureKey: TranslationKey) {
  if (err instanceof ListGroupNotFoundError) {
    return new ActionError({ code: "NOT_FOUND", message: t(locale, "errors.groupNotFound") });
  }
  // eslint-disable-next-line no-console -- never log private group names
  console.error(`listGroups.${name} failed`);
  return new ActionError({ code: "INTERNAL_SERVER_ERROR", message: t(locale, failureKey) });
}

export const server = {
  listGroups: {
    create: defineAction({
      accept: "json",
      input: listGroupCreateSchema,
      handler: async (input, context) => {
        const client = requireSupabase(context.locals);
        try {
          return await createListGroup(client, input);
        } catch (err) {
          throw listGroupError(err, context.locals.locale, "create", "errors.groupSave");
        }
      },
    }),
    rename: defineAction({
      accept: "json",
      input: listGroupRenameSchema,
      handler: async (input, context) => {
        const client = requireSupabase(context.locals);
        try {
          return await renameListGroup(client, input);
        } catch (err) {
          throw listGroupError(err, context.locals.locale, "rename", "errors.groupSave");
        }
      },
    }),
    delete: defineAction({
      accept: "json",
      input: listGroupDeleteSchema,
      handler: async (input, context) => {
        const client = requireSupabase(context.locals);
        try {
          await deleteListGroup(client, input);
          return { success: true as const };
        } catch (err) {
          throw listGroupError(err, context.locals.locale, "delete", "errors.groupDelete");
        }
      },
    }),
    addList: defineAction({
      accept: "json",
      input: listGroupMembershipSchema,
      handler: async (input, context) => {
        const client = requireSupabase(context.locals);
        try {
          await addListToGroup(client, input);
          return { success: true as const };
        } catch (err) {
          throw listGroupError(err, context.locals.locale, "addList", "errors.groupMembership");
        }
      },
    }),
    removeList: defineAction({
      accept: "json",
      input: listGroupMembershipSchema,
      handler: async (input, context) => {
        const client = requireSupabase(context.locals);
        try {
          await removeListFromGroup(client, input);
          return { success: true as const };
        } catch (err) {
          throw listGroupError(err, context.locals.locale, "removeList", "errors.groupMembership");
        }
      },
    }),
  },
  importantDates: {
    create: defineAction({
      accept: "json",
      input: importantDateCreateSchema,
      handler: async (input, context) => {
        const client = requireSupabase(context.locals);
        try {
          return await createImportantDate(client, input);
        } catch {
          // eslint-disable-next-line no-console -- never log private date contents
          console.error("importantDates.create failed");
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: t(context.locals.locale, "errors.importantDateSave"),
          });
        }
      },
    }),
    update: defineAction({
      accept: "json",
      input: importantDateUpdateSchema,
      handler: async (input, context) => {
        const client = requireSupabase(context.locals);
        try {
          return await updateImportantDate(client, input);
        } catch {
          // eslint-disable-next-line no-console -- never log private date contents
          console.error("importantDates.update failed");
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: t(context.locals.locale, "errors.importantDateSave"),
          });
        }
      },
    }),
    delete: defineAction({
      accept: "json",
      input: importantDateDeleteSchema,
      handler: async (input, context) => {
        const client = requireSupabase(context.locals);
        try {
          return await deleteImportantDate(client, input);
        } catch {
          // eslint-disable-next-line no-console -- never log private date contents
          console.error("importantDates.delete failed");
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: t(context.locals.locale, "errors.importantDateDelete"),
          });
        }
      },
    }),
  },
  profile: {
    updateDetails: defineAction({
      accept: "json",
      input: profileDetailsSchema,
      handler: async (input, context) => {
        const client = requireSupabase(context.locals);
        try {
          const profile = await updateProfileDetails(client, input);
          return { firstName: profile.first_name, lastName: profile.last_name };
        } catch {
          // eslint-disable-next-line no-console -- do not log private profile contents
          console.error("profile.updateDetails failed");
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: t(context.locals.locale, "errors.settingsUpdate"),
          });
        }
      },
    }),
    updatePreferences: defineAction({
      accept: "json",
      input: profilePreferencesSchema,
      handler: async (input, context) => {
        const client = requireSupabase(context.locals);
        try {
          const profile = await updateProfilePreferences(client, input);
          const saved = profilePreferencesSchema.parse({
            defaultCurrency: profile.default_currency,
            language: profile.language,
          });
          setLocaleCookie(context.cookies, saved.language, context.url);
          return saved;
        } catch {
          // eslint-disable-next-line no-console -- do not log private profile contents
          console.error("profile.updatePreferences failed");
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: t(context.locals.locale, "errors.settingsUpdate"),
          });
        }
      },
    }),
    updateCurrency: defineAction({
      accept: "json",
      input: profileUpdateSchema,
      handler: async (input, context) => {
        const client = requireSupabase(context.locals);
        try {
          return await updateDefaultCurrency(client, input);
        } catch (err) {
          // eslint-disable-next-line no-console -- surface server-side action errors in Wrangler tail
          console.error("profile.updateCurrency failed", err);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: t(context.locals.locale, "errors.settingsUpdate"),
          });
        }
      },
    }),
  },
  listShares: {
    status: shareAction("status"),
    create: shareAction("create"),
    disable: shareAction("disable"),
    replace: shareAction("replace"),
  },
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
            message: t(context.locals.locale, "errors.listCreate"),
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
            message: t(context.locals.locale, "errors.listRename"),
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
            message: t(context.locals.locale, "errors.listDelete"),
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
          const defaultCurrency = await getDefaultCurrency(client);
          return await createItem(client, input, defaultCurrency);
        } catch (err) {
          // eslint-disable-next-line no-console -- surface server-side action errors in Wrangler tail
          console.error("items.create failed", err);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: t(context.locals.locale, "errors.itemCreate"),
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
          const defaultCurrency = await getDefaultCurrency(client);
          return await updateItem(client, input, defaultCurrency);
        } catch (err) {
          // eslint-disable-next-line no-console -- surface server-side action errors in Wrangler tail
          console.error("items.update failed", err);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: t(context.locals.locale, "errors.itemUpdate"),
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
            message: t(context.locals.locale, "errors.itemDelete"),
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
            message: t(context.locals.locale, "errors.inviteSelf"),
          });
        }
        try {
          const result = await createInvitation(client, input);
          if (!result.ok) {
            throw new ActionError({
              code: "BAD_REQUEST",
              message: t(context.locals.locale, "errors.inviteDuplicate"),
            });
          }
          const { invitation } = result;
          const origin = new URL(context.request.url).origin;
          const acceptUrl = `${origin}/invitations/accept?invite=${invitation.id}&email=${encodeURIComponent(invitation.email)}`;
          const list = await getListById(client, invitation.list_id);
          const emailSent = await sendInvitationEmail({
            to: invitation.email,
            acceptUrl,
            listTitle: list?.title ?? "a wishlist",
            inviterEmail: context.locals.user?.email ?? "",
          });
          return { invitation, emailSent };
        } catch (err) {
          if (err instanceof ActionError) throw err;
          // eslint-disable-next-line no-console -- surface server-side action errors in Wrangler tail
          console.error("invitations.create failed", err);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: t(context.locals.locale, "errors.inviteSend"),
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
            message: t(context.locals.locale, "errors.inviteRevoke"),
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
                ? t(context.locals.locale, "errors.inviteMismatch")
                : result.reason === "not_confirmed"
                  ? t(context.locals.locale, "errors.inviteNotConfirmed")
                  : result.reason === "not_found"
                    ? t(context.locals.locale, "errors.inviteNotFound")
                    : t(context.locals.locale, "errors.inviteAccept");
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
            message: t(context.locals.locale, "errors.inviteAccept"),
          });
        }
      },
    }),
  },
  reservations: {
    reserve: defineAction({
      accept: "json",
      input: reservationCreateSchema,
      handler: async (input, context) => {
        const client = requireSupabase(context.locals);
        try {
          return await createReservation(client, input);
        } catch (err) {
          if (err instanceof ActionError) throw err;
          const payload = reserveErrorPayload(err);
          if (payload.code === "INTERNAL_SERVER_ERROR") {
            // eslint-disable-next-line no-console -- surface server-side action errors in Wrangler tail
            console.error("reservations.reserve failed", err);
          }
          throw new ActionError({ code: payload.code, message: t(context.locals.locale, payload.message) });
        }
      },
    }),
    release: defineAction({
      accept: "json",
      input: reservationReleaseSchema,
      handler: async (input, context) => {
        const client = requireSupabase(context.locals);
        try {
          await releaseReservation(client, input);
          return { success: true as const };
        } catch (err) {
          // eslint-disable-next-line no-console -- surface server-side action errors in Wrangler tail
          console.error("reservations.release failed", err);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: t(context.locals.locale, "errors.releaseFailed"),
          });
        }
      },
    }),
  },
};
