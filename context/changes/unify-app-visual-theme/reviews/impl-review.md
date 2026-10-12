<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Unify App Visual Theme

- **Plan**: context/changes/unify-app-visual-theme/plan.md
- **Scope**: Phases 1–4 of 4
- **Date**: 2026-10-12
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Verification

- `npm run build` — passed.
- `npx astro check` — passed, 0 errors and 0 warnings; 5 deprecation hints in `eslint.config.js`.
- `npm run lint` — passed.
- Topbar, starter-copy, and planned hard-coded palette scans — passed.
- Browser contrast spot-check: body/foreground, muted text, primary button text, badge text, destructive text, and input placeholder passed. The input boundary remains below the plan's 3:1 UI-boundary target by user choice. After F2 was fixed, focus-ring contrast measured 4.57:1 on cards and 5.00:1 on page background.
- Manual walkthrough was confirmed by the user. Full build, Astro check, and lint were rerun after the F2 fix and passed.

## Findings

### F1 — Auth input boundary contrast is below AA

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: [FormField.tsx](src/components/auth/FormField.tsx#L6), [global.css](src/styles/global.css#L29)
- **Detail**: The auth field uses `bg-input` and `border-input`, both resolving to the same translucent white token. In the rendered sign-in form, the border-to-fill contrast is 1.00:1 and the field boundary against the card is 1.63:1, below the plan's 3:1 UI-boundary requirement. The placeholder itself measured 4.53:1 over the rendered field and passes.
- **Fix**: Give the field boundary a distinct, sufficiently contrasting color from its fill and verify it against both the card and page backgrounds.
- **Decision**: ACCEPTED-AS-RULE — lesson recorded; current code left unchanged by choice.

### F2 — Shared focus rings fall below the 3:1 target

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: [button.tsx](src/components/ui/button.tsx#L8), [input.tsx](src/components/ui/input.tsx#L12)
- **Detail**: Shared shadcn buttons and inputs render `ring-ring/50`. The focused sign-in button's ring measured 2.08:1 against the card background, below the plan's 3:1 UI-boundary target. Custom auth fields use the full ring token, but shared controls across the app use the half-opacity variant.
- **Fix**: Increase the shared focus-ring contrast, then verify against both the card and page surfaces.
- **Decision**: FIXED — removed `/50` opacity from shared button and input focus rings; measured 4.57:1 on cards and 5.00:1 on page background. Targeted lint passed.

### F3 — Landing header has different outer inset

- **Severity**: 👀 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: [Welcome.astro](src/components/Welcome.astro#L27), [AppHeader.astro](src/components/AppHeader.astro#L5)
- **Detail**: The same `AppHeader` is mounted on each page, but the landing page wraps it in `p-4 sm:p-8` while dashboard and list pages render it directly under `Layout`. Its visible width/inset therefore differs from the inner-page header. This is a minor visual inconsistency, not a missing shared component.
- **Fix**: Align the outer landing header container if identical header geometry is intended.
- **Decision**: SKIPPED — user chose to leave the minor visual difference as-is.
