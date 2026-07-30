<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Manage own lists and items

- **Plan**: context/changes/manage-own-lists-and-items/plan.md
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-07-30
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Success criteria re-verified: `npm run lint` exit 0, `npx astro check` 0 errors / 0 warnings. All Phase 1–3 manual checks confirmed by the implementer.

## Findings

### F1 — Item edit unconditionally recomputes currency to USD

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (data safety)
- **Location**: src/lib/services/items.ts (updateItem)
- **Detail**: updateItem previously set currency = resolveCurrency(priceCents, input.currency) and mapItemFormToUpdate never sends a currency, so any stored non-USD currency would be silently overwritten with "USD" on edit. Unreachable today (no non-USD input path; plan scopes currency as implicit-USD) — latent, not active.
- **Fix (fix differently)**: updateItem now reads the item's existing currency and preserves it, only falling back to DEFAULT_CURRENCY when a price is newly added to an item that had none; price cleared → currency null. Closes the latent clobber without breaking add-price-on-edit.
- **Decision**: FIXED (fix differently). Deferred feature (per-user default currency in profile, system fallback PLN) captured in follow-ups/review-fixes.md.

### F2 — EditItemForm resets only on open, not on close

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/lists/EditItemForm.tsx:41-45
- **Detail**: RenameListDialog resets on both open and close; EditItemForm resets only on `open && item`. Behavior is correct (next open re-seeds) but asymmetric with the sibling dialog.
- **Fix**: Mirror RenameListDialog and also clear on close.
- **Decision**: ACCEPTED-AS-RULE: "Modal form dialogs must reset on both open and close" (context/foundation/lessons.md). Code left as-is per user choice.

## Strengths

- Shared `itemFormSchema` + `ItemFormFields` extraction closes the S-01 impl-review F1 drift risk (create/edit can no longer diverge).
- XSS lessons rule honored on both client `itemFormSchema` and server `itemUpdateSchema` (`/^https?:\/\//` refine, defense-in-depth).
- Item authz leans on `is_list_owner` RLS; no app-side ownership check duplicated.
- Optimistic delete-with-rollback reinserts at the original index (parity with the Phase 2 dashboard pattern).
