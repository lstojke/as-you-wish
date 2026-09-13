---
change_id: reserve-item-exclusively
title: Gift-giver reserves an item exclusively (with self-cancel)
status: archived
created: 2026-09-13
updated: 2026-09-13
archived_at: 2026-09-13T09:38:48Z
---

## Notes

Roadmap slice **S-05** (PRD **US-01**, **FR-013**) — the load-bearing concurrency rule.
Scope pulled to include **FR-015** (cancel your own reservation) per planning decision.

- The DB foundation (F-01) already enforces exclusivity: unique partial index
  `reservations_one_active_per_item on (item_id) where released_at is null`, plus
  claimer-scoped RLS on `reservations` (owner never sees `claimer_id`).
- The read side (S-04) already renders Available/Reserved badges via the
  identity-safe `item_reservation_status` view.
- This change adds the write path (reserve + release), a claimer-scoped
  "reserved by you" read, and the Reserve/Cancel UI.
