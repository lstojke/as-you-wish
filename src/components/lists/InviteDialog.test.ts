import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { I18nContext } from "@/components/I18nProvider";
import InviteDialog from "./InviteDialog";

vi.mock("astro:actions", () => ({ actions: {}, isInputError: () => false }));
vi.mock("@/components/ui/dialog", async () => {
  const { createElement } = await import("react");
  const wrapper = ({ children }: { children?: React.ReactNode }) => createElement("div", null, children);
  return {
    Dialog: wrapper,
    DialogContent: wrapper,
    DialogDescription: wrapper,
    DialogFooter: wrapper,
    DialogHeader: wrapper,
    DialogTitle: wrapper,
  };
});

describe("InviteDialog", () => {
  it("renders the email and default viewer role fields when opened", () => {
    const html = renderToStaticMarkup(
      createElement(
        I18nContext.Provider,
        { value: "pl" },
        createElement(InviteDialog, {
          listId: "00000000-0000-4000-8000-000000000001",
          open: true,
          onOpenChange: vi.fn(),
          onInvited: vi.fn(),
        }),
      ),
    );
    expect(html).toContain('type="email"');
    expect(html).toContain("Przeglądający");
  });
});
