import { defineMiddleware } from "astro:middleware";
import type { APIContext } from "astro";
import { createClient } from "@/lib/supabase";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "@/lib/i18n/config";
import { setLocaleCookie } from "@/lib/i18n/cookie";
import { getLanguage } from "@/lib/services/profiles";

const PROTECTED_ROUTES = ["/dashboard", "/lists", "/settings"];

// Cookie wins; a signed-in user without a cookie (new device) gets their
// profile language, cached back into the cookie; everyone else gets Polish.
async function resolveLocale(context: APIContext): Promise<Locale> {
  const cookieValue = context.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(cookieValue)) return cookieValue;

  const { user, supabase } = context.locals;
  if (user && supabase) {
    try {
      const language = await getLanguage(supabase, user.id);
      if (language) {
        setLocaleCookie(context.cookies, language, context.url);
        return language;
      }
    } catch (err) {
      // eslint-disable-next-line no-console -- surface in Wrangler tail; locale falls back to default
      console.error("resolveLocale: profile lookup failed", err);
    }
  }
  return DEFAULT_LOCALE;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);
  context.locals.supabase = supabase;

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  context.locals.locale = await resolveLocale(context);

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  const response = await next();
  if (context.url.pathname.startsWith("/_actions/listShares.")) {
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
});
