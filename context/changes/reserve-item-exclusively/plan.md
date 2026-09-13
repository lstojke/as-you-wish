# Gift-Giver Reserves an Item Exclusively — Implementation Plan

## Overview

Add the write path for item reservations to the existing shared-list view: a signed-in viewer of a list shared with them can **reserve** an available item (exclusive — exactly one claim wins under concurrency, and the list owner never learns who reserved) and **cancel their own reservation** (FR-015, pulled into scope). The load-bearing exclusivity invariant already lives in the database (F-01); this slice adds the service, action, and UI layers on top of it.

## Current State Analysis

The reservation **read** side and the **entire DB enforcement layer** already exist. What is missing is purely the write path and the "which of these did _I_ reserve" signal.

- **DB (F-01, landed):** `reservations` table with a unique partial index `reservations_one_active_per_item on (item_id) where released_at is null` — this _is_ the FR-013 exclusivity guarantee. RLS: `reservations_insert` requires `claimer_id = auth.uid()` AND `is_item_list_member(item_id)`; `reservations_select` is restricted to the claimer; `reservations_update` is gated to the claimer with only the `released_at` column writable; no delete policy. See [20260527125732_initial_wishlist_schema.sql](supabase/migrations/20260527125732_initial_wishlist_schema.sql).
- **Read side (S-04, landed):** `listReservedItemIds(client, listId)` reads the identity-safe `item_reservation_status` view (exposes only `item_id, list_id, is_reserved`, never `claimer_id`) — [items.ts](src/lib/services/items.ts). `ItemsList` renders an Available/Reserved badge per item — [ItemsList.tsx](src/components/lists/ItemsList.tsx). `[id].astro` fetches items + reserved ids SSR and passes them through `ListDetail` (`client:only="react"`) — [[id].astro](src/pages/lists/[id].astro), [ListDetail.tsx](src/components/lists/ListDetail.tsx).
- **Mutation pattern (established):** every mutation is an Astro action in [actions/index.ts](src/actions/index.ts) with a zod schema in [wishlist.ts](src/lib/schemas/wishlist.ts) and a per-entity service (`lists.ts`, `items.ts`, `invitations.ts`). Services obtain the user via `client.auth.getUser()` and set NOT-NULL owner columns themselves (see `createList` setting `owner_id`) — the same pattern applies to `reservations.claimer_id`.

### Key Discoveries:

- The exclusivity race is resolved by the DB, not app code. A lost race surfaces as a Postgres unique-violation (`code === "23505"`) on insert — the plan maps this to a friendly conflict, it does **not** re-implement locking. ([20260527125732_initial_wishlist_schema.sql](supabase/migrations/20260527125732_initial_wishlist_schema.sql), index `reservations_one_active_per_item`)
- The `item_reservation_status` view deliberately omits `claimer_id`, so it cannot answer "did I reserve this?". A separate claimer-scoped read of the `reservations` table is required; `reservations_select` RLS already scopes rows to the caller. ([database.types.ts](src/db/database.types.ts) lines 172–199 for the view shape.)
- `reservations.claimer_id` is NOT NULL with no default — the service must set it from `client.auth.getUser()`, mirroring `createList` in [lists.ts](src/lib/services/lists.ts).
- Releasing sets `released_at` (only writable column for the claimer); the partial index excludes released rows, so a released item becomes Available again for everyone with no extra work.
- `reservedItemIds` is currently a plain prop into `ListDetail`. To update badges in place after reserve/cancel it must become React state.

## Desired End State

A signed-in viewer opens a list shared with them and, per item, sees exactly one of:

- **Available** + a **Reserve** button → tapping it claims the item.
- **Reserved by you** + a **Cancel** button → tapping it releases the claim, returning the item to Available.
- **Reserved** (no button) → claimed by someone else; not claimable, claimer identity hidden.

Two simultaneous Reserve taps on the same item resolve to exactly one success; the loser sees a "someone just reserved this" message and the item's badge flips to Reserved. The **list owner**, viewing their own list, sees the existing badges and owner controls but **no Reserve/Cancel controls** and never learns who reserved anything.

Verify by: (a) `npm run build` + typecheck + lint pass; (b) a SQL/concurrency check proves the unique index rejects a second active reservation; (c) manual two-user test in the UI confirms the three states, the conflict path, and owner invisibility.

## What We're NOT Doing

- **No schema or migration change.** The table, index, RLS, and view are all in place from F-01. If this plan finds itself writing SQL, that is a signal something is wrong.
- **No owner-facing enforcement when an item with an active reservation is edited or deleted** (PRD Open Question 1). Behavior is unchanged from today (confirmation dialog only; CASCADE drops the reservation on item delete). Documented as a known open item, not addressed here.
- **No owner aggregate available/reserved count** (FR-014, parked).
- **No reserver-identity disclosure anywhere** — the owner path must never read `claimer_id`.
- **No realtime/subscription updates.** Status reflects SSR load plus local mutations; other viewers' reservations appear on next page load (the conflict path self-heals the one case that matters).
- **No changes to auth, invitations, or item CRUD** beyond what the reserve/cancel UI requires.

## Implementation Approach

Two phases, backend then UI, mirroring the established action/service/schema layering.

1. **Backend:** two zod schemas (`reservationCreateSchema`, `reservationReleaseSchema`), a new `src/lib/services/reservations.ts` (`createReservation`, `releaseReservation`, `listMyReservedItemIds`), and two Astro actions (`reservations.reserve`, `reservations.release`). The reserve action maps a `23505` unique-violation to `ActionError({ code: "CONFLICT" })`; everything else follows the existing generic-error pattern.
2. **UI:** SSR-fetch the caller's own reserved item ids in `[id].astro`, thread them through `ListDetail`; convert `reservedItemIds` to state and add `myReserved` + a `pendingItemIds` set; add `handleReserve`/`handleRelease` that call the actions, apply state in place, and self-heal on conflict; extend `ItemsList` to render the three states with Reserve/Cancel buttons, hidden entirely when the owner views their own list.

## Critical Implementation Details

- **Conflict mapping is the crux.** The reserve service must let the Postgres error propagate; the action inspects `err.code === "23505"` (Supabase `PostgrestError`) and throws `ActionError({ code: "CONFLICT", message: "Someone just reserved this item first" })`. The client branches on `error.code === "CONFLICT"` to toast + flip the badge to Reserved rather than showing a generic failure. Astro's `ActionError` supports the `CONFLICT` code (409).
- **"Reserved by you" read must not rely on a nested `!inner` join.** Per `context/foundation/lessons.md` ("Shared-list queries must rely on RLS, not an invitations join"), avoid a join whose RLS can silently drop rows. Fetch items first, then query `reservations` filtered by `.in("item_id", <item ids on this list>)` and `.is("released_at", null)`; `reservations_select` RLS scopes rows to the caller. An empty item list yields an empty `.in(...)` result — safe.
- **Pending state gates double-submits.** A per-item pending flag disables the button and prevents a second in-flight reserve/cancel on the same row.

## Phase 1: Reservation backend (reserve + release + "mine" read)

### Overview

Add the schema, service, and action layers for creating and releasing reservations, plus a claimer-scoped read of the caller's active reservations. No UI in this phase; verified by build/type/lint and a DB-level concurrency check.

### Changes Required:

#### 1. Reservation zod schemas

**File**: `src/lib/schemas/wishlist.ts`

**Intent**: Add input schemas for the reserve and release actions so the actions validate at the boundary like every other mutation.

**Contract**: Export `reservationCreateSchema = z.object({ itemId: z.uuid() })` and `reservationReleaseSchema = z.object({ itemId: z.uuid() })`, each with an inferred `...Input` type. Mirror the shape of `itemDeleteSchema`. No URL/text fields, so no refinements needed.

#### 2. Reservations service

**File**: `src/lib/services/reservations.ts` (new)

**Intent**: Encapsulate the three reservation operations behind typed functions, consistent with `items.ts`/`lists.ts`. The service owns setting `claimer_id` from the authenticated user and relies on RLS + the unique index for authorization and exclusivity.

**Contract**:

- `createReservation(client, input: ReservationCreateInput): Promise<ReservationRow>` — resolve the user via `client.auth.getUser()` (throw if absent, like `createList`), then `insert({ item_id: input.itemId, claimer_id: user.id }).select("*").single()`. Let any error (including the `23505` unique-violation) propagate to the action; do **not** swallow it. Add a comment naming the `reservations_one_active_per_item` index and `reservations_insert` RLS as the enforcement it depends on.
- `releaseReservation(client, input: ReservationReleaseInput): Promise<void>` — `update({ released_at: new Date().toISOString() }).eq("item_id", input.itemId).is("released_at", null)`; RLS (`claimer_id = auth.uid()`, column grant limited to `released_at`) restricts the row to the caller's own active reservation. No app-side ownership check needed.
- `listMyReservedItemIds(client, itemIds: string[]): Promise<string[]>` — if `itemIds` is empty return `[]`; else `from("reservations").select("item_id").in("item_id", itemIds).is("released_at", null)` and map to `item_id[]`. Comment the RLS dependency (`reservations_select` scopes rows to the claimer — no join, per lessons.md).
- Export `type ReservationRow = Database["public"]["Tables"]["reservations"]["Row"]`.

#### 3. Reserve / release Astro actions

**File**: `src/actions/index.ts`

**Intent**: Expose the two operations as `reservations.reserve` and `reservations.release`, following the `defineAction` + `requireSupabase` pattern, with the reserve handler translating the DB unique-violation into a typed conflict.

**Contract**: Add a `reservations:` group to the `server` object with:

- `reserve` — `input: reservationCreateSchema`, returns the created `ReservationRow`. In the catch block, if the error's `code === "23505"`, throw `new ActionError({ code: "CONFLICT", message: "Someone just reserved this item first" })`; otherwise the existing `INTERNAL_SERVER_ERROR` fallback ("Could not reserve item"). Re-throw existing `ActionError`s untouched (as the invitations handlers do).
- `release` — `input: reservationReleaseSchema`, returns `{ success: true as const }`, generic `INTERNAL_SERVER_ERROR` ("Could not cancel reservation") on failure.

Import `createReservation`, `releaseReservation` from the new service and the two new schemas.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build` (Astro type-checks on build; there is no standalone typecheck script)
- Linting passes: `npm run lint`
- Formatting is clean: `npm run format` (or `npx prettier --check .`)
- Exclusivity holds at the DB: inserting a second active reservation for an item that already has one fails with `23505` — verified via a `supabase` SQL snippet / `psql` against the local stack (`npx supabase start`), e.g. two `insert into reservations (item_id, claimer_id) ...` for the same `item_id`, second must error.
- Release re-opens the item: after `update reservations set released_at = now()`, a fresh insert for the same `item_id` succeeds.

#### Manual Verification:

- The `reservations.reserve` and `reservations.release` actions are callable from a scratch client/REPL (or deferred to Phase 2 UI test) and return the expected shapes.
- No existing action or query regressed (dashboard + list detail still load).

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding to Phase 2. Phase blocks use plain bullets — the `- [ ]` checkboxes live in the `## Progress` section.

---

## Phase 2: Reserve / cancel UI

### Overview

Wire the caller's own reservations into SSR, lift reserved-state into `ListDetail` with reserve/cancel handlers (pending + conflict self-heal), and render the three per-item states in `ItemsList`, hidden entirely when the owner views their own list.

### Changes Required:

#### 1. SSR: fetch the caller's own reservations

**File**: `src/pages/lists/[id].astro`

**Intent**: Load which items on this list the current user has reserved, so the UI can render "Reserved by you" and Cancel from first paint.

**Contract**: After `listItems` resolves, also call `listMyReservedItemIds(supabase, items.map((i) => i.id))`. Keep the existing parallelism where possible (items must resolve first to supply the ids; `listReservedItemIds` and `listMyReservedItemIds` can run together after). Pass a new `myReservedItemIds: string[]` prop into `ListDetail`. Import from the new service.

#### 2. State + handlers in ListDetail

**File**: `src/components/lists/ListDetail.tsx`

**Intent**: Own the mutable reservation state and the reserve/cancel logic, matching the existing "ListDetail holds state, children are presentational" pattern.

**Contract**:

- Accept new prop `myReservedItemIds: string[]`.
- Convert `reservedItemIds` from a passthrough prop into state (`reserved`), and add state `myReserved` (seeded from `myReservedItemIds`) and `pendingItemIds` (a `string[]` or `Set` tracked in state).
- `handleReserve(item)` — mark item pending; `await actions.reservations.reserve({ itemId })`. On success: add id to `reserved` and `myReserved`, toast success. On `error.code === "CONFLICT"`: add id to `reserved` (badge → Reserved), toast "Someone just reserved this item first". On other errors: toast generic. Always clear pending.
- `handleRelease(item)` — mark pending; `await actions.reservations.release({ itemId })`. On success: remove id from `reserved` and `myReserved` (badge → Available), toast. On error: toast generic. Always clear pending.
- Pass `reservedItemIds={reserved}`, `myReservedItemIds={myReserved}`, `pendingItemIds`, `canClaim={!isOwner}`, `onReserve`, `onRelease` to `ItemsList`. (Owner-only UI stays behind the existing `isOwner` block; `canClaim` is simply `!isOwner`.)

#### 3. Reserve / cancel rendering in ItemsList

**File**: `src/components/lists/ItemsList.tsx`

**Intent**: Render the correct badge + control per item state, and expose Reserve/Cancel only to non-owners.

**Contract**: Extend `Props` with `myReservedItemIds: string[]`, `pendingItemIds: string[]`, `canClaim: boolean`, `onReserve: (item) => void`, `onRelease: (item) => void`. Build `myReserved` and `pending` sets alongside the existing `reserved` set. Per item, when `canClaim` is true:

- in `myReserved` → "Reserved by you" badge + a `Cancel` button calling `onRelease(item)`, disabled while pending.
- else in `reserved` → "Reserved" badge, no button.
- else → "Available" badge + a `Reserve` button calling `onReserve(item)`, disabled while pending, showing "Reserving…" text while pending.

When `canClaim` is false (owner's own list) the buttons are omitted entirely — badge-only, exactly as today. Use the existing `Button` from `@/components/ui/button`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`
- Formatting is clean: `npm run format` (or `npx prettier --check .`)

#### Manual Verification:

- As an **invited non-owner**: an Available item shows Reserve; tapping it flips to "Reserved by you" with a Cancel button and a success toast.
- Tapping Cancel returns the item to Available.
- A second browser/user viewing the same list sees the item as "Reserved" (no button) and cannot reserve it; the item's claimer is never shown.
- **Concurrency:** two users tapping Reserve near-simultaneously — exactly one gets "Reserved by you"; the other gets the conflict toast and sees the badge flip to "Reserved".
- As the **list owner** viewing their own list: badges render but **no** Reserve/Cancel controls appear, and no reserver identity is visible anywhere.
- Response feels under ~2s (NFR) for reserve/cancel on the local/preview stack.

**Implementation Note**: After Phase 2 automated verification passes, pause for the two-user manual verification above before considering the change complete.

---

## Testing Strategy

### Unit / boundary:

- zod schemas reject a non-UUID `itemId`.
- `listMyReservedItemIds([])` returns `[]` without a query.

### Integration (DB-level, via local Supabase):

- Unique index rejects a second active reservation for the same item (`23505`).
- Releasing (`released_at = now()`) allows a subsequent reservation to succeed.
- Owner cannot select `claimer_id` for any reservation (RLS) — confirm via a query as the owner returns no reservation rows.

### Manual (two users):

1. User B (invited) reserves an Available item on User A's list → "Reserved by you".
2. User A (owner) opens the list → sees "Reserved", no controls, no identity.
3. User B cancels → item returns to Available for both.
4. Two users race a Reserve on the same item → one wins, the other gets the conflict toast + Reserved badge.

## Performance Considerations

At family-circle scale (`target_scale: small`, low qps) no indexing or caching work is needed beyond what F-01 provides. The two extra SSR reads (`listReservedItemIds`, `listMyReservedItemIds`) are lightweight and bounded by items-per-list. Reserve/cancel are single-row writes gated by an existing index.

## Migration Notes

None. No schema, RLS, or view changes. The generated `Database` types already include `reservations` (Row/Insert/Update) and `item_reservation_status`, so no `supabase gen types` run is required.

## References

- Roadmap slice: `context/foundation/roadmap.md` → S-05 (US-01, FR-013), FR-015 parked note
- PRD: `context/foundation/prd.md` → US-01, Business Logic, FR-013, FR-015
- DB foundation: [20260527125732_initial_wishlist_schema.sql](supabase/migrations/20260527125732_initial_wishlist_schema.sql)
- Read-side precedent (S-04): `context/archive/2026-09-13-view-shared-list/plan.md`; [items.ts](src/lib/services/items.ts) `listReservedItemIds`
- Mutation precedent: [actions/index.ts](src/actions/index.ts), [lists.ts](src/lib/services/lists.ts) `createList` (claimer/owner-id pattern)
- Lessons: `context/foundation/lessons.md` (RLS-not-join; http(s) URL rule — no URL field here)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reservation backend (reserve + release + "mine" read)

#### Automated

- [x] 1.1 Type checking passes: `npm run build`
- [x] 1.2 Linting passes: `npm run lint`
- [x] 1.3 Formatting is clean: `npm run format`
- [x] 1.4 Exclusivity holds at the DB: second active reservation for an item fails with `23505`
- [x] 1.5 Release re-opens the item: fresh insert after `released_at = now()` succeeds

#### Manual

- [ ] 1.6 `reservations.reserve` / `reservations.release` actions return expected shapes
- [ ] 1.7 No existing action or query regressed (dashboard + list detail load)

### Phase 2: Reserve / cancel UI

#### Automated

- [ ] 2.1 Type checking passes: `npm run build`
- [ ] 2.2 Linting passes: `npm run lint`
- [ ] 2.3 Formatting is clean: `npm run format`

#### Manual

- [ ] 2.4 Non-owner: Available → Reserve → "Reserved by you" + Cancel + success toast
- [ ] 2.5 Cancel returns the item to Available
- [ ] 2.6 Second user sees "Reserved" (no button), claimer never shown
- [ ] 2.7 Concurrency: simultaneous Reserve → one wins, other gets conflict toast + Reserved badge
- [ ] 2.8 Owner on own list: badges only, no Reserve/Cancel controls, no identity
- [ ] 2.9 Reserve/cancel response under ~2s (NFR)
