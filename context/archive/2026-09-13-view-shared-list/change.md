---
change_id: view-shared-list
title: View a shared list with per-item reservation status
status: archived
created: 2026-09-13
updated: 2026-09-13
archived_at: 2026-09-13T07:50:19Z
---

## Notes

Roadmap slice **S-04** (`view-shared-list`), PRD **FR-012**. Prereq S-03 (`share-list-by-email-invite`) is done/archived. Chain: S-03 → **S-04** → S-05 (reserve action).

- **Outcome**: A signed-in user invited to a list can open it and see every item with its current status (available or reserved), without seeing who reserved which item.
- **Key discovery**: the read-side infrastructure already exists from F-01 —
  - RLS already lets invitees open `/lists/[id]` (`lists_select` = owner OR `is_list_invitee`; items via `is_list_member`).
  - The identity-safe read model `item_reservation_status` view (`security_invoker = true`, exposes only `item_id, list_id, is_reserved`; never `claimer_id`) exists but is **not queried anywhere yet**.
  - Its TypeScript type already exists in `src/db/database.types.ts` (Views).
  - `ListDetail` already gates mutation UI behind `isOwner`.
- **Delta S-04 delivers**: query the view, render an Available/Reserved badge per item (for everyone, incl. owner), and fix the `AddItemForm` owner-gate leak.
- **Out of scope**: reserving/releasing items (S-05); owner aggregate count (FR-014); an owner "gift-surprise" toggle to hide badges (documented as a follow-up).
