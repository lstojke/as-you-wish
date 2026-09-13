# Gift-Giver Reserves an Item Exclusively — Plan Brief

> Full plan: `context/changes/reserve-item-exclusively/plan.md`

## What & Why

Roadmap slice **S-05** (PRD **US-01 / FR-013**): a signed-in viewer of a shared list can **reserve** an available item — the claim is exclusive (two simultaneous taps resolve to exactly one winner) and the list owner never learns who reserved. This is the load-bearing concurrency rule: without it the product's core "no duplicate gifts" promise doesn't exist. Scope also includes **FR-015** (cancel your own reservation), pulled in during planning.

## Starting Point

The hard part is already built. F-01 landed the `reservations` table, the exclusivity guarantee (unique partial index on `(item_id) where released_at is null`), claimer-scoped RLS (owner can't read `claimer_id`), and the identity-safe `item_reservation_status` view. S-04 already renders Available/Reserved badges from that view. What's missing is only the **write path** (reserve/release), a **claimer-scoped "did I reserve this?" read**, and the **Reserve/Cancel buttons**.

## Desired End State

A non-owner viewing a shared list sees, per item, one of: **Available** + Reserve button; **Reserved by you** + Cancel button; or **Reserved** (no button, claimer hidden). A lost race shows "someone just reserved this" and flips the badge to Reserved. The **owner**, on their own list, sees badges only — no Reserve/Cancel controls and no reserver identity anywhere.

## Key Decisions Made

| Decision                           | Choice                                   | Why (1 sentence)                                                                             | Source |
| ---------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------- | ------ |
| Owner sees Reserve on own list     | Hide entirely                            | Owner is the recipient; reserving your own gift is meaningless and self-spoiling             | Plan   |
| "Reserved by you" vs "Reserved"    | Distinct label + claimer-scoped read     | Satisfies the US-01 criterion "the reserver can see they hold the claim"                     | Plan   |
| Concurrency conflict UX            | Detect `23505`, toast + flip to Reserved | Honest, self-healing; reflects true DB state instead of a generic error                      | Plan   |
| Apply timing                       | Pending state, flip on confirm           | Reserve has a real failure mode; avoids a misleading optimistic "you got it" that rolls back | Plan   |
| Cancel own reservation (FR-015)    | **In scope**                             | User elected to round out the flow now (release sets `released_at`)                          | Plan   |
| Owner edit/delete of reserved item | No change; documented open item          | PRD Open Question 1 defers this; surfacing "reserved" to the owner risks the privacy model   | Plan   |
| Post-reserve refresh               | Update client state in place             | Matches ListDetail's in-memory state pattern; no extra round-trip                            | Plan   |

## Scope

**In scope:** reserve + cancel zod schemas; new `reservations.ts` service (`createReservation`, `releaseReservation`, `listMyReservedItemIds`); two Astro actions with `23505` → `CONFLICT` mapping; SSR wiring of "reserved by you"; Reserve/Cancel UI + pending + conflict self-heal in `ItemsList`/`ListDetail`.

**Out of scope:** any schema/migration/RLS/view change; owner aggregate count (FR-014); owner-facing enforcement on editing a reserved item (Open Question 1); realtime updates; reserver-identity disclosure.

## Architecture / Approach

Follows the established action → service → schema layering. Services set `claimer_id` from `client.auth.getUser()` (same as `createList` sets `owner_id`). Exclusivity is enforced by the DB unique index; a lost race surfaces as a Postgres `23505` that the reserve action translates to `ActionError({ code: "CONFLICT" })`, which the client turns into a toast + badge flip. "Reserved by you" is read by querying `reservations` filtered with `.in("item_id", ids)` (no nested `!inner` join — per lessons.md) with RLS scoping rows to the caller. `ListDetail` holds reservation state and reserve/cancel handlers; `ItemsList` stays presentational.

## Phases at a Glance

| Phase                  | What it delivers                                                             | Key risk                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1. Reservation backend | Schemas, `reservations.ts` service, two actions, conflict mapping            | Getting the `23505` → `CONFLICT` mapping right; not swallowing the DB error in the service     |
| 2. Reserve / cancel UI | SSR "reserved by you", `ListDetail` state/handlers, `ItemsList` three states | Keeping `reserved`/`myReserved`/`pending` sets in sync; not leaking owner controls or identity |

**Prerequisites:** S-04 done (shared-list view + badges) — complete/archived. Local Supabase (`npx supabase start`) for the concurrency check.
**Estimated effort:** ~2 sessions across 2 phases.

## Open Risks & Assumptions

- The owner must never read `claimer_id`; the "reserved by you" read uses claimer-scoped RLS and the owner path uses only the boolean view — no code path should join reservations for owners.
- No realtime: another viewer's reservation only appears on next load; the conflict path covers the one interactive case that matters.
- Assumes generated `Database` types for `reservations`/`item_reservation_status` stay in sync with F-01 (verified present).

## Success Criteria (Summary)

- A non-owner can reserve an available item and cancel their own reservation; the badge reflects Available / Reserved by you / Reserved.
- Two simultaneous reserves yield exactly one winner; the loser is told and sees Reserved.
- The owner sees status but never the reserver's identity, and has no reserve/cancel controls on their own list.
