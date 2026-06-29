<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Create List With Items — Phase 4

- **Plan**: context/changes/create-list-with-items/plan.md
- **Scope**: Phase 4 of 4
- **Date**: 2026-06-29
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Findings

### F1 — AddItemForm duplicates schema instead of reusing itemCreateSchema

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/components/lists/AddItemForm.tsx:12-24
- **Detail**: Plan said `zodResolver(itemCreateSchema)` (reuse shared schema). Impl defines a local `addItemFormSchema`. Justified because the form field is a STRING (`priceInput "49.99"`) and the wire schema is NUMBER (`priceCents`). But the title cap (500), the http(s) URL refine, and the 2000-char URL cap are all duplicated — drift risk if either side changes. `CreateListDialog` reuses `listCreateSchema` directly because no transform is needed; AddItemForm is the first case where a transform was needed and the team chose duplication.
- **Fix A ⭐ Recommended**: Add a sibling `addItemFormSchema` in `src/lib/schemas/wishlist.ts` that the form imports.
  - Strength: Single source of truth for caps/refines; future schema changes touch one file. Matches the "shared schemas" pattern wishlist.ts was built for.
  - Tradeoff: Two schemas in the file (form-shaped + wire-shaped); slight cognitive cost.
  - Confidence: HIGH — same pattern already established.
  - Blind spot: None significant.
- **Fix B**: Keep the local schema; add a comment cross-referencing `itemCreateSchema` with the rationale (string vs number).
  - Strength: Smallest change; the components are already shipped.
  - Tradeoff: Drift risk persists (silent if title cap diverges).
  - Confidence: MEDIUM — relies on future devs reading comments.
  - Blind spot: None significant.
- **Decision**: PENDING

### F2 — 4.12 (server-error rollback) marked done despite user uncertainty

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/create-list-with-items/plan.md:475
- **Detail**: Progress row 4.12 is `[x]` but the user said "I am not sure if this works but okay nevermind" — no observable evidence in the diff (rollback path is implemented, but never exercised in manual test). The Network-offline test recipe is one-minute work.
- **Fix**: Retest 4.12 with DevTools Network → Offline → submit → confirm placeholder appears then disappears + red toast. Or flip back to `[ ]` and let /10x-archive surface it as warn-only.
- **Decision**: PENDING

### F3 — Optimistic placeholder hardcodes "USD"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/lists/AddItemForm.tsx:54,60
- **Detail**: Placeholder `currency = "USD"`; `currency` is not sent to the action, so the server defaults (also "USD" via `createItem`). Today they match — but the values are independent. If server default changes, the optimistic row flickers on replace.
- **Fix**: Either pass `currency: "USD"` in the action input, or add a one-line comment naming the cross-file invariant.
- **Decision**: PENDING

### F4 — priceInput / link not trimmed before refine

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/lists/AddItemForm.tsx:14-23
- **Detail**: Leading whitespace makes `v === ""` false and trips the http(s) refine. `title` uses `.trim().min(1)`; `priceInput`/`link` don't.
- **Fix**: Add `.trim()` to `priceInput` and `link`, or normalize in `onSubmit` before validation.
- **Decision**: PENDING

### F5 — astro-eslint-parser quirk is recurring; capture as lesson

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: eslint.config.js:62-72
- **Detail**: Phase 4 disabled `@typescript-eslint/no-misused-promises` in `astroConfig` because `astro-eslint-parser` crashes on `return` statements in frontmatter if-blocks. This is an environmental quirk that will recur every time a new `.astro` page uses the `return new Response(...)` pattern. Worth recording in `context/foundation/lessons.md` so future agents don't relitigate.
- **Fix**: Append a lesson naming the parser bug + the scoped-disable remedy.
- **Decision**: PENDING
