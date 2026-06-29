<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Create list with items

- **Plan**: context/changes/create-list-with-items/plan.md
- **Scope**: Phase 2 of 4
- **Date**: 2026-05-28
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 2 observations
- **Commit reviewed**: b760add

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Action catch blocks swallow all errors

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/actions/index.ts:31, src/actions/index.ts:48
- **Detail**: Both `lists.create` and `items.create` use bare `catch {}` → generic INTERNAL_SERVER_ERROR. RLS denials, unique-constraint violations, and network errors all collapse with no logging. Wrangler tail / prod debugging is blind.
- **Decision**: FIXED — log error before re-throw in both action handlers

### F2 — currency stored without price (asymmetric branch)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/items.ts:22
- **Detail**: `currency = priceCents !== undefined ? (currency ?? "USD") : (currency ?? null)`. Branch B keeps user-supplied currency even when price is absent, producing rows like `{price_cents: null, currency: "EUR"}` — semantically meaningless and inconsistent with the "currency defaults to USD only when price is set" plan intent.
- **Fix A ⭐ Recommended**: tighten the schema in wishlist.ts so the invalid input is rejected at the boundary.
  - Strength: Validation lives with other input rules; client and server both reject it; future callers can't trip it.
  - Tradeoff: Requires a zod `.refine` — slightly more schema code.
  - Confidence: HIGH — Astro Actions runs zod before the handler.
  - Blind spot: None significant.
- **Fix B**: drop currency when priceCents is undefined inside the service: `currency: priceCents !== undefined ? ... : null`.
  - Strength: One-line change, no schema churn.
  - Tradeoff: Silently discards user input — surprising contract.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — added .refine to itemCreateSchema

### F3 — z.url() allows javascript: and data: URIs (stored-XSS class)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/schemas/wishlist.ts:17
- **Detail**: `z.url()` accepts `javascript:alert(1)` and `data:text/html,...`. When Phase 4 renders item links as `<a href={item.link}>`, a list member could plant a clickable XSS payload visible to other family members.
- **Decision**: FIXED + ACCEPTED-AS-RULE: Restrict user-supplied URLs to http(s) at the schema boundary

### F4 — ESLint vendor override scope is too broad

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: eslint.config.js:71
- **Detail**: Override disables `no-unnecessary-condition`, `no-unnecessary-type-conversion`, `no-redundant-type-constituents` for all of `src/components/ui/**`. Future hand-written composites placed under ui/ silently lose strict typing.
- **Decision**: FIXED — added vendored-only comment above eslint override

### F5 — listOwnedAndShared returns empty arrays on no user

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Architecture
- **Location**: src/lib/services/lists.ts:9-15
- **Detail**: Defensive `return { owned: [], shared: [] }` when no user. Inside actions this is dead code (requireSupabase already throws). From Astro pages it masks broken auth.
- **Fix**: leave as-is; PROTECTED_ROUTES middleware handles redirect. Revisit only if a public surface calls this service.
- **Decision**: ACCEPTED — accept as-is

### F6 — invitations cast in shared-list query

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/lists.ts:31-34
- **Detail**: `row as ListRow & { invitations: unknown }` is functional but fights supabase-js's inferred join type. Not worth refactoring today.
- **Decision**: ACCEPTED — not worth refactoring today
