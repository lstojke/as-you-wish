import { describe, expect, it } from "vitest";
import { buildInvitationEmail } from "./invitation-email";

const input = {
  acceptUrl: "https://example.com/invitations/accept?invite=1&email=a%40b.c",
  listTitle: "Urodziny",
  inviterEmail: "ola@example.com",
};

describe("buildInvitationEmail", () => {
  it("builds a bilingual subject", () => {
    const { subject } = buildInvitationEmail(input);
    expect(subject).toBe(
      "ola@example.com zaprasza Cię do swojej listy życzeń / ola@example.com invited you to a wishlist — AsYouWish",
    );
  });

  it("puts Polish before English in text and html bodies", () => {
    const { text, html } = buildInvitationEmail(input);
    for (const body of [text, html]) {
      const pl = body.indexOf("Przyjmij zaproszenie");
      const en = body.indexOf("Accept the invitation");
      expect(pl).toBeGreaterThanOrEqual(0);
      expect(en).toBeGreaterThan(pl);
    }
    expect(text).toContain(`Przyjmij zaproszenie: ${input.acceptUrl}`);
    expect(text).toContain("„Urodziny”");
  });

  it("escapes interpolated values in html", () => {
    const { html } = buildInvitationEmail({
      ...input,
      listTitle: `<script>alert("x")</script>`,
      inviterEmail: "a&b@example.com",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain("a&amp;b@example.com");
    expect(html).toContain('href="https://example.com/invitations/accept?invite=1&amp;email=a%40b.c"');
  });
});
