<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Invitation & Access-Control Integration Tests

- **Plan**: context/changes/testing-invitation-access-control/plan.md
- **Scope**: All 3 phases
- **Date**: 2026-09-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 3 observations

Automated re-run at review time: lint clean · unit 4/4 · integration 8/8 · types clean (editor diagnostics on all 5 changed files).

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — Recorded "npm run typecheck" gate does not exist

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/testing-invitation-access-control/plan.md (Progress rows 1.1, 2.1)
- **Detail**: The plan's Automated Verification lists `npm run typecheck` and Progress rows 1.1 and 2.1 mark it `[x] — <sha>`. No `typecheck` script exists in package.json — `npm run typecheck` errors ("missing script"), so a gate recorded as passing cannot have run. Types ARE actually clean (verified via editor diagnostics on all 5 changed files), so intent is met, but the ledger asserts a command that can't pass — a rubber-stamp risk for future reviewers who trust the Progress log.
- **Fix A ⭐ Recommended**: Add a real typecheck script (`"typecheck": "astro check"` or `"tsc --noEmit"`) to package.json.
  - Strength: Turns a phantom gate into a genuinely runnable, CI-enforceable check — test-plan Phase 4 is literally "Quality-gates wiring".
  - Tradeoff: `astro check`/`tsc --noEmit` surfaces the known pre-existing InviteDialog.tsx react-hook-form typing errors, making the gate red until those are addressed.
  - Confidence: MED — the tsc noEmit run is known to surface unrelated pre-existing errors; astro check behavior not yet run here.
  - Blind spot: Whether the pre-existing errors block a clean gate today.
- **Fix B**: Correct the record — edit the two Progress rows and plan Automated bullets to state type verification is via `astro check` in CI / editor diagnostics, not `npm run typecheck`.
  - Strength: Zero risk; makes the ledger truthful immediately.
  - Tradeoff: Leaves the repo without a one-command type gate (defers real fix to test-plan Phase 4).
  - Confidence: HIGH — purely a documentation correction.
  - Blind spot: None significant.
- **Decision**: PENDING

### F2 — Reserve-denied test uses a loose rejection matcher

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/integration/access-control.test.ts:36
- **Detail**: `await expect(createReservation(outsider.client, { itemId })).rejects.toBeDefined()` passes on ANY rejection, not specifically the RLS WITH CHECK violation. A reject for an unrelated reason (bad itemId, network, a future refactor that throws early) would still go green — the test could pass without proving RLS denies the reserve. The follow-up service-role row-count assertion (length 0) partially compensates, but the rejection itself is under-specified.
- **Fix**: Tighten the matcher to assert the error shape — capture the rejection and assert it's a PostgrestError whose code is the RLS violation (42501 / "new row violates row-level security policy"), or at minimum `.rejects.toThrow()`. Mirrors how the accept spec asserts exact `reason` values rather than "something failed".
- **Decision**: PENDING

### F3 — Unplanned `pg` dependency + SUPABASE_DB_URL

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: package.json, tests/helpers/supabaseTestClients.ts:2,50
- **Detail**: The plan assumed `enable_confirmations = false` would let an unconfirmed user sign in. That assumption was false (GoTrue refuses), so a new `pg`/`@types/pg` devDep + `SUPABASE_DB_URL` were added to null email_confirmed_at directly. Justified, user-approved, and documented in test-plan §6.6 — noted only because it's a real scope addition (a new third-party dep) beyond the plan.
- **Fix**: None needed — accept as documented deviation.
- **Decision**: PENDING

### F4 — FIXTURE_PASSWORD name still embeds "concurrency"

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/helpers/supabaseTestClients.ts:7
- **Detail**: Value "concurrency-fixture-pw-123!" now lives in the SHARED module used by invitation + access-control specs too, so the "concurrency" label is stale/misleading.
- **Fix**: Rename to a neutral value, e.g. "integration-fixture-pw-123!".
- **Decision**: PENDING

### F5 — Plan's "Key Discoveries" still states the disproven assumption

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/testing-invitation-access-control/plan.md (Current State Analysis / Key Discoveries)
- **Detail**: The plan still claims "an email_confirm: false user can signInWithPassword, so the P0001 path is reachable" — which implementation disproved. test-plan §6.6 has the correct story, but the change-plan itself was never corrected, so a reader of the plan alone would inherit the wrong mental model.
- **Fix**: Add a one-line addendum under Key Discoveries pointing to the §6.6 pg/un-confirm reality.
- **Decision**: PENDING
