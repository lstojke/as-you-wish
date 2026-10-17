<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Per-user default currency with PLN system fallback

- **Plan**: `context/changes/per-user-default-currency/plan.md`
- **Mode**: Deep
- **Date**: 2026-10-17
- **Verdict**: REVISE
- **Findings**: 1 critical, 2 warnings, 1 observation; 3 fixed, 1 accepted

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding

9/9 planned paths exist; key symbols and call sites were verified; the plan and brief agree on scope. No `docs/reference/contract-surfaces.md` was present.

## Findings

### F1 — Progress section did not meet the plan contract

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase headings and final `## Progress` section
- **Detail**: Phase headings did not use the required `## Phase N: <name>` format; Progress was not last; checkboxes were flat and did not separate Automated and Manual criteria. This risked breaking phase parsing and losing criterion traceability.
- **Fix**: Matched phase headings and Progress headings, split verification criteria into Automated/Manual sections with numbered checkboxes, and moved Out of scope before Progress.
- **Decision**: FIXED

### F2 — Database accepts currencies outside the supported set

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 migration, `default_currency` constraint
- **Detail**: The proposed `^[A-Z]{3}$` check permits unsupported values, while self-update RLS allows an authenticated user to bypass action-level Zod validation through direct Supabase API writes.
- **Fix**: Constrain the database value to `PLN`, `EUR`, `USD`, or `GBP`.
- **Decision**: ACCEPTED — user will handle the risk during implementation; plan remains REVISE until the invariant is enforced or the risk is otherwise addressed.

### F3 — Profile provisioning and RLS lacked automated coverage

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 verification and plan conventions
- **Detail**: The plan claimed there was no test runner, but Vitest and local Supabase integration tests already exist. Only manual DB inspection and `astro check` were planned for the first per-user provisioning/RLS boundary.
- **Fix**: Corrected the plan's stale test-runner statement and added `tests/integration/profiles.test.ts` coverage for signup provisioning/defaults and self-only read/update access. The one-time migration backfill remains a manual verification.
- **Decision**: FIXED

### F4 — Settings-link placement was underspecified

- **Severity**: · OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3, shared navigation
- **Detail**: The plan placed a settings link in `dashboard.astro`, although the shared `AppHeader` renders Sign out across signed-in pages.
- **Fix**: Specified a shared `AppHeader` profile-circle menu showing the uppercase first character of the email, with Settings and Sign out actions. Name-based initials and profile photos are future scope.
- **Decision**: FIXED — per user preference, the avatar opens a menu.
