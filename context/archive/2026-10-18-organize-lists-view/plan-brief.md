# Organized lists view - Plan brief

> Full plan: `context/changes/organize-lists-view/plan.md`

## What & Why

Organize the dashboard into My lists and Shared lists tabs.
Compact side-by-side tiles reduce scrolling, including on phones.

## Starting Point

The dashboard already has tile grids, but categories are stacked and phones use one column.
Creation and owned-list mutations already use local optimistic state; no data-layer work is needed.

## Desired End State

Keep the app bar and page heading, with the tabs below the heading.
My lists opens by default; Shared lists remains available even when empty.
Both panels use two columns on phones/tablets and three on desktop.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Placement | Heading before tabs | Preserve the page hierarchy |
| Initial selection | Always My lists; no persistence | Predictable entry behavior |
| Empty shared category | Visible tab with explanatory message | Stable navigation |
| Tile density | Two phone/tablet columns, three desktop | Reduce scrolling |
| Content width | Existing centered max-w-5xl | Keep the current page width |
| Creation | Only inside My lists | Clear owned-list context |
| Accessibility | Standard shadcn tabs; sibling link/menu controls | Keyboard semantics without nested interactive elements |
| Data | Preserve arrays, ordering, actions, and RLS | UI-only change |

## Scope

**In scope:** Tab panels and empty states, compact local tile styles,
wrapping titles, accessible focus/navigation, and unchanged optimistic mutations.

**Out of scope:** Search, sorting, previews, counts, pagination, persisted tabs,
backend/schema changes, new test frameworks, and the pending add-item change.

## Architecture / Approach

Add Tabs using the shadcn CLI. DashboardLists retains its state and dialogs,
placing the existing categories into accessible panels.
Tile links and owner menu buttons become siblings; responsive styling stays local.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Tabbed dashboard with compact list tiles | Complete UI organization and density change | Narrow cards must preserve title readability and usable actions |

**Prerequisites:** Existing local environment; owner/shared accounts for manual checks.
**Estimated effort:** One small implementation session plus manual acceptance.

## Open Risks & Assumptions

- Two phone columns intentionally trade title space for reduced scrolling.
- Verify 320px, zoom, keyboard, and assistive-technology behavior in a browser.
- Unrelated add-item work remains uncommitted and must stay outside this change.

## Success Criteria (Summary)

- Tabs separate owned/shared content, with correct creation and empty states.
- Tiles meet the approved column counts without overflow or inaccessible controls.
- Existing navigation, mutations, rollback, loading errors, and shared access remain intact.
