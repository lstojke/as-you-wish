---
change_id: testing-reservation-exclusivity
title: Bootstrap Vitest and prove reservation exclusivity under concurrency
status: implemented
created: 2026-09-13
updated: 2026-09-13
archived_at: null
---

## Notes

Rollout Phase 1 of context/foundation/test-plan.md: "Bootstrap + reservation exclusivity".
Risks covered: #1 (exclusive-claim rule fails — two simultaneous Reserve taps both succeed, so two relatives buy the same gift).
Test types planned: unit + integration.
Risk response intent: prove that two concurrent reserves on one available item resolve to exactly one success, the losing caller gets a clean rejection, and the DB holds exactly one claim — exclusivity must hold at the DB boundary under real concurrency, not just single-threaded. This phase also bootstraps the Vitest runner (no test infra exists yet).
