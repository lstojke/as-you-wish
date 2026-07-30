# Manage own lists and items — Implementation Plan

## Overview

Give a signed-in list owner the ability to rename and delete their own lists, and edit and delete items on those lists, each behind a confirmation prompt for destructive actions. This closes S-02 (FR-006, FR-007, FR-010, FR-011) by adding four new mutations (`lists.rename`, `lists.delete`, `items.update`, `items.delete`) on top of the S-01 schema + action surface. No database migration is required — owner-only RLS for `update` and `delete` on both `lists` and `items` already exists from F-01.

## Current State Analysis

S-01 shipped the create-side surface end-to-end:

- **Schemas** (`src/lib/schemas/wishlist.ts:3-29`): `listCreateSchema` (title trim/min/max) and `itemCreateSchema` (title, optional priceCents, optional currency, optional http(s) link with `.refine`) — plus a cross-field refine that ties currency to priceCents.
- **Services** (`src/lib/services/lists.ts:9-57`, `src/lib/services/items.ts:11-38`): `createList`, `listOwnedAndShared`, `getListById`, `createItem`, `listItems`. All take `Client = SupabaseClient<Database>`, return the typed Row (or array), throw on Supabase error. `createItem` defaults currency to `"USD"` when `priceCents` is set and currency is omitted (`src/lib/services/items.ts:9,22`).
- **Actions** (`src/actions/index.ts:6-61`): `requireSupabase` gates `locals.supabase` + `locals.user`; each action wraps the service call in `try/catch`, logs via `console.error("<action> failed", err)`, and throws `ActionError({ code: "INTERNAL_SERVER_ERROR", message })`. Field validation surfaces via `isInputError` on the client.
- **Dashboard** (`src/components/dashboard/DashboardLists.tsx`, `CreateListDialog.tsx`): owned + shared lists rendered as `ListCard`s; `CreateListDialog` uses react-hook-form + zodResolver + sonner toast + the `crypto.randomUUID()` optimistic placeholder/replace pattern.
- **List detail** (`src/pages/lists/[id].astro`, `src/components/lists/ListDetail.tsx`, `ItemsList.tsx`, `AddItemForm.tsx`): SSR loads list + items, hands to a `client:only="react"` island; the add-item form has a local `addItemFormSchema` that takes `priceInput` (string) and converts to `priceCents` before calling `actions.items.create`.
- **RLS** (`supabase/migrations/20260527125732_initial_wishlist_schema.sql:191-228`): `lists` UPDATE/DELETE both gated on `owner_id = auth.uid()`; `items` UPDATE/DELETE both gated on `is_list_owner(list_id)`. **All four S-02 mutations are already authorized by these policies — no policy work in this slice.**
- **Cascade**: `items.list_id → lists.id` is `on delete cascade` (`20260527125732_initial_wishlist_schema.sql:38-46`), so deleting a list will atomically delete its items in the database. The UI just needs to surface the blast radius.
- **shadcn/ui installed** (`src/components/ui/`): button, card, dialog, form, input, label, skeleton, sonner. **Not installed**: `alert-dialog` (needed for destructive confirms) and `dropdown-menu` (needed for per-card and per-row action menus).
- **Verification**: no test runner is configured. Automated verification means `npm run lint` and `astro check`; everything else is manual.

## Desired End State

A signed-in user looking at their dashboard or a list-detail page they own can:

- Open an overflow (⋮) menu on any of their own list cards (and on the detail-page header) with **Rename** and **Delete** entries.
- Rename opens a modal that mirrors `CreateListDialog` (prefilled with the current title) and saves via `actions.lists.rename`; the new title appears on the card/header without a page reload.
- Delete opens an AlertDialog whose body, when items are loaded, mentions the cascading item count ("Delete '<name>'? This will also delete <N> items. This cannot be undone."); confirming fires `actions.lists.delete`. On the dashboard the card disappears optimistically; on the detail page the user is navigated back to `/dashboard` with a success toast.
- On the list-detail page, open an overflow (⋮) menu on each item row with **Edit** and **Delete** entries.
- Edit opens a modal showing all four item fields (title, price, currency-implicit-USD, link) prefilled from the row; saving fires `actions.items.update`; if nothing changed, the modal closes silently without an action call.
- Delete opens an AlertDialog and on confirm removes the item optimistically; on a server error the row is restored at its original position and a toast surfaces the failure.

Verification:

- `npm run lint` and `npx astro check` pass.
- A manual UI walk through the eight flows above succeeds for the owner.
- A second user (invitee on a shared list, when S-03 ships) does **not** see edit/delete controls; until then, sign-in as a non-owner is not reachable for an owned list, so this is verified by code-reading the conditional render (`list.owner_id === locals.user.id`).

### Key Discoveries

- **RLS is already complete for all four mutations** (`supabase/migrations/20260527125732_initial_wishlist_schema.sql:202-228`). The plan does not touch SQL.
- **Cascade delete is enforced by the foreign key**, not by app code (`supabase/migrations/20260527125732_initial_wishlist_schema.sql:38-46`). The UI's only job is to surface the blast radius in the confirmation copy.
- **`addItemFormSchema` lives locally in `AddItemForm.tsx`** (`src/components/lists/AddItemForm.tsx:12-24`) because it accepts `priceInput: string` and validates as a parseable float — the server schema takes `priceCents: number`. Phase 3 must factor a shared `ItemFormFields` component + shared form schema so the create and edit forms cannot drift (caught as F1 in the S-01 impl-review: `context/archive/2026-05-28-create-list-with-items/reviews/impl-review-phase-4.md`).
- **Lessons priors apply**: every URL field (item edit included) must keep the `https?://` refine; every list-read service that touches non-owner lists must keep `lists_select` RLS in the loop (no impact on S-02 since this slice writes own rows only).
- **No new protected routes**: `/dashboard` and `/lists/*` are already in `PROTECTED_ROUTES` (`src/middleware.ts:4`).

## What We're NOT Doing

- **No reservation-collision logic.** PRD Open Question 1 stays open. S-02 does not query the reservations table; AlertDialog copy does not mention reservations. S-05's plan will revisit edit/delete dialogs and layer in any reservation-aware behavior at that time.
- **No new RLS policies.** Owner-only update/delete is already enforced by F-01.
- **No new database migrations.**
- **No item-reorder, item-duplicate, list-archive, or bulk-delete UX.**
- **No type-to-confirm friction** on delete dialogs; a simple AlertDialog is enough for a private family circle.
- **No undo / soft-delete.** Cascade deletion is permanent.
- **No inline-editable rows.** Item edit goes through the modal.
- **No edit/delete from invitee surfaces.** S-02 is owner-only; invitees become a concern in S-03 / S-04, but the conditional render (`list.owner_id === user.id`) is wired now so it's correct when those slices ship.
- **No `updated_at` column work.** The schema does not currently track row-level update timestamps; adding one is out of scope.

## Implementation Approach

Three phases, in dependency order:

1. **Backend wiring + shadcn primitives** lands every schema, service function, and action plus the two missing shadcn components. No UI behavior changes; success is verified via lint + astro check and (optionally) a curl smoke test of one action through `/_actions/`.
2. **List rename + delete UI** consumes the Phase 1 backend on the dashboard cards and the list-detail header.
3. **Item edit + delete UI** does the same on each item row. The first work in this phase is to extract the shared `itemFormSchema` + `ItemFormFields` component from `AddItemForm.tsx`, then both the existing `AddItemForm` and the new `EditItemForm` consume it. This closes the S-01 impl-review F1 drift risk.

The optimistic-update pattern stays the same as S-01: maintain local state in the React island, mutate immediately on user action, swap to the server response on success, restore to the prior state and surface a `toast.error` on failure. Delete needs one new wrinkle — remember the original index so the row can be reinserted at the right position on rollback.

## Phase 1: Backend wiring + shadcn primitives

### Overview

Install the two missing shadcn components and add every schema, service function, and action needed by Phases 2 and 3. After this phase, the four new mutations are callable from a client (and via curl); no user-visible UI changes yet.

### Changes Required

#### 1. shadcn primitives

**Files**: `src/components/ui/alert-dialog.tsx`, `src/components/ui/dropdown-menu.tsx` (new — generated by shadcn CLI)

**Intent**: Bring in the two shadcn primitives needed by Phases 2/3. Install via the CLI rather than hand-rolling, per AGENTS.md.

**Contract**: Run `npx shadcn@latest add alert-dialog dropdown-menu`. Accept whatever the generator writes — both are standard Radix wrappers in the "new-york" style this repo uses. No edits to the generated files in this phase.

#### 2. Update & delete schemas

**File**: `src/lib/schemas/wishlist.ts`

**Intent**: Add four schemas backing the new actions, plus extract a shared item-form schema and mapper so the existing `AddItemForm` and the new `EditItemForm` cannot drift on validation rules.

**Contract**:

- `listRenameSchema = z.object({ listId: z.uuid(), title: z.string().trim().min(1).max(200) })` plus `ListRenameInput`.
- `listDeleteSchema = z.object({ listId: z.uuid() })` plus `ListDeleteInput`.
- `itemUpdateSchema` — same field shape and refines as `itemCreateSchema` (title, priceCents, currency, link with `https?://` refine, currency-requires-price cross-field refine), but keyed on `itemId: z.uuid()` instead of `listId`. Export `ItemUpdateInput`.
- `itemDeleteSchema = z.object({ itemId: z.uuid() })` plus `ItemDeleteInput`.
- **Factor a shared `itemFormSchema`** — a single zod schema describing the client-form shape (`title: string`, `priceInput: string` parseable as non-negative float, `link: string` with the `https?://` refine), plus a `mapItemFormToCreate(listId, values)` helper that produces `ItemCreateInput` and a `mapItemFormToUpdate(itemId, values)` helper that produces `ItemUpdateInput`. Export the schema and the inferred `ItemFormValues` type. Keep the existing `itemCreateSchema` shape unchanged so the action input contract stays stable.

#### 3. Service functions

**File**: `src/lib/services/lists.ts`

**Intent**: Add `updateList` (rename) and `deleteList` mirroring the shape of `createList`.

**Contract**:

- `updateList(client: Client, input: ListRenameInput): Promise<ListRow>` — calls `client.from("lists").update({ title: input.title }).eq("id", input.listId).select("*").single()`; throws on error. RLS denies non-owner update so no manual ownership check is needed.
- `deleteList(client: Client, input: ListDeleteInput): Promise<void>` — calls `client.from("lists").delete().eq("id", input.listId)`; throws on error. Cascade is enforced by the FK on `items.list_id`.

**File**: `src/lib/services/items.ts`

**Intent**: Add `updateItem` and `deleteItem` following the create shape and reusing the same default-currency logic from `createItem`.

**Contract**:

- `updateItem(client: Client, input: ItemUpdateInput): Promise<ItemRow>` — computes currency the same way `createItem` does (`src/lib/services/items.ts:22`): if `priceCents !== undefined` then `currency ?? DEFAULT_CURRENCY`, else `currency ?? null`. Calls `.update({...}).eq("id", input.itemId).select("*").single()`. Throws on error.
- `deleteItem(client: Client, input: ItemDeleteInput): Promise<void>` — calls `.delete().eq("id", input.itemId)`; throws on error.

#### 4. Actions

**File**: `src/actions/index.ts`

**Intent**: Wire the four new actions following the exact `requireSupabase` + try/catch + `console.error` + `ActionError` shape used by `lists.create` and `items.create`.

**Contract**: Add to the existing `server` export:

- `lists.rename` — `input: listRenameSchema`, handler calls `updateList`, message on failure: `"Could not rename list"`.
- `lists.delete` — `input: listDeleteSchema`, handler calls `deleteList`, message: `"Could not delete list"`.
- `items.update` — `input: itemUpdateSchema`, handler calls `updateItem`, message: `"Could not update item"`.
- `items.delete` — `input: itemDeleteSchema`, handler calls `deleteItem`, message: `"Could not delete item"`.

Each action keeps the `console.error("<action> failed", err)` line so server-side errors surface in `npx wrangler tail`.

### Success Criteria

#### Automated Verification

- Linting passes: `npm run lint`
- Type/Astro check passes: `npx astro check`
- shadcn install left two new files in place: `ls src/components/ui/alert-dialog.tsx src/components/ui/dropdown-menu.tsx`

#### Manual Verification

- From the dev server, hit one of the new actions via the Astro Actions endpoint (e.g. `POST /_actions/lists.rename` with a valid list owned by the signed-in user) and confirm a 200 response with the updated row.
- Hit the same action with a UUID the user does not own and confirm the response surfaces an Astro `ActionError` (the underlying RLS will block the write).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: List rename + delete UI

### Overview

Expose rename and delete on the dashboard cards and on the list-detail header. Rename uses a modal mirroring `CreateListDialog`; delete uses an AlertDialog with a cascading-item-count copy when items are loaded.

### Changes Required

#### 1. List actions menu

**File**: `src/components/dashboard/ListActionsMenu.tsx` (new)

**Intent**: Reusable overflow (⋮) `DropdownMenu` with **Rename** and **Delete** entries, used both from `DashboardLists` cards and from the list-detail header.

**Contract**: Props `{ list: ListRow; onRename: () => void; onDelete: () => void }`. Renders a `DropdownMenu` with a trigger button (icon-only, `variant="ghost"`, `aria-label="List actions"`) and two `DropdownMenuItem`s. The component does not own dialog state — it just signals which action was chosen; the parent controls the dialog visibility.

#### 2. Rename dialog

**File**: `src/components/dashboard/RenameListDialog.tsx` (new)

**Intent**: Modal that prefills the current list title and calls `actions.lists.rename` on submit, mirroring `CreateListDialog`'s react-hook-form + zodResolver + sonner pattern.

**Contract**: Props `{ list: ListRow | null; open: boolean; onOpenChange: (open: boolean) => void; onRenamed: (updated: ListRow) => void }`. Uses `useForm` with `zodResolver(listRenameSchema.pick({ title: true }))` (or a derived `{ title }` schema), `defaultValues: { title: list?.title ?? "" }`. On submit: call `actions.lists.rename({ listId: list.id, title: values.title })`, branch on `isInputError` to set field errors, on server error `toast.error`, on success call `onRenamed(data)`, close the dialog, `toast.success("List renamed")`. Reset the form when the dialog closes or when `list.id` changes.

#### 3. Delete dialog

**File**: `src/components/dashboard/DeleteListDialog.tsx` (new)

**Intent**: AlertDialog whose body explains the cascading delete; calls `actions.lists.delete` on confirm.

**Contract**: Props `{ list: ListRow | null; itemCount?: number; open: boolean; onOpenChange: (open: boolean) => void; onDeleted: () => void }`. Body copy: if `itemCount === undefined` → "This action cannot be undone."; if `itemCount === 0` → "This list has no items. This action cannot be undone."; if `itemCount > 0` → "This will also delete <itemCount> <item / items>. This cannot be undone." On confirm: call `actions.lists.delete({ listId: list.id })`, on success call `onDeleted()` and `toast.success("List deleted")`, on error keep the dialog open and `toast.error("Could not delete list")`.

#### 4. Dashboard wiring

**File**: `src/components/dashboard/DashboardLists.tsx`

**Intent**: Mount `ListActionsMenu` on each owned `ListCard`, manage which dialog is open and which list it targets, and handle optimistic updates for rename (in-place title swap) and delete (optimistic remove with rollback).

**Contract**: Extend `DashboardLists` state with `{ renameTarget: ListRow | null; deleteTarget: ListRow | null }`. Pass `onRename: () => setRenameTarget(list)` and `onDelete: () => setDeleteTarget(list)` from each owned `ListCard` into `ListActionsMenu`. Wire `RenameListDialog`'s `onRenamed(updated)` to map over `owned` and replace the row; wire `DeleteListDialog`'s `onDeleted` callback to optimistically filter the row, remembering its index in a closure so a `toast.error` (caught by the dialog) can re-insert it at the same position. (Implementation note: pass a rollback callback into the dialog rather than try/catching inside `DashboardLists`.) The `ListCard` link wrapper must not also be the dropdown trigger — stop click propagation on the menu trigger so the card link does not fire.

#### 5. List-detail header wiring

**File**: `src/pages/lists/[id].astro` and `src/components/lists/ListDetail.tsx`

**Intent**: Surface the same `ListActionsMenu` on the detail header for owners; rename updates the title in place; delete navigates back to `/dashboard` with a success toast.

**Contract**:

- `[id].astro` (`src/pages/lists/[id].astro:36-44`): pass `currentUserId={locals.user.id}` into `<ListDetail …>`.
- `ListDetail.tsx`: conditional `list.owner_id === currentUserId` controls whether `ListActionsMenu` renders. Owns state for `renameOpen` and `deleteOpen`. Rename updates a local `list` state copy so the rendered title swaps without a reload. Delete passes an `onDeleted` that calls `window.location.assign("/dashboard")` (a server round-trip to ensure the dashboard re-renders without the deleted list). Pass `itemCount={items.length}` into `DeleteListDialog` so the copy includes the count.

### Success Criteria

#### Automated Verification

- Linting passes: `npm run lint`
- Astro check passes: `npx astro check`
- The list-detail page still SSRs without errors (`curl -s http://localhost:4321/lists/<owned-uuid>` returns 200 when signed in via cookie).

#### Manual Verification

- 2.1 As an owner, open the dashboard, click ⋮ on an owned card, choose Rename, change the title, save → card shows new title without reload; toast says "List renamed".
- 2.2 Open the same menu, choose Delete on a list with 0 items → AlertDialog body says "This list has no items…"; confirm → card disappears; toast says "List deleted".
- 2.3 Repeat 2.2 on a list with N items (N ≥ 1) → body says "…will also delete N items…"; confirm → card disappears; on refresh the items are also gone (cascade); toast says "List deleted".
- 2.4 On the list-detail page (own list), ⋮ → Rename → save → header title updates.
- 2.5 On the list-detail page, ⋮ → Delete → confirm → browser navigates to `/dashboard`; the deleted list is no longer present.
- 2.6 Force a server-side failure on rename or delete (e.g. modify the action handler to throw) and verify the optimistic remove rolls back to the original position, and the toast surfaces "Could not …".
- 2.7 Confirm the ⋮ dropdown trigger does NOT navigate to the list-detail page when clicked (click does not propagate to the card link).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Item edit + delete UI

### Overview

Expose edit and delete on each item row via an overflow menu; edit opens a modal mirroring the create form via a shared `ItemFormFields` component; delete uses an AlertDialog with optimistic-remove-with-rollback. The first work in this phase is the `AddItemForm` refactor to consume the shared `ItemFormFields` so create and edit cannot drift.

### Changes Required

#### 1. Shared item form fields

**File**: `src/components/lists/ItemFormFields.tsx` (new) and `src/components/lists/AddItemForm.tsx`

**Intent**: Extract the four form rows (title, price, link — with the implicit-USD currency behavior) from `AddItemForm` into a reusable `ItemFormFields` component driven by the shared `itemFormSchema`. Refactor `AddItemForm` to consume it. This closes S-01 impl-review F1.

**Contract**:

- `ItemFormFields` props `{ control: Control<ItemFormValues> }` — renders the same three `FormField` blocks currently in `AddItemForm.tsx:80-127`. No submit handling; pure form-row layout consuming a parent `useForm` control.
- `AddItemForm` refactored to import `itemFormSchema` + `ItemFormValues` + `mapItemFormToCreate` from `@/lib/schemas/wishlist`, use `zodResolver(itemFormSchema)`, render `<ItemFormFields control={form.control} />`, and call `actions.items.create(mapItemFormToCreate(list.id, values))`. All optimistic-add behavior stays unchanged. No user-visible change.

#### 2. Item edit modal

**File**: `src/components/lists/EditItemForm.tsx` (new)

**Intent**: Modal form that prefills an existing item and calls `actions.items.update` on submit; short-circuits when no fields changed.

**Contract**: Props `{ item: ItemRow | null; open: boolean; onOpenChange: (open: boolean) => void; onUpdated: (updated: ItemRow) => void }`. Uses `useForm<ItemFormValues>({ resolver: zodResolver(itemFormSchema), defaultValues: itemRowToFormValues(item) })` — define `itemRowToFormValues` adjacent (converts `price_cents` → dollars-string, `null`s → empty string). Reset form when `item.id` changes or dialog opens. On submit: compare the form values to the original (deep-equal via `JSON.stringify` of the normalized objects is fine for these primitive fields) — if equal, close the dialog without firing the action. Otherwise call `actions.items.update(mapItemFormToUpdate(item.id, values))`, branch on `isInputError`, `toast.error` on server error, on success call `onUpdated(data)`, close, `toast.success("Item updated")`.

#### 3. Item actions menu

**File**: `src/components/lists/ItemActionsMenu.tsx` (new)

**Intent**: Per-row `DropdownMenu` with **Edit** and **Delete** entries.

**Contract**: Props `{ onEdit: () => void; onDelete: () => void }`. Trigger is an icon-only `variant="ghost"` button with `aria-label="Item actions"`.

#### 4. Item delete dialog

**File**: `src/components/lists/DeleteItemDialog.tsx` (new)

**Intent**: AlertDialog with copy "Delete '<item title>'? This action cannot be undone." and confirm wired to `actions.items.delete`.

**Contract**: Props `{ item: ItemRow | null; open: boolean; onOpenChange: (open: boolean) => void; onDeleted: () => void }`. On confirm: call `actions.items.delete({ itemId: item.id })`; on success call `onDeleted()` and `toast.success("Item deleted")`; on error keep the dialog open and `toast.error("Could not delete item")`.

#### 5. ItemsList / ListDetail wiring

**File**: `src/components/lists/ItemsList.tsx` and `src/components/lists/ListDetail.tsx`

**Intent**: Mount the per-row menu only when the viewer owns the list; lift dialog state into `ListDetail`; wire optimistic update for edit (in-place replacement) and optimistic remove with rollback for delete.

**Contract**:

- `ItemsList` accepts `{ items: ItemRow[]; ownedByCurrentUser: boolean; onEdit: (item: ItemRow) => void; onDelete: (item: ItemRow) => void }`. Conditionally renders `<ItemActionsMenu …>` per row when `ownedByCurrentUser` is true.
- `ListDetail` extends its existing local state with `{ editTarget: ItemRow | null; deleteTarget: ItemRow | null }`, passes `ownedByCurrentUser = list.owner_id === currentUserId` and the two callbacks into `ItemsList`. `EditItemForm`'s `onUpdated(updated)` calls a new `handleOptimisticUpdate` that maps over `items` and swaps the matching id. `DeleteItemDialog`'s `onDeleted` removes the row optimistically, remembering its original index in a closure; on error the dialog calls a `rollback(index, item)` it received as a prop to re-insert at the original position.

### Success Criteria

#### Automated Verification

- Linting passes: `npm run lint`
- Astro check passes: `npx astro check`
- `AddItemForm.tsx` no longer declares a local `addItemFormSchema` — `grep -n "addItemFormSchema" src/components/lists/AddItemForm.tsx` returns no matches.

#### Manual Verification

- 3.1 As the list owner, the create-an-item flow still works exactly as before (regression check after the `AddItemForm` refactor).
- 3.2 ⋮ → Edit on a row prefills all four fields correctly (title, formatted price, link). Currency is implicit USD and not surfaced.
- 3.3 Change the title and save → row updates in place; toast says "Item updated".
- 3.4 Open Edit, change nothing, click Save → modal closes silently with no toast and no network call (verify via DevTools Network tab).
- 3.5 Open Edit, clear the link field, save → row updates with no link rendered.
- 3.6 Open Edit, enter an invalid link (`javascript:alert(1)`) → form shows inline validation error from the `https?://` refine; no action call fires.
- 3.7 ⋮ → Delete on a row → AlertDialog confirms → row disappears optimistically; toast says "Item deleted".
- 3.8 Force a server error on `items.delete` (temporarily throw from the handler) → row reappears at its original index; toast says "Could not delete item".
- 3.9 ⋮ menu is NOT rendered on item rows when the viewer is not the list owner. (Until S-03 ships, this is verified by code-reading the conditional.)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to closing the change.

---

## Testing Strategy

### Unit Tests

None — no test runner is configured in this repo. Verification leans on lint + astro check + the manual walk above.

### Integration Tests

None for the same reason. The manual checks in each phase's Success Criteria are the integration suite.

### Manual Testing Steps

Covered in the per-phase Manual Verification sections above. The "force a server error" steps (2.6, 3.8) require temporarily throwing from the action handler to exercise the rollback paths — revert the throw before commit.

## Performance Considerations

None expected. All four mutations are single-row writes on small tables; cascade delete on `items` is handled by the foreign key (Supabase / Postgres) without an app-side loop. RLS evaluation is the same `is_list_owner` / `owner_id = auth.uid()` pattern S-01 already uses.

## Migration Notes

No data migration. The schema is unchanged.

## References

- S-01 archived plan + impl-review: `context/archive/2026-05-28-create-list-with-items/plan.md`, `.../reviews/impl-review-phase-4.md` (F1: shared item-form schema needed)
- Roadmap entry: `context/foundation/roadmap.md` S-02
- PRD entries: `context/foundation/prd.md` FR-006, FR-007, FR-010, FR-011 (+ Open Question 1, intentionally left open)
- Lessons that apply: `context/foundation/lessons.md` (URL refine; non-owner read RLS)
- Initial schema: `supabase/migrations/20260527125732_initial_wishlist_schema.sql` (RLS for own-row update/delete + cascade FK)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend wiring + shadcn primitives

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — 9efe95b
- [x] 1.2 Type/Astro check passes: `npx astro check` — 9efe95b
- [x] 1.3 shadcn install left two new files in place: `ls src/components/ui/alert-dialog.tsx src/components/ui/dropdown-menu.tsx` — 9efe95b

#### Manual

- [x] 1.4 Hit one new action via `POST /_actions/lists.rename` with an owned list and confirm a 200 + updated row — 9efe95b
- [x] 1.5 Hit the same action with a UUID the signed-in user does not own and confirm an ActionError is returned (RLS blocks the write) — 9efe95b

### Phase 2: List rename + delete UI

#### Automated

- [x] 2.1 Linting passes: `npm run lint` — a6bcc88
- [x] 2.2 Astro check passes: `npx astro check` — a6bcc88
- [x] 2.3 List-detail page still SSRs without errors for an owned list — a6bcc88

#### Manual

- [x] 2.4 Dashboard ⋮ → Rename → title updates in place without reload; toast "List renamed" — a6bcc88
- [x] 2.5 Dashboard ⋮ → Delete on a list with 0 items → "This list has no items…" copy; confirm → card disappears; toast "List deleted" — a6bcc88
- [x] 2.6 Dashboard ⋮ → Delete on a list with N items → "…will also delete N items…" copy; confirm → card disappears; items also gone after refresh — a6bcc88
- [x] 2.7 Detail-page ⋮ → Rename → header title updates — a6bcc88
- [x] 2.8 Detail-page ⋮ → Delete → confirm → browser navigates to /dashboard; deleted list absent — a6bcc88
- [x] 2.9 Forced server-error on rename/delete rolls back optimistic state and shows toast "Could not …" — a6bcc88
- [x] 2.10 Clicking the ⋮ trigger does NOT navigate to the list-detail page (click propagation stopped) — a6bcc88

### Phase 3: Item edit + delete UI

#### Automated

- [x] 3.1 Linting passes: `npm run lint` — 947b817
- [x] 3.2 Astro check passes: `npx astro check` — 947b817
- [x] 3.3 `AddItemForm.tsx` no longer declares a local `addItemFormSchema` (grep returns no matches) — 947b817

#### Manual

- [x] 3.4 Create-an-item flow still works after the `AddItemForm` refactor (regression check) — 947b817
- [x] 3.5 ⋮ → Edit prefills all four fields correctly — 947b817
- [x] 3.6 Change title and save → row updates in place; toast "Item updated" — 947b817
- [x] 3.7 Open Edit, change nothing, click Save → modal closes silently; no network call — 947b817
- [x] 3.8 Open Edit, clear the link, save → row renders without a link — 947b817
- [x] 3.9 Open Edit, enter `javascript:alert(1)` as link → inline validation error; no action call — 947b817
- [x] 3.10 ⋮ → Delete on a row → confirm → row disappears optimistically; toast "Item deleted" — 947b817
- [x] 3.11 Forced server-error on `items.delete` rolls back to original index; toast "Could not delete item" — 947b817
- [x] 3.12 ⋮ menu is not rendered on item rows when the viewer is not the list owner (verified by code-read until S-03 ships) — 947b817
