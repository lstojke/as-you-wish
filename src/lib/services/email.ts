import { RESEND_API_KEY, RESEND_FROM } from "astro:env/server";
import { buildInvitationEmail, type InvitationEmailInput } from "@/lib/services/invitation-email";

interface SendInvitationEmailInput extends InvitationEmailInput {
  to: string;
}

// Edge-compatible (fetch-based) Resend transport. Returns false and never
// throws so a delivery failure never rolls back the already-persisted
// invitation row - the caller surfaces emailSent to warn the owner.
export async function sendInvitationEmail(input: SendInvitationEmailInput): Promise<boolean> {
  if (!RESEND_API_KEY || !RESEND_FROM) {
    // eslint-disable-next-line no-console -- surface missing config in Wrangler tail
    console.warn("sendInvitationEmail skipped: RESEND_API_KEY/RESEND_FROM unset");
    return false;
  }

  const { subject, text, html } = buildInvitationEmail(input);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: RESEND_FROM, to: input.to, subject, html, text }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      // eslint-disable-next-line no-console -- surface delivery failures in Wrangler tail
      console.error("sendInvitationEmail failed", response.status, detail);
      return false;
    }
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console -- surface delivery failures in Wrangler tail
    console.error("sendInvitationEmail threw", err);
    return false;
  }
}
