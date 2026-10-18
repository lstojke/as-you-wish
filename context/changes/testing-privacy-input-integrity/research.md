---
date: 2026-10-03T22:38:33+02:00
researcher: GitHub Copilot
git_commit: b50a594e09a013a2c5c38c912d1927c0c79e327e
branch: master
repository: as-you-wish
topic: "Phase 3 privacy, input validation, and reserved-item mutation risks"
tags: [research, codebase, reservations, validation, privacy, supabase]
status: complete
last_updated: 2026-10-03
last_updated_by: GitHub Copilot
---

# Research: Phase 3 Privacy, Input Validation, and Reserved-Item Mutation Risks

**Date**: 2026-10-03T22:38:33+02:00  
**Researcher**: GitHub Copilot  
**Git Commit**: b50a594e09a013a2c5c38c912d1927c0c79e327e  
**Branch**: master  
**Repository**: as-you-wish

## Research Question

Ground rollout Phase 3 risks #4–#6 from `context/foundation/test-plan.md` in the current code: reserver identity privacy, server-side validation parity, and reservation consistency when a reserved item is edited or deleted. Verify the existing response guidance, test coverage, and cheapest useful test layer.

## Summary

- **#4 Privacy**: Owner-facing list reads appear identity-safe by design. The `reservations_select` RLS policy allows a user to read only their own reservation rows, while `item_reservation_status` exposes only `item_id`, `list_id`, and `is_reserved`. One apparent counterexample needs careful interpretation: `createReservation` returns a full reservation row including `claimer_id`, but the response goes to the authenticated caller who created that row, so that field is the caller's own identity, not another reserver's identity. A focused RLS/view integration test is appropriate; asserting that every reservation response omits `claimer_id` would test the wrong contract.
- **#5 Input validation**: Astro business actions declare Zod input schemas, but no current test proves that invalid input is rejected at the action boundary. The schemas cover types, bounds, and HTTP(S)-only links. A syntactically valid foreign list/item UUID is not rejected by Zod; ownership and membership are enforced separately by RLS. The signin/signup API routes parse form fields with casts and do not use Zod, so decide whether those credential routes belong in this rollout's validation scope.
- **#6 Mutation consistency**: Item deletion has a database `ON DELETE CASCADE` to reservations, so it cannot leave an orphaned reservation row; deleting a reserved item silently removes its active claim. Editing updates the existing item row and leaves the reservation attached. The PRD explicitly leaves notification/silent-drop behavior open, so test database consistency separately from any product decision about notifying the reserver.
- **Cheapest useful layer**: Local-Supabase integration tests with member clients for RLS and mutation behavior; use service-role reads only as controls for database state. Pure schema tests are cheaper for constraint coverage but do not prove Astro invokes parsing. A focused action/HTTP contract test is needed to prove the runtime boundary.

## Detailed Findings

### Risk #4 - Reserver identity privacy

- `reservations` stores `claimer_id`, but the `reservations_select` policy predicates rows on `claimer_id = auth.uid()` ([initial schema migration, policy](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e327e/supabase/migrations/20260527125732_initial_wishlist_schema.sql#L276)). An owner therefore cannot read another member's reservation row using their authenticated client.
- The `item_reservation_status` view returns only `item_id`, `list_id`, and the boolean `is_reserved`; its helper is security-definer and does not project `claimer_id` ([initial schema migration, view](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e327e/supabase/migrations/20260527125732_initial_wishlist_schema.sql#L312)). Generated database types likewise model the view without a claimer field ([database types](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e327e/src/db/database.types.ts#L172)).
- The list-detail route supplies `listReservedItemIds` and `listMyReservedItemIds` to the page ([list route](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e/src/pages/lists/%5Bid%5D.astro#L32)). `listReservedItemIds` queries the boolean-only view ([items service](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e/src/lib/services/items.ts#L25)); `listMyReservedItemIds` selects only `item_id` under claimer-scoped RLS ([reservations service](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e/src/lib/services/reservations.ts#L64)). The UI renders "Reserved by you", "Reserved", or "Available" without a person identifier ([ItemsList](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e/src/components/lists/ItemsList.tsx#L46)).
- `createReservation` inserts the authenticated user's id and returns the selected reservation row ([reservations service](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e/src/lib/services/reservations.ts#L27)); the action returns that result ([actions](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e/src/actions/index.ts#L240)). That payload is returned to the caller who reserved, and the React handler ignores action data ([ListDetail](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e/src/components/lists/ListDetail.tsx#L49)). It does not establish an owner-facing disclosure.
- The owner cannot reserve through the UI (`canClaim={!isOwner}`), but the database insert policy permits a list member whose `claimer_id` matches their own authenticated id. If an owner calls the action directly, they receive their own id; this is a UI/server behavior mismatch, not a leak of another reserver's identity.
- **Guidance correction**: narrow the test oracle from "no claimer id in every API payload" to "a list owner cannot read another member's claimer id through owner-facing reads; reserved status remains visible." Seed a real reservation by an invitee, assert the owner's direct reservation-table read returns no rows, and assert the owner's view reports the item reserved without exposing a claimer field. Pair with a service-role control read so an empty result cannot be a fixture failure.

### Risk #5 - Server-side validation parity

- Each list/item/invitation/reservation Astro action declares an input schema using `defineAction` ([actions: item mutations](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e327e/src/actions/index.ts#L92); [actions: reservation](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e/src/actions/index.ts#L239)). The schemas enforce required fields, UUID syntax, title bounds, integer non-negative cents, three-letter uppercase currency, HTTP(S)-only URLs, and cross-field currency/price consistency ([wishlist schemas](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e/src/lib/schemas/wishlist.ts#L22)).
- Action handlers receive schema-typed `input` and pass it to services. No current test calls the schemas or the action boundary with malformed values. Existing tests exercise reservation concurrency and invitation/access RLS at the service/database level, not action parsing.
- UUID validation is shape validation, not authorization. For example, a valid UUID naming another user's list may pass Zod; insert/update/delete authorization is enforced by Supabase RLS. Therefore test malformed identifiers at the action contract and test foreign-resource identifiers against member clients/RLS rather than expecting Zod to reject them.
- The signin/signup POST routes are a separate, unvalidated input surface: they cast `FormData.get("email")` and `FormData.get("password")` to strings and call Supabase auth without a local Zod schema ([signin route](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e327e/src/pages/api/auth/signin.ts#L11); [signup route](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e/src/pages/api/auth/signup.ts#L7)). Supabase may reject invalid credentials, but that is not the same as this repo's stated API-route Zod convention. Decide during planning whether to include them or explicitly limit this phase to list/item business actions.
- Stored link safety is already covered by a recurring lesson: persisted URLs must restrict to HTTP(S), because `z.url()` alone accepts dangerous schemes ([lessons.md](../../foundation/lessons.md)); the item create/update schemas currently include that refinement ([schema](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e327e/src/lib/schemas/wishlist.ts#L31)).
- **Recommended test split**: schema unit cases for independently specified constraints (negative/fractional price, missing/oversized title, non-HTTP URL); an action contract test for malformed payload rejection before side effects; and a member-client integration case for a valid-but-foreign resource id to prove RLS authorization. Do not use the production schema's own parsing result as the sole oracle for what business behavior is expected.

### Risk #6 - Edit/delete with an active reservation

- The reservation foreign key references `items(id) ON DELETE CASCADE` ([initial schema migration](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e327e/supabase/migrations/20260527125732_initial_wishlist_schema.sql#L48)). Consequently, deleting an item removes its reservation history as well as its active claim; the current design cannot leave an orphaned reservation for that item.
- `deleteItem` directly deletes by item id and relies on RLS for owner authorization ([items service](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e327e/src/lib/services/items.ts#L83)). `updateItem` updates fields on the same item row and does not mutate reservation rows ([items service](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e/src/lib/services/items.ts#L54)). An edit therefore keeps the active claim associated with the same item id.
- On a fresh list load, the route queries the current items first and requests reserver-owned reservation ids only for those item ids ([list route](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e/src/pages/lists/%5Bid%5D.astro#L30)). A removed item's reservation is absent after cascade. A reserver's already-open React view is not cross-client synchronized; it may remain stale until reload, which is a UI freshness concern distinct from an orphaned database claim.
- The owner sees a generic irreversible-delete confirmation ([DeleteItemDialog](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e/src/components/lists/DeleteItemDialog.tsx#L34)); it does not explain that a reservation will be removed.
- The behavior is explicitly unresolved at the product level: the PRD says edit may invalidate a reserver's intent and deletion may silently drop a claim, while recording the confirmation-dialog requirement; it leaves notification/silent-drop handling as an open question ([PRD guardrails](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e/context/foundation/prd.md#L77), [PRD open question](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e/context/foundation/prd.md#L120)).
- **Guidance refinement**: the real regression oracle is DB behavior: delete an actively reserved item as the owner, assert via admin that the reservation row is gone and via the reserver that no claim remains; edit a reserved item and assert the reservation still points to the unchanged item id. Do not assert that the reserver is notified or that a claim is retained after deletion until the product open question is decided.

### Existing test base and cheapest layers

- The Vitest integration project uses local Supabase and publishes signed-in member clients plus a service-role control client through the existing fixtures ([reservation fixtures](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e327e/tests/helpers/reservationFixtures.ts#L1)).
- The concurrency test already demonstrates `beforeEach` fixture setup, `afterEach` cleanup, member-client operations, and service-role assertions ([reservation integration test](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e327e/tests/integration/reservations.concurrency.test.ts#L1)). Access-control tests similarly verify RLS-filtered empty reads and use admin control reads ([access-control integration test](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e/tests/integration/access-control.test.ts#L1)).
- There are no existing tests for reservation identity visibility, malformed action payloads, or item edit/delete while actively reserved. Integration is the cheapest credible layer for RLS, FK cascade, and member-visible state. Add narrowly scoped unit tests only for pure schema constraints; avoid E2E unless a stale cross-client UI state becomes an explicit requirement.

## Code References

- [src/actions/index.ts](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e327e/src/actions/index.ts#L92) - item actions bind Zod input schemas; reserve returns the service result at line 246.
- [src/lib/schemas/wishlist.ts](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e/src/lib/schemas/wishlist.ts#L22) - item create/update constraints and HTTP(S) URL refinement.
- [src/lib/services/items.ts](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e/src/lib/services/items.ts#L25) - owner-safe reservation-status view read; update/delete behavior.
- [src/lib/services/reservations.ts](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e/src/lib/services/reservations.ts#L27) - reservation create returns a row; owner-safe and claimer-scoped readers are separate.
- [supabase/migrations/20260527125732_initial_wishlist_schema.sql](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e/supabase/migrations/20260527125732_initial_wishlist_schema.sql#L48) - cascade FK; RLS and boolean view are defined later in the same migration.
- [tests/integration/reservations.concurrency.test.ts](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e/tests/integration/reservations.concurrency.test.ts#L1) - current DB integration test pattern.
- [src/pages/api/auth/signin.ts](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e/src/pages/api/auth/signin.ts#L11) and [src/pages/api/auth/signup.ts](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e/src/pages/api/auth/signup.ts#L7) - form parsing is not Zod-validated in these routes.

## Architecture Insights

- Privacy is enforced primarily at the database boundary, not by DTO sanitization: RLS hides reservation rows from non-claimers, while a security-definer boolean helper enables owner-visible reserved/free state without returning identity.
- Resource identity has two independent properties: UUID syntax is checked in Zod; resource authorization is checked by RLS. Tests should preserve that distinction and use separate malformed-id and foreign-resource cases.
- Item deletion semantics are owned by the FK cascade. App code does not explicitly release a reservation first, and the current behavior silently drops the claim; product expectations about communication remain undecided.
- The established service convention is to throw unexpected Supabase failures and map only meaningful failures at the action boundary. The codebase lesson on error-family consistency should guide any implementation response to tests, rather than adding new service error conventions.

## Historical Context (from prior changes)

- [context/archive/2026-09-13-testing-reservation-exclusivity/plan.md](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e327e/context/archive/2026-09-13-testing-reservation-exclusivity/plan.md#L1) established separate unit/integration Vitest projects, local Supabase fixtures, signed-in member clients for RLS, and service-role clients only for seeding/control assertions.
- [context/changes/testing-invitation-access-control/plan.md](https://github.com/lstojke/as-you-wish/blob/b50a594e09a013a2c5c38c912d1927c0c79e327e/context/changes/testing-invitation-access-control/plan.md#L1) established the invitation fixture pattern and warns that RLS read denials return empty results rather than errors; pair them with service-role controls.
- [context/foundation/lessons.md](../../foundation/lessons.md) requires stored URL schemas to reject schemes other than HTTP(S), recommends consistent service error conventions, and records accepted RLS/query pitfalls.

## Related Research

- [context/changes/testing-invitation-access-control/plan.md](../testing-invitation-access-control/plan.md) - prior access-control test rollout plan; no separate research artifact was present at research time.
- [context/archive/2026-09-13-testing-reservation-exclusivity/plan.md](../../archive/2026-09-13-testing-reservation-exclusivity/plan.md) - archived implementation plan used as historical context; no separate research artifact was present.

## Open Questions

- Should deletion of a reserved item explicitly warn that the active claim will be removed, notify the reserver, or continue silently? PRD Open Question 1 assigns this decision to the product owner and says it does not block MVP.
- Should this rollout include local Zod validation for `/api/auth/signin` and `/api/auth/signup`, or focus on Astro business actions and record auth routes as a separate follow-up?
- Should owners be permitted to invoke the reserve action directly? The UI hides the control, but current reservation RLS treats owners as list members.
- GitHub CLI was unavailable in this environment (`gh` not installed); permalinks above are formed from the configured `origin` remote and captured commit SHA `b50a594e09a013a2c5c38c912d1927c0c79e327e`.
