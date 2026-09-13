# Reservation Exclusivity Testing (Vitest Bootstrap) — Plan Brief

> Full plan: `context/changes/testing-reservation-exclusivity/plan.md`
> Research: `context/changes/testing-reservation-exclusivity/research.md`

## What & Why

Stand up a Vitest test runner (none exists yet) and use it to prove Test Plan Risk #1: two relatives tapping Reserve on the same gift at the same time must resolve to exactly one claim — otherwise two people buy the same present. Exclusivity is enforced only by a DB unique partial index, so the proof must run a real concurrent race against real Postgres.

## Starting Point

The app reserves items via a direct `.insert()` on `reservations`; a lost race surfaces as Postgres `23505`, which the action maps to a `CONFLICT`. No test infrastructure exists at all (no Vitest, config, or `test` script). `vite@^7` is already pinned, and the reservation service module is free of runtime Astro imports — both make bootstrapping low-friction.

## Desired End State

`npm test` runs a fast unit project and a local-Supabase integration project. A unit test locks the `23505 → CONFLICT` contract; an integration test fires two concurrent reserves by two list members on one item and asserts exactly one success, one `23505` rejection, and exactly one active row in the DB. The test-plan cookbook documents the reusable unit + integration patterns.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Test entry point | Service `createReservation` race + separate unit test for the mapping | Exercises the real RLS + index path with minimal harness; the CONFLICT mapping is proven cheaply in isolation | Plan |
| Fixture seeding | Programmatic helper via service-role `auth.admin.createUser` | Self-contained and per-run isolated; no dependency on a global seed file | Plan |
| Local env wiring | Committed `.env.test` with well-known local demo keys | Deterministic, no runtime CLI dependency, safe (local keys are public constants) | Plan |
| Concurrency mechanism | `Promise.allSettled` over two separate signed-in clients | Real parallel connections in-process; the index makes the outcome deterministic regardless of interleaving | Plan |
| Mapping unit coverage | Assert `23505→CONFLICT` and generic`→500` | Locks the full user-facing error contract, completing the two-piece proof | Plan |
| File layout | `tests/integration` + colocated `src` unit specs | Cleanly separates slow DB tests from fast unit tests for independent gating | Plan |
| Error-mapping seam | Extract a pure `reserveErrorPayload` helper into the service module | Gives a testable seam without pulling `astro:*` virtual modules into the unit graph | Research |

## Scope

**In scope:**
- Vitest install + config with unit/integration projects and `@/*` alias
- Extract the reserve error-mapping helper; unit-test it
- `.env.test` + integration setup + programmatic fixture helper
- Concurrency integration test (the Risk #1 proof) + release/re-reserve check
- Document the patterns in the test-plan cookbook and README

**Out of scope:**
- CI wiring (test-plan Phase 4)
- Invitation/access, IDOR, reserver-identity privacy, input-validation tests (Phases 2–3)
- e2e/Playwright; any change to the exclusivity mechanism or RLS
- A global `supabase/seed.sql`

## Architecture / Approach

Two Vitest projects. The **unit** project (env `node`, `src/**/*.test.ts`, no external deps) validates the extracted `reserveErrorPayload` helper. The **integration** project (`tests/integration/**`, setup file loading `.env.test`) seeds a membership graph (owner + accepted invitee + item) with a service-role client, then acts as two anon-key signed-in members that race `createReservation` concurrently. The unique partial index `reservations_one_active_per_item` is the mechanism under test; the assertion holds regardless of interleaving because the second insert always violates the index.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Bootstrap Vitest + mapping unit test | Runner works; `23505→CONFLICT` contract locked; no DB needed | Vitest/vite@7 config + alias correctness |
| 2. Integration harness + concurrency proof | Local-stack wiring, fixtures, the Risk #1 race test | Seeding email-confirmed members through RLS; local-stack env correctness |
| 3. Document the pattern | Cookbook §6.1/6.2/6.5 + README run-tests note | Low — prose only |

**Prerequisites:** Docker + local Supabase (`npx supabase start`) for Phase 2; Node 22.14.
**Estimated effort:** ~2–3 focused sessions across the three phases.

## Open Risks & Assumptions

- Assumes the well-known local Supabase demo keys are stable for this CLI version; the setup file fails fast if the stack is unreachable.
- Assumes `auth.admin.createUser({ email_confirm: true })` is sufficient to satisfy any confirmed-email gating for reserving (reserve itself gates on membership, not email-confirmation — that gate is Phase 2's invitation concern).
- Extracting the mapping helper is a minimal, behavior-preserving refactor of the action; observable codes/messages/logging stay identical.

## Success Criteria (Summary)

- `npm test` runs unit + integration suites green with the local stack up.
- The concurrency test proves exactly one of two simultaneous reserves wins, the loser gets a clean `23505`/`CONFLICT`, and the DB holds exactly one active claim.
- Dropping the unique index makes the concurrency test fail — proving it exercises the DB guarantee, not an app-layer check.
