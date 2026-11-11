import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import DashboardLists from "@/components/dashboard/DashboardLists";
import type { ListRow } from "@/lib/services/lists";
import type { PersonalListGroup } from "@/components/dashboard/group-types";

vi.mock("astro:actions", () => ({
  actions: {},
  isInputError: () => false,
}));

const now = "2026-11-11T00:00:00Z";
const list = (id: string, owner: string): ListRow => ({
  id,
  owner_id: owner,
  title: `List ${id}`,
  created_at: now,
  updated_at: now,
});
const group = (id: string): PersonalListGroup => ({
  id,
  user_id: "me",
  name: `Group ${id}`,
  created_at: now,
  updated_at: now,
});
const props = {
  locale: "en" as const,
  owned: [list("owned", "me"), list("outside", "me")],
  shared: [list("shared", "other")],
  loadError: false,
  groups: [group("christmas"), group("birthday"), group("empty")],
  memberships: [
    { group_id: "christmas", list_id: "owned" },
    { group_id: "christmas", list_id: "shared" },
    { group_id: "christmas", list_id: "revoked" },
    { group_id: "birthday", list_id: "owned" },
  ],
  groupsLoadError: false,
  selectedGroupId: null,
};

describe("personal groups on the dashboard", () => {
  it("opens a group containing owned and shared lists but not unrelated or inaccessible lists", () => {
    const html = renderToStaticMarkup(createElement(DashboardLists, { ...props, selectedGroupId: "christmas" }));
    expect(html).toContain('href="/lists/owned"');
    expect(html).toContain('href="/lists/shared"');
    expect(html).not.toContain('href="/lists/outside"');
    expect(html).not.toContain('href="/lists/revoked"');
  });

  it("keeps empty groups openable and displays an empty-group state", () => {
    const html = renderToStaticMarkup(createElement(DashboardLists, { ...props, selectedGroupId: "empty" }));
    expect(html).toContain("This group is empty.");
    expect(html).not.toContain('id="personal-groups-heading"');
    expect(html).not.toContain('href="/lists/owned"');
  });

  it("hides the groups section when there are no groups but keeps both creation actions", () => {
    const html = renderToStaticMarkup(createElement(DashboardLists, { ...props, groups: [], memberships: [] }));
    expect(html).not.toContain('id="personal-groups-heading"');
    expect(html).toContain("Create group");
    expect(html).toContain("Create list");
  });

  it("shows a menu trigger for each group on the dashboard", () => {
    const html = renderToStaticMarkup(createElement(DashboardLists, props));
    expect(html).toContain('aria-label="Actions for group “Group christmas”"');
    expect(html).not.toContain(">Manage lists<");
  });

  it("shows links for all of a list's groups while preserving dashboard list access", () => {
    const html = renderToStaticMarkup(createElement(DashboardLists, props));
    const card = html.slice(html.indexOf('href="/lists/owned"'), html.indexOf('href="/lists/outside"'));
    expect(card).toContain('href="/dashboard?group=christmas"');
    expect(card).toContain('href="/dashboard?group=birthday"');
    expect(html).toContain('href="/lists/outside"');
  });

  it("does not hide existing lists when group loading fails", () => {
    const html = renderToStaticMarkup(createElement(DashboardLists, { ...props, groupsLoadError: true }));
    expect(html).toContain("We could not load your groups.");
    expect(html).toContain('href="/lists/owned"');
  });

  it("shows a retryable load error instead of an unavailable group on group pages", () => {
    const html = renderToStaticMarkup(
      createElement(DashboardLists, { ...props, groups: [], groupsLoadError: true, selectedGroupId: "christmas" }),
    );
    expect(html).toContain("We could not load your groups.");
    expect(html).toContain("Try again");
    expect(html).not.toContain("This group is unavailable");
  });

  it("does not substitute all lists for an unavailable group", () => {
    const html = renderToStaticMarkup(createElement(DashboardLists, { ...props, selectedGroupId: "missing" }));
    expect(html).toContain("This group is unavailable");
    expect(html).not.toContain('href="/lists/owned"');
  });
});
