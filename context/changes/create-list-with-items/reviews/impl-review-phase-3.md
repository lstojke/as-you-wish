<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Create List With Items

- **Plan**: context/changes/create-list-with-items/plan.md
- **Scope**: Phase 3 of 4
- **Date**: 2026-06-28
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical  4 warnings  3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — `client:only` instead of `client:load`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence / Safety & Quality
- **Location**: src/pages/dashboard.astro:34
- **Detail**: Plan specified `client:load`; implementation uses `client:only="react"`. During Phase 3 a runtime crash ("Invalid hook call") forced the change — `client:load` caused Astro to SSR the island using a different React instance than react-hook-form and Radix UI, producing a null.useState error. `client:only` is the confirmed fix. Tradeoff: server-fetched data is not in the initial HTML; user sees a blank section until React loads.
- **Fix A ⭐ Applied**: Kept `client:only` and added an inline comment documenting why (the React instance mismatch root cause). Plan contract updated with an addendum.
  - Strength: Already working; root cause confirmed; zero regression risk.
  - Tradeoff: Layout shift on every dashboard load.
  - Confidence: HIGH
  - Blind spot: Untested whether splitting Dialog to its own island would allow DashboardLists to use client:load.
- **Fix B**: Extract Dialog to `client:only`; restore DashboardLists to `client:load`.
  - Strength: Eliminates layout shift; fixes root cause precisely.
  - Tradeoff: Splits the island; untested.
  - Confidence: MED
- **Decision**: FIXED via Fix A

### F2 — `listOwnedAndShared` shared query silently depends on RLS

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence / Safety & Quality
- **Location**: src/lib/services/lists.ts:19–23
- **Detail**: Plan called for an invitations join. Actual implementation uses `.neq("owner_id", user.id)` with no join — deliberate runtime fix because the invitations join was blocked by `invitations_select` RLS requiring `email_verified = 'true'` JWT claim. `lists_select` RLS + `is_list_invitee()` (SECURITY DEFINER) correctly handles visibility. Production behaviour is correct but the RLS dependency is undocumented.
- **Fix**: Add a comment naming the RLS dependency to prevent future devs from adding joins or service-role clients that bypass it.
- **Decision**: RECORDED AS LESSON (context/foundation/lessons.md) — code comment deferred

### F3 — `getUser()` error field ignored in `listOwnedAndShared`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/lists.ts:10–15
- **Detail**: `client.auth.getUser()` called without inspecting `error`. On Supabase auth failure, silently returns empty arrays. All other error paths in this file throw on error — this was the exception.
- **Fix**: Destructure and throw on auth error: `const { data: { user }, error: authError } = await client.auth.getUser(); if (authError) throw authError;`
- **Decision**: FIXED

### F4 — No error handling in dashboard.astro for `listOwnedAndShared`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:12
- **Detail**: `listOwnedAndShared` had no try/catch. A Supabase error would produce an unhandled 500. Note: `return Astro.redirect()` inside a catch block triggers an `astro-eslint-parser` crash (`no-misused-promises`), so the fix uses graceful degradation to empty arrays rather than redirect.
- **Fix**: Wrapped in try/catch; logs error and continues with empty arrays (graceful degradation over 500 error page).
- **Decision**: FIXED

### F5 — `userEmail` prop dropped from DashboardLists

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/dashboard.astro / DashboardLists.tsx
- **Detail**: Plan passed `userEmail` as a prop to the React island. Actual implementation renders user email in the static Astro `<header>` instead. Better design — static content belongs in Astro. Plan contract was stale.
- **Fix**: Updated plan.md Phase 3 contract to reflect the Astro-header approach.
- **Decision**: FIXED (plan updated)

### F6 — `owner_id: ""` sentinel violates ListRow structural invariant

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/dashboard/CreateListDialog.tsx
- **Detail**: Optimistic placeholder uses `owner_id: ""` — not a valid UUID. Currently harmless; `owner_id` is not rendered anywhere. Becomes a trap if future components do permission checks on `ListRow`.
- **Fix**: Pass the real user ID as a prop to `CreateListDialog`.
- **Decision**: SKIPPED

### F7 — Mixed default/named exports across sibling components

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/dashboard/
- **Detail**: `DashboardLists.tsx` used `export default`; `CreateListDialog.tsx` used `export function` (named). Existing convention is `export default`.
- **Fix**: Changed `CreateListDialog.tsx` to `export default function`; updated import in `DashboardLists.tsx`.
- **Decision**: FIXED
