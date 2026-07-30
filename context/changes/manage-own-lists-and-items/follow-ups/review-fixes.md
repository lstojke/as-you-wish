# Review follow-ups — manage-own-lists-and-items

Captured during full-plan impl-review (2026-07-30).

## Per-user default currency (new change, out of S-02 scope)

- **Idea**: Store a default currency on the user profile; apply it to new items when the user doesn't specify one.
- **System-wide fallback**: `PLN` (Polish market is the first go-to). Note: the interim service default is still `USD` (`DEFAULT_CURRENCY` in `src/lib/services/items.ts`); flipping it to `PLN` belongs to this feature change, not S-02.
- **Rough surface**:
  - Migration: add `default_currency` to the user/profile row (RLS + `'PLN'` default/backfill).
  - Profile UI to view/adjust the default.
  - Wire the default into `createItem` (replace hardcoded `DEFAULT_CURRENCY`) and `updateItem` currency resolution.
  - Decide whether to surface a per-item currency override in the item forms.
- **Next step**: open with `/10x-new` (and likely a roadmap entry) — do not bolt onto S-02.

## F1 (resolved in S-02)

- `updateItem` no longer clobbers a stored currency back to USD on edit; it preserves the existing value and only defaults when a price is newly added. See `src/lib/services/items.ts`.
