# View a Shared List with Reservation Status — Plan Brief

> Full plan: `context/changes/view-shared-list/plan.md`

## What & Why

Roadmap slice **S-04** (PRD **FR-012**): a signed-in user invited to a list can open it and see every item with its current status — **available** or **reserved** — without seeing who reserved which item. This makes shared lists useful to gifters while preserving the recipient's surprise and reservers' anonymity.

## Starting Point

The read side is already built by F-01/S-03. Invitees can already open `/lists/[id]` (RLS `lists_select` + `items_select` via `is_list_member`), mutation UI is already gated behind `isOwner`, and the identity-safe `item_reservation_status` view (exposes only `item_id, list_id, is_reserved`, never `claimer_id`) exists — but is not queried anywhere. Items currently render title/price/link with no status.

## Desired End State

Invitees open a shared list and see each item tagged "Available" or "Reserved", with no add/edit/delete controls. The owner sees the same badges plus all existing owner controls. Nobody — owner included — can see who reserved an item.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Who sees the status badge | Everyone, incl. owner | Product chose full visibility now; owner opt-out deferred to a follow-up | Plan |
| Owner "gift-surprise" toggle | Deferred (documented) | Separate feature to let owners hide badges to preserve surprise | Plan |
| Add-item form for non-owners | Gate behind `isOwner` | Removes a form that 500s at RLS; matches existing gating | Plan |
| Status presentation | Badge only (no muted row) | Minimal, consistent with existing badges; no reserve interaction yet | Plan |
| Summary count | None | Avoids overlap with FR-014 owner-aggregate feature | Plan |
| Reserve/release action | Out of scope | Belongs to S-05; keeps this a read-only slice | Plan |
| Status data source | `item_reservation_status` view | Purpose-built, identity-safe; type already generated | Plan |

## Scope

**In scope:** read service for reserved item IDs; SSR wiring in `[id].astro`; per-item Available/Reserved badge in `ItemsList`; gate `AddItemForm` behind `isOwner`.

**Out of scope:** reserve/release action (S-05); owner aggregate count (FR-014); owner badge-hide toggle (follow-up); any schema/migration change.

## Architecture / Approach

Add `listReservedItemIds(client, listId): Promise<string[]>` selecting from the `item_reservation_status` view. Fetch it SSR in `[id].astro` next to items, pass a JSON-serializable `string[]` prop through `ListDetail` into `ItemsList` (`client:only="react"` — no `Set`/`Map` props), and render a badge per row. Separately move `AddItemForm` inside the existing `isOwner` block.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Shared-list reservation status display | Read service + SSR wiring + per-item badge + add-form gate | Minimal — reuses existing view, RLS, and badge; main care is prop serialization and not leaking owner UI |

**Prerequisites:** S-03 done (invitations + shared access) — complete/archived.
**Estimated effort:** ~1 session, single phase.

## Open Risks & Assumptions

- Until S-05 lands, no reservations exist, so every badge reads "Available" — expected, not a bug.
- Assumes the generated `Views.item_reservation_status` type stays in sync with the migration (verified present).
- Optimistically-added items (owner) show "Available" by falling through the reserved set — correct.

## Success Criteria (Summary)

- An invitee sees per-item Available/Reserved status with no mutation UI.
- An owner sees the same badges plus full owner controls; a SQL-inserted reservation flips an item to "Reserved".
- No viewer can see who reserved any item.
