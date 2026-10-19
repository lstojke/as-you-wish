import type { APIRoute } from "astro";
import { localeSchema } from "@/lib/i18n/config";
import { setLocaleCookie } from "@/lib/i18n/cookie";
import { safeLocalPath } from "@/lib/safe-return-path";
import { updateLanguage } from "@/lib/services/profiles";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const returnTo = safeLocalPath(form.get("return"));
  const parsed = localeSchema.safeParse(form.get("locale"));

  if (parsed.success) {
    const locale = parsed.data;
    setLocaleCookie(context.cookies, locale, context.url);

    const { user, supabase } = context.locals;
    if (user && supabase) {
      try {
        await updateLanguage(supabase, user.id, locale);
      } catch (err) {
        // eslint-disable-next-line no-console -- cookie already set; profile sync is best-effort
        console.error("POST /api/locale: profile update failed", err);
      }
    }
  }

  return context.redirect(returnTo, 303);
};
