import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ListDetail from "./ListDetail";
import type { ListRole, ListRow } from "@/lib/services/lists";
import type { ItemRow } from "@/lib/services/items";

vi.mock("astro:actions", () => ({ actions: {}, isInputError: () => false }));

const now = "2026-11-22T00:00:00Z";
const list: ListRow = { id: "list", owner_id: "owner", title: "Gifts", created_at: now, updated_at: now };
const item: ItemRow = {
  id: "item",
  list_id: list.id,
  title: "Book",
  notes: null,
  link: null,
  price_cents: null,
  currency: null,
  created_at: now,
  updated_at: now,
};

function render(role: ListRole) {
  return renderToStaticMarkup(
    createElement(ListDetail, {
      locale: "en",
      role,
      list,
      initialItems: [item],
      reservedItemIds: [],
      myReservedItemIds: [],
      initialInvitations: [],
      defaultCurrency: "PLN",
    }),
  );
}

describe("list role controls", () => {
  it("allows owners to edit and manage access without reservation controls", () => {
    const html = render("owner");
    expect(html).toContain('aria-label="Add item"');
    expect(html).toContain("Actions for item Book");
    expect(html).toContain("Actions for list Gifts");
    expect(html).toContain(">Invite<");
    expect(html).toContain(">Share link<");
    expect(html).not.toContain(">Reserve<");
  });

  it("allows collaborators to edit and reserve, but not manage access", () => {
    const html = render("collaborator");
    expect(html).toContain('aria-label="Add item"');
    expect(html).toContain("Actions for item Book");
    expect(html).toContain("Actions for list Gifts");
    expect(html).toContain(">Reserve<");
    expect(html).not.toContain(">Invite<");
    expect(html).not.toContain(">Share link<");
  });

  it("leaves viewers with reservations but no editor controls", () => {
    const html = render("viewer");
    expect(html).toContain(">Reserve<");
    expect(html).not.toContain('aria-label="Add item"');
    expect(html).not.toContain("Actions for item Book");
    expect(html).not.toContain("Actions for list Gifts");
    expect(html).not.toContain(">Invite<");
    expect(html).not.toContain(">Share link<");
  });
});
