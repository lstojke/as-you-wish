# Organized lists view implementation plan

## Overview

Replace the dashboard's stacked owned/shared sections with accessible My lists and Shared lists tabs below the existing page heading. Show lists in compact two-column tiles even on phones, increasing to three columns on desktop, to reduce scrolling without changing data or permissions.

## Current State Analysis

- `src/pages/dashboard.astro:30-40` places the heading below AppHeader and mounts DashboardLists in a centered `max-w-5xl` container with responsive padding. Preserve this layout and the intentional `client:only="react"` boundary.
- `src/components/dashboard/DashboardLists.tsx:8-38` receives `owned`, `shared`, and `loadError`; owned lists have local optimistic state, while shared lists are supplied as props.
- `DashboardLists.tsx:44-66` presents load failures as an alert with a reload action. A failed load must not become an empty category.
- `DashboardLists.tsx:69-130` renders two stacked sections; Shared with me currently disappears when empty. Both already use one/two/three-column responsive grids.
- `DashboardLists.tsx:174-205` defines owned and shared tiles locally. Titles are truncated; owned tiles wrap the menu trigger inside a navigation anchor.
- `src/components/dashboard/ListActionsMenu.tsx:16-43` includes a 36px icon trigger and navigation-prevention handling for that nested anchor. Keep this shared component's behavior compatible with other consumers.
- Owned create, rename, delete, and rollback already update local state; creation prepends, replacement preserves position, and failed deletion restores the original index (`DashboardLists.tsx:20-38,143-169`).
- `src/lib/services/lists.ts:9-33` supplies existing ListRow arrays ordered by creation date. Shared reads depend on direct lists-select RLS, not an invitations join.
- Card primitives exist in `src/components/ui/card.tsx`. Tabs are not installed and must be added using the shadcn CLI.
- `vitest.config.ts` separates Node-only unit tests from Supabase integration tests. No dashboard component harness exists.

## Desired End State

The app bar and “Your wish lists” heading remain in place. Immediately below the heading, the dashboard displays exactly two tabs: “My lists” and “Shared lists.” Each entry to the dashboard starts on My lists; selection is local and is neither persisted nor stored in the URL. Tabs remain visible even if a category is empty.

Only the active panel is exposed to keyboard navigation and assistive technology. The tabs support standard Radix keyboard selection, visible focus, and tab-to-panel labeling. Switching tabs uses already-fetched arrays and does not issue requests.

Both categories use two tile columns from a 320px viewport through tablet sizes and three from the existing desktop breakpoint (1024px). Keep the current container width. Reduce mobile spacing/padding as needed, allow long titles to wrap and break, and retain usable action targets rather than shrinking text or buttons. Empty states span the panel width rather than occupying a tile column.

My lists retains the existing create affordance and first-list empty state. Shared lists has no create or owner mutation controls; when empty it explains, “No shared lists yet. Lists shared with you will appear here.” Owned tile menus must not navigate when opened or used.

### Key Discoveries

- This is a presentation change: no new query, API, DTO, migration, or permission rule is required.
- The current grid already provides side-by-side desktop tiles; the meaningful density change is two columns on narrow screens.
- At 320px with current 16px outer padding, each tile is approximately 136px wide with a 16px grid gap. Mobile padding and internal layout need deliberate adjustment.
- Separating card navigation and menu controls addresses an existing accessibility problem directly relevant to the new compact layout.

## What We're NOT Doing

- Changing list data, authorization, shared membership rules, query ordering, or SSR retry/error behavior.
- Adding search, filtering, sorting, counts, previews, images, pagination, drag-and-drop, or user-selectable layouts.
- Persisting tabs or adding routes, query parameters, badges, or automatic switching to a nonempty category.
- Moving Create list outside My lists or changing dialog submission behavior.
- Widening the page, changing list-detail layout, or altering shared global card styles.
- Adding a component-test framework or modifying the unrelated pending refactor-adding-item work.

## Implementation Approach

Use the standard shadcn Tabs component backed by the existing Radix dependency. Keep DashboardLists as the owner of its existing local list/dialog state and compose its owned/shared content into tab panels. Default selection to My lists without introducing storage or URL state.

Keep the owned empty hero and create button logic, replacing the shared conditional section with an always-available Shared lists panel and explicit empty state. Leave mutation dialogs outside inactive panels so tab mounting cannot destroy their state or optimistic callbacks.

Apply compact responsive styles locally to DashboardLists tiles: two equal, shrinkable columns on phones/tablets, three on desktop, wrapped titles, and sufficient room for actions. Make owned navigation and actions sibling interactive elements inside a card instead of nesting the menu button in an anchor. Preserve the visible tile navigation affordance and accessible “Open list …” and “Actions for list …” labels.

## Critical Implementation Details

### User experience spec

Two phone columns are an explicit user choice despite the reduced title space. Verify at 320px and 200% zoom; do not silently restore a single phone column or solve overflow by hiding meaningful controls. Full titles must remain available to assistive technology and visually wrap without covering the menu.

### State sequencing

Continue deriving owned content from live local state, not the initial props, so tab switches preserve optimistic mutations. Keep existing rollback indices and replacement IDs intact. A load failure takes precedence over tabs/empty states; it must not be presented as an empty result.

## Phase 1: Tabbed dashboard with compact list tiles

### Overview

Deliver the tabbed organization, compact layout, and directly related keyboard/card interaction improvements as one UI-only phase.

### Changes Required

#### 1. Standard tab primitive

**Files**: `src/components/ui/tabs.tsx`; `package.json` and `package-lock.json` only if changed by the generator

**Intent**: Reuse standard accessible tab behavior rather than hand-writing roles, roving focus, and keyboard handling.

**Contract**: Add the component with `npx shadcn@latest add tabs`, inspect the generated diff, and retain only required changes. Export the usual Tabs, TabsList, TabsTrigger, and TabsContent primitives using repository conventions. Do not manually update unrelated dependencies or existing primitives.

#### 2. Dashboard panels, states, and tiles

**File**: `src/components/dashboard/DashboardLists.tsx`

**Intent**: Separate owned and shared lists into predictable tabs and reduce phone scrolling while retaining list navigation and actions.

**Contract**: Preserve the Props signature, mutation callbacks, local owned state, dialogs, and load-error alert. Default to My lists on initial mount. Render both tab triggers, active-only content, the existing owned create/empty-state experience, and a full-width shared empty state. Use two columns below 1024px and three from 1024px, within the unchanged container; confine mobile card spacing/title changes to this component. Owned card links and menu triggers become siblings, retain accessible names and visible focus, and do not interfere with one another. No changes to service queries or shared ListActionsMenu behavior are required.

#### 3. Existing page boundary

**File**: `src/pages/dashboard.astro` (expected unchanged)

**Intent**: Preserve the approved heading-first hierarchy, centered width, and SSR data boundary.

**Contract**: Keep AppHeader, heading, `max-w-5xl`, existing padding, data-fetch/retry logic, and client-only island props unchanged. Do not move tabs into a second island.

### Success Criteria

#### Automated Verification

- Existing unit suite passes: `npm run test:unit`.
- Focused lint passes: `npx eslint src/components/dashboard/DashboardLists.tsx src/components/ui/tabs.tsx`.
- Astro sync and checking pass: `npx astro sync && npx astro check`.
- Production build passes with existing local environment configuration: `npm run build`.

#### Manual Verification

- Heading precedes My lists and Shared lists tabs; My lists is initially selected on a fresh dashboard entry, and changing tabs does not reload or fetch data.
- Both tabs remain visible for neither/owned-only/shared-only/both data combinations; each empty panel presents its appropriate message, and creation is available only within My lists.
- Tab, Shift+Tab, arrow keys, Home/End, and screen-reader labeling work; inactive content is not focusable or exposed, and selected/focused tabs remain visually distinguishable.
- At 320px and tablet widths, populated panels show two columns; from 1024px they show three, within the original centered width; long/unbroken titles, 200% zoom, and empty states do not cause horizontal overflow or hide controls.
- Owned tile navigation and menu opening, Rename, and Delete work independently with pointer and keyboard; shared tiles navigate and expose no owner actions.
- Creating prepends one list, rename updates its tile, deletion removes it, and failed operations roll back correctly; state and order survive tab switching.
- A controlled load failure still displays the alert and retry action, not empty panels; retry behavior is unchanged.
- Existing add-item changes and list-detail behavior remain untouched by this implementation.

**Implementation Note**: After automated verification passes, pause for human confirmation of the manual checklist before the phase-end commit.

## Testing Strategy

### Automated

Run existing unit tests rather than claiming they cover browser tab behavior. Use focused lint, Astro checking, and production build for generated component imports and prop compatibility. No Supabase integration run is required because queries, actions, and schemas do not change; use existing environment configuration without committing secrets.

### Manual

Use owner and shared-member accounts with zero, one, and multiple lists in each category. Include long titles and enough lists to compare tile density. Exercise all manual criteria above, including keyboard-only navigation and browser accessibility-tree inspection for tab/panel labels and hidden content. Verify failures with controlled local requests, not changes to production permissions or data.

## Performance Considerations

Both arrays are already fetched before hydration. Tab switching must remain local, without refetching, sorting, or replacing the dashboard island. Use the existing Radix dependency through shadcn and avoid additional layout/state libraries.

## Migration Notes

No schema, data, environment, or API migration. Reverting the dashboard/tab changes restores stacked sections without conversion. Preserve unrelated dirty files, particularly the pending refactor-adding-item implementation, and exclude them from this change's staging set.

## References

- Intent: `context/changes/organize-lists-view/change.md`
- Dashboard shell and data boundary: `src/pages/dashboard.astro:30-40`
- State and mutation callbacks: `src/components/dashboard/DashboardLists.tsx:8-38,143-169`
- Error branch and current grids: `src/components/dashboard/DashboardLists.tsx:44-130`
- Tile composition: `src/components/dashboard/DashboardLists.tsx:174-205`
- Menu event handling: `src/components/dashboard/ListActionsMenu.tsx:16-43`
- Existing card primitives: `src/components/ui/card.tsx`
- Shared query/RLS contract: `src/lib/services/lists.ts:9-33`
- Original sections decision: `context/archive/2026/05-28-create-list-with-items/plan-brief.md:23-28`
- Accepted shared-query and UI rules: `context/foundation/lessons.md`
- Test projects: `vitest.config.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Tabbed dashboard with compact list tiles

#### Automated

- [x] 1.1 Existing unit suite passes: `npm run test:unit`. — 50d1c05
- [x] 1.2 Focused lint passes: `npx eslint src/components/dashboard/DashboardLists.tsx src/components/ui/tabs.tsx`. — 50d1c05
- [x] 1.3 Astro sync and checking pass: `npx astro sync && npx astro check`. — 50d1c05
- [x] 1.4 Production build passes with existing local environment configuration: `npm run build`. — 50d1c05

#### Manual

- [x] 1.5 Heading precedes My lists and Shared lists tabs; My lists is initially selected on a fresh dashboard entry, and changing tabs does not reload or fetch data. — 50d1c05
- [x] 1.6 Both tabs remain visible for neither/owned-only/shared-only/both data combinations; each empty panel presents its appropriate message, and creation is available only within My lists. — 50d1c05
- [x] 1.7 Tab, Shift+Tab, arrow keys, Home/End, and screen-reader labeling work; inactive content is not focusable or exposed, and selected/focused tabs remain visually distinguishable. — 50d1c05
- [x] 1.8 At 320px and tablet widths, populated panels show two columns; from 1024px they show three, within the original centered width; long/unbroken titles, 200% zoom, and empty states do not cause horizontal overflow or hide controls. — 50d1c05
- [x] 1.9 Owned tile navigation and menu opening, Rename, and Delete work independently with pointer and keyboard; shared tiles navigate and expose no owner actions. — 50d1c05
- [x] 1.10 Creating prepends one list, rename updates its tile, deletion removes it, and failed operations roll back correctly; state and order survive tab switching. — 50d1c05
- [x] 1.11 A controlled load failure still displays the alert and retry action, not empty panels; retry behavior is unchanged. — 50d1c05
- [x] 1.12 Existing add-item changes and list-detail behavior remain untouched by this implementation. — 50d1c05
