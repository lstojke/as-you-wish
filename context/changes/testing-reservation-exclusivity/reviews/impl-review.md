<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Bootstrap Vitest and prove reservation exclusivity under concurrency

- **Plan**: context/changes/testing-reservation-exclusivity/plan.md
- **Scope**: Phases 1–3 (all)
- **Date**: 2026-09-13
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Automated success criteria re-run at review time: `npm run lint` PASS, `npm run build` PASS, `npx prettier --check` (scoped) PASS, `npm test` 6/6 PASS. Security: `.env.test` untracked, no `sb_secret_` committed, RLS genuinely exercised via signed-in publishable-key member clients.

## Findings

### F1 — Fixture cleanup has no failure isolation

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: tests/helpers/reservationFixtures.ts (cleanup)
- **Detail**: cleanup() awaited the two deleteUser calls sequentially with no guard. A first-delete failure would skip the second, leaking an auth user (and its cascade) and potentially masking the real afterEach failure.
- **Fix**: Run both deletes under Promise.allSettled so one failure can't block the other.
- **Decision**: FIXED (Promise.allSettled; integration 2/2 + lint re-verified)

### F2 — Third error-handling style added to the service layer

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/ (reservations.ts vs invitations.ts vs items/lists.ts)
- **Detail**: The service layer now has three error conventions — result-unions (invitations.ts), a pure error-mapper (reservations.ts, new here), and throw-directly (items.ts / lists.ts). Pre-existing divergence this change nudges further; the reserve mapper itself is well-tested and justified.
- **Fix A ⭐ Recommended**: Record a canonical-error-handling rule; leave this change's code as-is.
  - Strength: Captures the decision without churning three shipped, tested modules.
  - Tradeoff: Divergence persists until a future consolidation.
  - Confidence: HIGH — the mapper here is the right call for this action.
  - Blind spot: Doesn't retrofit invitations/items/lists.
- **Fix B**: Refactor reservations to a result-union like invitations.
  - Strength: Aligns with the most testable existing pattern.
  - Tradeoff: Re-plumbs the action catch + unit tests for no functional gain.
  - Confidence: MED — larger blast radius than the problem warrants.
  - Blind spot: Other actions still throw-directly, so full consistency isn't achieved either way.
- **Decision**: ACCEPTED-AS-RULE — "Pick one error-handling convention per service function family" appended to context/foundation/lessons.md; code left as-is.

### F3 — 23505 match is structural duck-typing

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/reservations.ts:18
- **Detail**: reserveErrorPayload maps any object with code === "23505" to CONFLICT. 23505 is a Postgres-specific SQLSTATE, so a false match is very unlikely, and the integration test proves the real PostgrestError path. Defensible as-is.
- **Fix**: None recommended — intentional and test-covered. Optionally narrow later if a non-PG error ever reuses code "23505".
- **Decision**: SKIPPED
