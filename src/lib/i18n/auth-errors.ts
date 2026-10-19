import type { Locale } from "./config";
import { t } from "./index";

export const AUTH_ERROR_CODES = [
  "invalid_credentials",
  "email_not_confirmed",
  "user_already_exists",
  "weak_password",
  "email_address_invalid",
  "over_email_send_rate_limit",
  "over_request_rate_limit",
  "signup_disabled",
  "not_configured",
  "unknown",
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export function isAuthErrorCode(value: unknown): value is AuthErrorCode {
  return typeof value === "string" && (AUTH_ERROR_CODES as readonly string[]).includes(value);
}

// Maps a Supabase AuthError to a stable code safe to put in a redirect URL.
export function authErrorCode(error: { code?: string } | null | undefined): AuthErrorCode {
  const code = error?.code;
  if (code === "user_already_registered") return "user_already_exists";
  if (code === "email_exists") return "user_already_exists";
  return isAuthErrorCode(code) ? code : "unknown";
}

// Translates the `?error=` query value; anything unrecognized becomes the generic message.
export function authErrorMessage(locale: Locale, raw: string | null): string | null {
  if (!raw) return null;
  return t(locale, `auth.errors.${isAuthErrorCode(raw) ? raw : "unknown"}`);
}
