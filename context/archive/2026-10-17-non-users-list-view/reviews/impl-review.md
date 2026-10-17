<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Read-only wishlist links for non-members

- **Plan**: `context/changes/non-users-list-view/plan.md`
- **Scope**: All 3 phases
- **Date**: 2026-10-17
- **Commits**: `d7c698b^..39c3ed6`
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning and 1 observation found; both fixed during triage
- **Open findings**: 0

## Verdicts

| Dimension | Verdict |
| --- | --- |
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Verification

Fresh review execution passed:

- `npx supabase db reset --local`
- `npm run test:unit`: 16 tests
- `npm run test:integration`: 20 tests
- `npm run lint`
- `npx astro check`: zero errors/warnings; existing configuration deprecation hints
- `npm run build`
- The retained local HTTP smoke script passes `node --check`; live requests were not rerun during triage.

During implementation, 17 live SSR HTTP responses and 20 management-action responses were checked using temporary local-only scripts. Those scripts were subsequently removed. HTTP checks were not rerun during review after cleanup.

The user explicitly confirmed all manual checks, including corrected same-hostname member redirects, owner dialog lifecycle/clipboard behavior, and acknowledgment of provider bearer-path logging limitations. No manual completion was inferred solely from the diff.

Intent-aligned adaptations: catch-all share route handles missing/malformed token paths uniformly; shared price formatter preserves existing display; middleware applies no-store to sharing action responses. Existing invitation and reservation behavior is unchanged.

## Findings

### F1 - Migration assumes pgcrypto is already in extensions

- **Severity**: WARNING
- **Impact**: MEDIUM - real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: `supabase/migrations/20261017210751_list_share_links.sql:1-12`
- **Detail**: `CREATE EXTENSION IF NOT EXISTS ... WITH SCHEMA extensions` does not relocate an existing extension. The migration explicitly aborts when pgcrypto lives in `public`. The baseline migration enables pgcrypto without specifying its schema. The current local database uses `extensions` and passes; remote placement was not checked. A review-time local transaction relocated the extension to `public`, reproduced the `P0001` prerequisite failure, and rolled back all changes. This is a deployment compatibility prerequisite, not a data corruption or currently reproduced runtime failure.
- **Fix A (Recommended)**: Document and verify the expected placement as a deployment preflight; relocate only through an explicit database-owner operation if needed.
  - Strength: Avoids implicitly changing extension placement and existing dependencies.
  - Tradeoff: Adds a deployment prerequisite rather than supporting arbitrary placements.
  - Confidence: HIGH - local transactional reproduction confirms the behavior.
  - Blind spot: Actual remote extension placement and dependent objects.
- **Fix B**: Support either placement through a safely qualified crypto wrapper established during migration.
  - Strength: Removes the deployment prerequisite.
  - Tradeoff: Adds migration logic and placement-specific tests.
  - Confidence: MEDIUM - implementation and compatibility tests remain necessary.
  - Blind spot: Other installed-extension configurations and permissions.
- **Decision**: FIXED (Fix A) — documented the schema verification query and explicit database-owner prerequisite in the plan's Migration Notes.

### F2 - HTTP smoke checks are not retained in the repository

- **Severity**: OBSERVATION
- **Impact**: LOW - quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `tests/integration/list-shares.test.ts`; `src/pages/share/[...token].astro`
- **Detail**: Committed tests cover RPC/service behavior. Public SSR headers, member redirects, and sharing-action response cache controls passed temporary HTTP smoke scripts and user browser checks, but the scripts were removed during cleanup. Future CI runs cannot repeat those checks from the repository. This is a regression-coverage gap, not a confirmed route defect.
- **Fix**: Retain a local-only HTTP smoke script using existing tooling, covering response statuses/headers and member redirects without introducing a frontend framework.
- **Decision**: FIXED — added `tests/smoke/list-shares.mjs` for loopback-only HTTP status, privacy-header, and member-redirect checks; documented how to run it in the Phase 2 success criteria.

## Triage

Both findings were fixed. No findings remain pending.
