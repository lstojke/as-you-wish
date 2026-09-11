import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

// Only allow returning to the accept route; anything else falls back to "/".
// Guards against open-redirect (e.g. "//evil.com", "https://evil.com").
function safeReturnPath(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "/";
  return /^\/invitations\/accept(?:[/?#]|$)/.test(value) ? value : "/";
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;
  const returnTo = safeReturnPath(form.get("return"));

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Supabase is not configured")}`);
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect(returnTo);
};
