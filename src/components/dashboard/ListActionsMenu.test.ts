import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { I18nContext } from "@/components/I18nProvider";
import ListActionsMenu from "./ListActionsMenu";

vi.mock("@/components/ui/dropdown-menu", async () => {
  const { createElement } = await import("react");
  const wrapper = ({ children }: { children?: React.ReactNode }) => createElement("div", null, children);
  return {
    DropdownMenu: wrapper,
    DropdownMenuTrigger: wrapper,
    DropdownMenuContent: wrapper,
    DropdownMenuItem: wrapper,
  };
});

describe("list action permissions", () => {
  it("offers rename but not delete without an owner delete handler", () => {
    const html = renderToStaticMarkup(
      createElement(
        I18nContext.Provider,
        { value: "en" },
        createElement(ListActionsMenu, { listTitle: "Gifts", onRename: vi.fn() }),
      ),
    );
    expect(html).toContain("Rename");
    expect(html).not.toContain("Delete");
  });
});
