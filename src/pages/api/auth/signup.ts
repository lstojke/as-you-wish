import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { authErrorCode } from "@/lib/i18n/auth-errors";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signup?error=not_configured`);
  }
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return context.redirect(`/auth/signup?error=${authErrorCode(error)}`);
  }

  return context.redirect("/auth/confirm-email");
};
