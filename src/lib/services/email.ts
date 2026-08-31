import { RESEND_API_KEY, RESEND_FROM } from "astro:env/server";

interface SendInvitationEmailInput {
  to: string;
  acceptUrl: string;
  listTitle: string;
  inviterEmail: string;
}

// Edge-compatible (fetch-based) Resend transport. Returns false and never
// throws so a delivery failure never rolls back the already-persisted
// invitation row — the caller surfaces emailSent to warn the owner.
export async function sendInvitationEmail(input: SendInvitationEmailInput): Promise<boolean> {
  if (!RESEND_API_KEY || !RESEND_FROM) {
    // eslint-disable-next-line no-console -- surface missing config in Wrangler tail
    console.warn("sendInvitationEmail skipped: RESEND_API_KEY/RESEND_FROM unset");
    return false;
  }

  const { to, acceptUrl, listTitle, inviterEmail } = input;
  const subject = `${inviterEmail} invited you to a wishlist on AsYouWish`;
  const text = `${inviterEmail} invited you to view their list "${listTitle}" on AsYouWish.\n\nAccept the invitation: ${acceptUrl}\n\nIf you weren't expecting this, you can ignore this email.`;
  const html =
    `<p>${escapeHtml(inviterEmail)} invited you to view their list &ldquo;${escapeHtml(listTitle)}&rdquo; on AsYouWish.</p>` +
    `<p><a href="${escapeHtml(acceptUrl)}">Accept the invitation</a></p>` +
    `<p>If you weren't expecting this, you can ignore this email.</p>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: RESEND_FROM, to, subject, html, text }),
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
