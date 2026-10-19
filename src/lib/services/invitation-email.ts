import { LOCALES, t, type Locale } from "@/lib/i18n";

export interface InvitationEmailInput {
  acceptUrl: string;
  listTitle: string;
  inviterEmail: string;
}

export interface InvitationEmail {
  subject: string;
  text: string;
  html: string;
}

// Invitees have no known locale, so the email carries every language
// (Polish first), separated by a divider.
export function buildInvitationEmail({ acceptUrl, listTitle, inviterEmail }: InvitationEmailInput): InvitationEmail {
  const locales: readonly Locale[] = LOCALES;
  const subject = `${locales.map((l) => t(l, "email.invitation.subject", { inviter: inviterEmail })).join(" / ")} - AsYouWish`;

  const text = locales
    .map((l) =>
      [
        t(l, "email.invitation.intro", { inviter: inviterEmail, list: listTitle }),
        `${t(l, "email.invitation.cta")}: ${acceptUrl}`,
        t(l, "email.invitation.ignore"),
      ].join("\n\n"),
    )
    .join("\n\n----------\n\n");

  const html = locales
    .map(
      (l) =>
        `<div lang="${l}">` +
        `<p>${t(l, "email.invitation.intro", { inviter: escapeHtml(inviterEmail), list: escapeHtml(listTitle) })}</p>` +
        `<p><a href="${escapeHtml(acceptUrl)}">${escapeHtml(t(l, "email.invitation.cta"))}</a></p>` +
        `<p>${escapeHtml(t(l, "email.invitation.ignore"))}</p>` +
        `</div>`,
    )
    .join("<hr />");

  return { subject, text, html };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
