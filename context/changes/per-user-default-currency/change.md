---
change_id: per-user-default-currency
title: Per-user default currency with PLN system fallback
status: planned
created: 2026-07-30
updated: 2026-07-30
archived_at: null
---

## Notes

Seeded from the S-02 impl-review follow-up (`context/archive/2026-06-29-manage-own-lists-and-items/follow-ups/review-fixes.md`).

- **Idea**: Store a default currency on the user profile; apply it to new items when the user doesn't specify one.
- **System-wide fallback**: `PLN` (Polish market is the first go-to). The interim service default is still `USD` (`DEFAULT_CURRENCY` in `src/lib/services/items.ts`); flipping it to `PLN` belongs to this change.
- **Rough surface**:
  - Migration: add `default_currency` to the user/profile row (RLS + `'PLN'` default/backfill).
  - Profile UI to view/adjust the default.
  - Wire the default into `createItem` (replace hardcoded `DEFAULT_CURRENCY`) and `updateItem` currency resolution.
  - Decide whether to surface a per-item currency override in the item forms.
- **Prior context**: S-02's F1 fix already made `updateItem` preserve a stored currency instead of clobbering it to USD, so this change can build on that without regressing edits.
