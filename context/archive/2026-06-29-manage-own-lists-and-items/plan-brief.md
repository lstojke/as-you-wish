# Manage own lists and items — Plan Brief

> Full plan: `context/changes/manage-own-lists-and-items/plan.md`

## What & Why

Close S-02 by letting a list owner rename and delete their own lists, and edit and delete items on those lists — each behind a confirmation prompt for destructive actions. This is the curation half of the own-data lifecycle; S-01 shipped create, and without S-02 owners are stuck with typos and unwanted lists forever.

## Starting Point

S-01 shipped end-to-end: zod schemas + services + actions for `lists.create` and `items.create`, a `DashboardLists` island with `CreateListDialog`, and a `ListDetail` island with `ItemsList` + `AddItemForm` (`src/components/dashboard/`, `src/components/lists/`). The F-01 RLS policies already authorize owner-only UPDATE and DELETE on both `lists` and `items` (`supabase/migrations/20260527125732_initial_wishlist_schema.sql:202-228`), and `items.list_id` is `on delete cascade` — so deleting a list automatically deletes its items.

## Desired End State

A signed-in owner sees a ⋮ dropdown on every owned list card (and on the list-detail header) with Rename / Delete entries, and a ⋮ dropdown on every item row with Edit / Delete entries. Rename and item-edit open prefilled modals; delete opens an AlertDialog (with cascading-item-count copy on list-delete when items are loaded). All mutations are optimistic with rollback on server error, and a sonner toast confirms outcomes.

## Key Decisions Made

| Decision                              | Choice                                                        | Why (1 sentence)                                                                                                       | Source |
| ------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------ |
| List control placement                | Dropdown menu (⋮) per card + on detail header                 | Scales to S-03 (share) without re-litigating the UI; one mental model for both surfaces.                               | Plan   |
| Item edit UX                          | Per-row dropdown → modal edit                                 | Mirrors the list pattern; reuses `Dialog`; works on mobile; clean rows.                                                | Plan   |
| Reservation collision (PRD OQ 1)      | Defer entirely — S-02 ignores reservations                    | S-05 isn't built; coupling to a table no feature uses yet would violate `main_goal: speed`. S-05 will revisit dialogs. | Plan   |
| List-delete confirmation copy         | Confirm + show item count when known                          | Surfaces blast radius using SSR-loaded data on the detail page; falls back to generic copy on dashboard.               | Plan   |
| Item-edit field scope                 | All four fields (title, price, currency-implicit-USD, link)   | PRD FR-010 carries no carve-out; price typos are the real footgun.                                                     | Plan   |
| Delete optimism                       | Optimistic remove + rollback on error                         | Matches S-01's create flow; failures are rare since RLS pre-validates ownership.                                       | Plan   |
| Edit no-op behavior                   | Short-circuit — don't call action when values are unchanged   | Avoids wasted round-trips and future `updated_at` churn.                                                               | Plan   |
| Phasing                               | 3 phases: backend wiring → list UI → item UI                  | Each phase is independently testable; backend phase enables curl-based verification before any UI work.                | Plan   |

## Scope

**In scope:**

- 4 new mutations: `lists.rename`, `lists.delete`, `items.update`, `items.delete` (schemas + services + actions)
- 2 new shadcn primitives installed: `alert-dialog`, `dropdown-menu`
- 5 new React components: `ListActionsMenu`, `RenameListDialog`, `DeleteListDialog`, `ItemActionsMenu`, `EditItemForm`, `DeleteItemDialog`
- Shared `itemFormSchema` + `ItemFormFields` factored out so `AddItemForm` and `EditItemForm` cannot drift (closes S-01 impl-review F1)
- Optimistic update + rollback for delete (list and item)

**Out of scope:**

- Any reservation-aware logic (PRD Open Question 1 stays open)
- New RLS policies or migrations
- Type-to-confirm friction, undo, soft delete
- Inline-editable rows
- Invitee-side edit/delete surfaces
- Bulk operations, list archive, item reorder, item duplicate

## Architecture / Approach

Pure extension of S-01 patterns: schema → service → action → island. The backend phase (Phase 1) is mechanical mirroring of the create-side surface. The two UI phases (2 + 3) attach overflow menus and dialog state to the existing `DashboardLists`, `ListDetail`, and `ItemsList` components. Cascade delete on the list is enforced by the FK, not by app code — the UI only surfaces the blast radius in copy. Phase 3 starts with a refactor: extract a shared `itemFormSchema` + `ItemFormFields` from `AddItemForm`, then have both the existing add form and the new edit form consume it.

## Phases at a Glance

| Phase                                       | What it delivers                                                                                                | Key risk                                                                                                                                          |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Backend wiring + shadcn primitives       | 4 zod schemas, 4 service functions, 4 actions, shadcn `alert-dialog` + `dropdown-menu` installed                | Plumbing phase has no user-visible value; relies on lint + curl smoke test for verification                                                       |
| 2. List rename + delete UI                  | ⋮ menu on dashboard cards + detail header, rename modal, delete AlertDialog with optimistic remove + rollback   | Click propagation on the ⋮ trigger must not navigate to the card link; rollback insertion-order restoration must remember the original index      |
| 3. Item edit + delete UI                    | ⋮ menu per row, edit modal with no-op short-circuit, delete AlertDialog with optimistic remove + rollback       | `AddItemForm` refactor is a hidden regression risk — Phase 3 manual check 3.4 explicitly retests the create flow                                  |

**Prerequisites:** S-01 (create-list-with-items) shipped and archived. F-01 RLS policies in place (they are). No external dependencies on S-03/S-04/S-05.
**Estimated effort:** ~3 sessions, one per phase. Phase 1 is the shortest (mostly mirroring); Phase 3 carries the refactor risk and the most manual checks.

## Open Risks & Assumptions

- **Assumption**: S-05 (reservations) will revisit S-02's dialogs to add reservation-aware copy/logic. Captured in the "What We're NOT Doing" section of the plan and tracked by PRD Open Question 1.
- **Risk**: The `AddItemForm` refactor in Phase 3 could regress the existing create flow. Mitigated by manual check 3.4 (regression test) and by keeping the existing `itemCreateSchema` action input unchanged.
- **Risk**: Cascade-item-count copy on the dashboard reads "This action cannot be undone." (no count) because item counts are not loaded with the dashboard SSR payload; users on the dashboard get less specific warning than on the detail page. Acceptable for MVP; revisit if users misjudge blast radius.

## Success Criteria (Summary)

- An owner can rename and delete their own lists from the dashboard and the detail page; deleted lists' items are also gone (cascade verified by post-delete refresh).
- An owner can edit any of the four item fields and delete items via the per-row menu, with the optimistic-update behavior matching the create flow.
- Lint + `astro check` pass after each phase; no new RLS policies or migrations land in the repo.
