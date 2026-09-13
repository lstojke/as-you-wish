# View a Shared List with Reservation Status — Implementation Plan

## Overview

Deliver roadmap slice **S-04** (PRD **FR-012**): let an invited (non-owner) viewer open a shared list and see each item's **available / reserved** status, without ever learning who reserved which item. The read model and access controls already exist from F-01 — this slice is UI wiring plus one read query, plus closing an owner-only UI leak.

## Current State Analysis

- **Invitees can already open the page.** `src/pages/lists/[id].astro` fetches the list via `getListById` (RLS `lists_select` = owner OR `is_list_invitee`) and items via `listItems` (RLS `items_select` = `is_list_member`). A non-owner invitee already reaches the page and sees items — no new access path is needed.
- **Mutation UI is already owner-gated.** `src/components/lists/ListDetail.tsx#L31` computes `isOwner = list.owner_id === currentUserId` and hides rename/delete/edit/invite behind it.
- **The identity-safe read model already exists but is unused.** The `item_reservation_status` view (`security_invoker = true`) in `supabase/migrations/20260527125732_initial_wishlist_schema.sql` exposes only `item_id, list_id, is_reserved` — computed via the `is_item_reserved(uuid)` `security definer` helper, never projecting `claimer_id`. It is not queried anywhere in the app.
- **The view's TypeScript type already exists.** `src/db/database.types.ts` → `public.Views.item_reservation_status` with `Row: { is_reserved: boolean | null; item_id: string | null; list_id: string | null }`. No `gen types` run needed.
- **Two gaps remain:**
  1. Reservation status is never displayed — `ItemsList.tsx` renders title/price/link only.
  2. `AddItemForm` renders for **all** viewers (`ListDetail.tsx#L89`) with no `isOwner` gate — a shared viewer sees an "Add item" form that would fail at RLS (`items_insert` requires `is_list_owner`).

## Desired End State

- An invited viewer opens a shared list from the dashboard and sees each item with a small "Available" or "Reserved" badge, and **no** add/edit/delete controls.
- The owner opens their own list and sees the same per-item badges **plus** all existing owner controls.
- No viewer (owner included) can see who reserved an item.
- Verify: sign in as an invitee → open shared list → items show badges, no mutation UI; insert a `reservations` row via SQL for one item → reload → that item flips to "Reserved".

### Key Discoveries:

- `item_reservation_status` view is the load-bearing, identity-safe read model — `supabase/migrations/20260527125732_initial_wishlist_schema.sql` (view definition; `is_item_reserved` helper).
- View type already present — `src/db/database.types.ts` (`Views.item_reservation_status`).
- Owner-gating pattern to follow — `src/components/lists/ListDetail.tsx#L31` (`isOwner`) and `#L84` (`ownedByCurrentUser` prop into `ItemsList`).
- Badge component available — `src/components/ui/badge.tsx` (shadcn, `variant` = default | secondary | outline | destructive).
- `client:only="react"` on `ListDetail` means props are JSON-serialized — pass a plain `string[]` of reserved item IDs, not a `Set`/`Map`.

## What We're NOT Doing

- No reserve/release action or button — that is **S-05**.
- No owner aggregate count ("X of Y reserved") — that is FR-014, deferred.
- No owner "gift-surprise" toggle to hide badges — documented as a follow-up (`context/changes/view-shared-list/follow-ups/owner-hide-reservation-badges.md`).
- No schema/migration changes — the view and RLS already exist.
- No change to the `listOwnedAndShared` shared-query behavior.

## Implementation Approach

Add a single read helper that selects from `item_reservation_status` for a list and returns the IDs of reserved items. Fetch it SSR in `[id].astro` alongside items, pass a `reservedItemIds: string[]` prop down through `ListDetail` into `ItemsList`, and render a badge per row keyed on membership in that set. Separately, move `AddItemForm` inside the existing `isOwner` block so the shared view is cleanly read-only. Badges render for everyone (owner included), per product decision; the owner opt-out is a future feature.

## Phase 1: Shared-list reservation status display

### Overview

Wire the existing `item_reservation_status` view into the item rows as an Available/Reserved badge, and gate `AddItemForm` behind `isOwner`.

### Changes Required:

#### 1. Reservation-status read service

**File**: `src/lib/services/items.ts`

**Intent**: Add a service that returns which items on a list are currently reserved, sourced from the identity-safe view so no caller ever touches `claimer_id`.

**Contract**: New exported `async function listReservedItemIds(client: Client, listId: string): Promise<string[]>`. Selects `item_id, is_reserved` from the `item_reservation_status` view filtered by `list_id`, throws on error (matching sibling services), and returns the `item_id`s where `is_reserved === true`. Filter out any null `item_id`/`is_reserved` (view columns are nullable in the generated types).

#### 2. SSR load + prop wiring

**File**: `src/pages/lists/[id].astro`

**Intent**: Load reserved item IDs alongside items and hand them to `ListDetail`.

**Contract**: After `items = await listItems(...)`, also `reservedItemIds = await listReservedItemIds(supabase, id)` inside the same `try`/`if (maybeList)` block (default `[]`). Pass `reservedItemIds={reservedItemIds}` as a new prop on `<ListDetail>`.

#### 3. Thread status through and close the add-form leak

**File**: `src/components/lists/ListDetail.tsx`

**Intent**: Pass reserved IDs into `ItemsList`, and stop rendering `AddItemForm` for non-owners.

**Contract**: Add `reservedItemIds: string[]` to `Props`; forward it to `<ItemsList reservedItemIds={reservedItemIds} … />`. Move the existing `<AddItemForm … />` block inside the `{isOwner && ( … )}` group (it currently sits outside it, `ListDetail.tsx#L89`). No behavior change for owners.

#### 4. Render the status badge

**File**: `src/components/lists/ItemsList.tsx`

**Intent**: Show an Available/Reserved badge on every item row for all viewers.

**Contract**: Add `reservedItemIds: string[]` to `Props`; build a `Set` from it once inside the component. For each item, render `<Badge variant="secondary">Reserved</Badge>` when the id is in the set, else `<Badge variant="outline">Available</Badge>`. Place the badge in the left column near the title; keep the existing `ownedByCurrentUser`-gated `ItemActionsMenu` on the right untouched. Optimistically-added items (placeholder IDs not in the set) fall through to "Available", which is correct.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type checking / build passes: `npm run build`

#### Manual Verification:

- As an **invitee**, opening a shared list shows every item with an "Available"/"Reserved" badge and **no** add/edit/delete UI.
- As the **owner**, opening the list shows the same badges **plus** the Invite button, list actions menu, per-item actions, and the Add-item form.
- Insert a `reservations` row (`released_at IS NULL`) for one item via SQL, reload → that item shows "Reserved"; others stay "Available".
- No viewer sees any indication of *who* reserved an item.

**Implementation Note**: After automated verification passes, pause for human confirmation of the manual checks before considering the phase complete.

---

## Testing Strategy

### Manual Testing Steps:

1. Owner A creates a list with 2-3 items and invites user B (existing S-03 flow).
2. Sign in as B, open the shared list from "Shared with me" → confirm badges show, all "Available", no mutation controls.
3. In Supabase SQL editor, `insert into reservations (item_id, claimer_id) values ('<item-uuid>', '<B-uuid>');` → reload as B and as A → that item reads "Reserved" for both; neither sees claimer identity.
4. As owner A, confirm the Add-item form and per-item actions still render and function.

## Migration Notes

None — no schema changes. The `item_reservation_status` view and all RLS policies already exist. Badges will read "Available" for every item until S-05 begins creating reservations.

## References

- Roadmap: `context/foundation/roadmap.md` (S-04)
- PRD: `context/foundation/prd.md` (FR-012)
- Read model: `supabase/migrations/20260527125732_initial_wishlist_schema.sql` (`item_reservation_status` view, `is_item_reserved`)
- Owner-gating pattern: `src/components/lists/ListDetail.tsx`
- Follow-up: `context/changes/view-shared-list/follow-ups/owner-hide-reservation-badges.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Shared-list reservation status display

#### Automated

- [x] 1.1 Linting passes: `npm run lint`
- [x] 1.2 Type checking / build passes: `npm run build`

#### Manual

- [x] 1.3 As an invitee, shared list shows per-item Available/Reserved badges and no add/edit/delete UI
- [x] 1.4 As the owner, badges render plus all owner controls (invite, list actions, item actions, add form)
- [x] 1.5 Inserting a reservation row via SQL flips that item to "Reserved" on reload
- [x] 1.6 No viewer sees who reserved an item
