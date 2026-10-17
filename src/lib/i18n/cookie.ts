import type { AstroCookies } from "astro";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from "./config";

export function setLocaleCookie(cookies: AstroCookies, locale: Locale, url: URL): void {
  cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    sameSite: "lax",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    secure: url.protocol === "https:",
  });
}
