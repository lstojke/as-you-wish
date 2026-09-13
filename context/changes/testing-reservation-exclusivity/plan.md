# Reservation Exclusivity Testing (Vitest Bootstrap) Implementation Plan

## Overview

Stand up a Vitest test runner (unit + integration projects) for this Astro + Supabase project and use it to prove Test Plan Risk #1: two concurrent reserves on one available item resolve to exactly one success, the losing caller gets a clean rejection, and the database holds exactly one active claim. This is Phase 1 of the phased test rollout in [context/foundation/test-plan.md](../../foundation/test-plan.md) and establishes the reusable patterns (unit + local-Supabase integration) that later phases build on.

## Current State Analysis

- **No test infrastructure exists**: no `vitest`, no config, no `test` script, no `*.test.ts` files. `vite@^7` is already pinned via `overrides` in [package.json](../../../package.json), so Vitest is the low-friction runner.
- **Exclusivity is enforced only at the DB boundary**: the unique partial index `reservations_one_active_per_item on public.reservations (item_id) where released_at is null` ([supabase/migrations/20260527125732_initial_wishlist_schema.sql](../../../supabase/migrations/20260527125732_initial_wishlist_schema.sql#L69-L72)). There is no RPC, no `FOR UPDATE`, no `ON CONFLICT`, no app-layer check. A lost race surfaces as Postgres `23505`.
- **Reserve path**: action `reservations.reserve` ([src/actions/index.ts](../../../src/actions/index.ts#L240-L261)) → service `createReservation` ([src/lib/services/reservations.ts](../../../src/lib/services/reservations.ts#L13-L28)) → `.insert({ item_id, claimer_id })`. The action maps `err.code === "23505"` → `ActionError({ code: "CONFLICT", message: "Someone just reserved this item first" })`, and any other error → `INTERNAL_SERVER_ERROR` (logging only in that branch).
- **RLS requires membership**: `reservations_insert` gates on `claimer_id = auth.uid() and is_item_list_member(item_id)`. Both racers must be list members (owner or accepted invitee). Membership helpers are SECURITY DEFINER: `is_list_invitee` returns true when an `invitations` row has `accepted_by_user_id = auth.uid()` ([supabase/migrations/20260527125732_initial_wishlist_schema.sql](../../../supabase/migrations/20260527125732_initial_wishlist_schema.sql#L140-L152)).
- **Env divergence trap**: app secrets are read via `astro:env/server`; `.env` and `.dev.vars` point at a **remote** Supabase project. Integration tests must target the **local** stack (`http://127.0.0.1:54321`, DB `54322`) and must NOT reuse the remote values.
- **Precedent**: [context/archive/2026-05-27-wishlist-data-schema/race-test.sh](../../archive/2026-05-27-wishlist-data-schema/race-test.sh) already proved FR-013 via two concurrent inserts asserting exactly one success + one `23505` — portable as the concurrency pattern.
- **Import-graph fact**: [src/lib/services/reservations.ts](../../../src/lib/services/reservations.ts#L1-L4) has only type-only imports (no runtime `astro:*`), so a pure helper placed there is unit-testable without the Astro Vite plugin.

## Desired End State

- `npm test` runs a unit project (fast, no external deps) and an integration project (against local Supabase) via Vitest.
- A unit test locks the reserve error contract: `23505 → CONFLICT` and a generic error → `INTERNAL_SERVER_ERROR`.
- An integration test fires two concurrent `createReservation` calls by two distinct signed-in members against one item and asserts: exactly one fulfilled, exactly one rejected with Postgres code `23505`, and exactly one row in `reservations` with `released_at IS NULL` for that item.
- A reusable fixture helper seeds two email-confirmed members (owner + accepted invitee) plus an item, and tears down cleanly.
- The test-plan cookbook (§6.1, §6.2, §6.5) documents the unit and integration patterns, and Phase 1 status is updated.

Verify by running `npm test` with the local stack up (`npx supabase start`): all specs green; the concurrency spec fails if the unique index is dropped.

### Key Discoveries:

- Unique partial index is the load-bearing invariant — [supabase/migrations/20260527125732_initial_wishlist_schema.sql:69-72](../../../supabase/migrations/20260527125732_initial_wishlist_schema.sql#L69-L72).
- The outcome is deterministic regardless of interleaving: even if the two inserts serialize, the second violates the index and returns `23505`. So "exactly one success + one `23505`" holds whether or not the calls truly overlap — no flakiness risk. Concurrency is expressed by issuing both without awaiting the first, on separate connections.
- The `23505 → CONFLICT` mapping is embedded in the action's catch block ([src/actions/index.ts:247-257](../../../src/actions/index.ts#L247-L257)); extracting it into a pure helper in the service module gives a testable seam without pulling `astro:actions`/`astro:env` into the unit test graph.
- `createReservation` derives `claimer_id` from `client.auth.getUser()`, so each racer must be a **separate signed-in client** (anon key, its own session) — not the service-role client.
- Membership fixture: insert a `lists` row (owner), an `items` row (`list_id` + `title`), and an `invitations` row with `accepted_by_user_id = <invitee uid>` — that satisfies `is_list_invitee` and thus `reservations_insert`.

## What We're NOT Doing

- Not wiring tests into CI (`.github/workflows/ci.yml`) — that is test-plan Phase 4.
- Not testing invitation/accept, IDOR, reserver-identity privacy, or input-validation parity — those are Phases 2–3.
- Not adding e2e/Playwright — the DB-integration test gives cheaper signal for this risk.
- Not changing the exclusivity mechanism, the reserve/release behavior, or any RLS policy.
- Not adding a global `supabase/seed.sql` — fixtures are programmatic and per-run.
- Not refactoring the action beyond extracting the error-mapping helper it already contains inline.

## Implementation Approach

Two test layers, split into three phases. Phase 1 stands up Vitest with a unit-only project and proves the runner using the extracted error-mapping helper — no database needed, so the runner is validated in isolation. Phase 2 adds the integration project, local-stack env wiring, and the programmatic fixture helper, then lands the concurrency proof. Phase 3 documents the patterns in the test plan. The Vitest config uses `projects` so unit and integration suites can be run and gated independently, with the shared `@/*` alias mirrored from tsconfig.

## Phase 1: Bootstrap Vitest + reserve-error mapping unit test

### Overview

Install and configure Vitest with separate `unit` and `integration` projects, add `test` scripts, extract the reserve error-to-payload mapping into a pure exported helper, and unit-test it. Proves the runner works without any external dependency.

### Changes Required:

#### 1. Add Vitest and test scripts

**File**: `package.json`

**Intent**: Add `vitest` (and `@vitest/ui` optional) as a devDependency compatible with the pinned `vite@^7`, and add `test`, `test:unit`, `test:integration`, `test:watch` scripts so unit and integration projects can run together or independently.

**Contract**: New `scripts` entries; `vitest` in `devDependencies`. `test` runs all projects; `test:unit` / `test:integration` filter by project name. No change to existing `dev`/`build`/`lint` scripts.

#### 2. Vitest config with project split and path alias

**File**: `vitest.config.ts` (new)

**Intent**: Define two Vitest projects — `unit` (environment `node`, glob `src/**/*.test.ts`, no setup) and `integration` (environment `node`, glob `tests/integration/**/*.test.ts`, a setup file that loads `.env.test`, and a longer `testTimeout`). Mirror the `@/* → ./src/*` alias so specs can import app modules.

**Contract**: Uses Vitest `test.projects`. `resolve.alias` maps `@` to `./src`. The integration project references the Phase 2 setup file and env file; the unit project pulls in `src/**/*.test.ts` only. Does not register the Astro Vite plugin (unit specs must stay free of `astro:*` virtual modules).

#### 3. Extract the reserve error-mapping helper

**File**: `src/lib/services/reservations.ts`

**Intent**: Move the inline `23505`-detection logic out of the action into a pure, exported function in the service module (which has no runtime Astro imports), returning a plain `{ code, message }` payload so it is testable without `astro:actions`.

**Contract**: New export, e.g. `reserveErrorPayload(err: unknown): { code: "CONFLICT" | "INTERNAL_SERVER_ERROR"; message: string }` — returns the CONFLICT payload when `err` is an object with `code === "23505"`, otherwise the INTERNAL_SERVER_ERROR payload. Pure; no logging, no throw.

#### 4. Rewire the action to use the helper

**File**: `src/actions/index.ts`

**Intent**: Replace the inline 23505 check in the `reservations.reserve` catch block with a call to the new helper, preserving current behavior — rethrow existing `ActionError`, log only the generic (non-CONFLICT) branch, then throw `new ActionError(payload)`.

**Contract**: The catch keeps `if (err instanceof ActionError) throw err;`, then computes `payload = reserveErrorPayload(err)`, calls `console.error("reservations.reserve failed", err)` only when `payload.code === "INTERNAL_SERVER_ERROR"`, and throws `new ActionError(payload)`. Observable behavior (codes + messages + logging) is unchanged.

#### 5. Unit test for the mapping

**File**: `src/lib/services/reservations.test.ts` (new)

**Intent**: Assert the error contract in isolation: an object `{ code: "23505" }` maps to `CONFLICT` with message "Someone just reserved this item first"; a generic `Error` maps to `INTERNAL_SERVER_ERROR` with message "Could not reserve item".

**Contract**: Imports only `reserveErrorPayload` from the service module (clean, Astro-free import graph). Two-plus `it` cases under the `unit` project glob.

### Success Criteria:

#### Automated Verification:

- Dependencies install: `npm install`
- Unit project runs green: `npm run test:unit`
- Type checking passes: `npx astro sync && npx tsc --noEmit` (or the project's typecheck path)
- Linting passes: `npm run lint`

#### Manual Verification:

- `npm run test:unit` reports the reservation mapping cases and completes with no external services running.
- Reserving still shows "Someone just reserved this item first" on a real conflict (spot-check the action path is unchanged).

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Integration harness + concurrency proof

### Overview

Add local-stack env wiring, a Vitest setup file, and a programmatic fixture helper, then land the reservation-exclusivity concurrency test that exercises the real DB race through the service entry point.

### Changes Required:

#### 1. Local-stack test env

**File**: `.env.test` (new) and `.gitignore` (verify/append)

**Intent**: Provide the local Supabase URL, anon key, and service-role key for integration tests, independent of the remote `.env`/`.dev.vars`. These are the well-known local demo values from `npx supabase status`.

**Contract**: Keys `SUPABASE_URL` (`http://127.0.0.1:54321`), `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Loaded only by the integration project's setup file. (Local demo keys are non-secret constants; committing is acceptable, but confirm `.gitignore` intent during implementation.)

#### 2. Integration setup file

**File**: `tests/setup/integration.ts` (new)

**Intent**: Load `.env.test` into `process.env` before integration specs run, and optionally assert the local stack is reachable, failing fast with a clear message ("run npx supabase start") if not.

**Contract**: Referenced by the `integration` project's `setupFiles` in `vitest.config.ts`. Uses `dotenv` (add as devDependency if not transitively present) or Vite's env loading; no `astro:env` usage.

#### 3. Fixture helper (programmatic seeding)

**File**: `tests/helpers/reservationFixtures.ts` (new)

**Intent**: Create the membership graph needed for a reserve: two email-confirmed users (owner + invitee) via the service-role admin API, a list owned by the owner, an item on that list, and an accepted invitation for the invitee. Return the ids and two signed-in member clients. Provide a teardown that removes the created users/rows.

**Contract**: Exports something like `setupReservationScenario(): Promise<{ itemId; owner: {client}; invitee: {client}; cleanup(): Promise<void> }>`. Uses a service-role `createClient` for seeding (`auth.admin.createUser` with `email_confirm: true`, inserts into `lists`/`items`/`invitations` with `accepted_by_user_id` set). Member clients are anon-key `createClient` instances signed in as each user (`signInWithPassword`) so `auth.getUser()` inside `createReservation` resolves to that member. Teardown deletes the two auth users (cascades to lists/items/reservations) to isolate runs.

#### 4. Concurrency integration test

**File**: `tests/integration/reservations.concurrency.test.ts` (new)

**Intent**: Prove Risk #1. With one seeded item and two signed-in members, call `createReservation(memberClient, { itemId })` for both concurrently and assert exactly one success, exactly one rejection carrying Postgres code `23505`, and exactly one active reservation row in the DB. Add a release-then-reserve check showing the item frees and can be re-reserved (guards the partial-index semantics).

**Contract**: Fires both promises without awaiting the first, then `Promise.allSettled`. Asserts: `fulfilled.length === 1`; the rejected reason has `code === "23505"`; a service-role query returns exactly one row for that `item_id` where `released_at is null`. A second `it` releases via `releaseReservation` and shows a subsequent reserve succeeds. Runs under the `integration` project.

### Success Criteria:

#### Automated Verification:

- Local stack reachable and integration project runs green: `npx supabase start` then `npm run test:integration`
- Full suite passes: `npm test`
- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- Temporarily dropping the unique index (or pointing at a DB without it) makes `reservations.concurrency.test.ts` fail with two successes — confirming the test truly exercises the DB guarantee, not an app check.
- Re-running the suite twice in a row passes without manual DB cleanup (fixture teardown isolates runs).

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Document the pattern

### Overview

Record the now-established unit and integration patterns in the test plan cookbook and update Phase 1 status so future contributors follow them.

### Changes Required:

#### 1. Fill in cookbook patterns

**File**: [context/foundation/test-plan.md](../../foundation/test-plan.md)

**Intent**: Replace the "TBD — see §3 Phase 1" placeholders in §6.1 (adding a unit test), §6.2 (adding a local-Supabase integration test), and §6.5 (reservation/claim rule) with the concrete conventions this phase established (file locations, `npm test` commands, the `.env.test`/fixture-helper approach, the concurrency assertion shape).

**Contract**: Prose edits to §6.1, §6.2, §6.5. Also flip the Phase 1 row Status in §3 to the appropriate value and update the "Last updated" note. No change to §1–§5 strategy.

#### 2. Short run-tests note

**File**: [README.md](../../../README.md)

**Intent**: Add a brief "Running tests" note: `npm run test:unit` for fast unit tests; integration tests need `npx supabase start` first, then `npm run test:integration` (or `npm test`).

**Contract**: One short subsection; no other README changes.

### Success Criteria:

#### Automated Verification:

- Markdown lints/formats clean: `npm run format` (or `npx prettier --check` on the changed files)

#### Manual Verification:

- A reader following §6.2 can add a new integration test without rediscovering the env/fixture wiring.
- Phase 1 status in the test plan reflects completion.

---

## Testing Strategy

### Unit Tests:

- `reserveErrorPayload`: `{ code: "23505" }` → `CONFLICT` + exact message; generic `Error` → `INTERNAL_SERVER_ERROR` + exact message.

### Integration Tests:

- Two concurrent `createReservation` calls on one item by two members → exactly one fulfilled, one rejected with code `23505`, exactly one active row.
- Release then re-reserve → succeeds (partial-index semantics).

### Manual Testing Steps:

1. `npx supabase start`, then `npm test` — confirm all green.
2. Drop `reservations_one_active_per_item` locally and re-run — the concurrency spec must fail (two successes), proving it exercises the DB invariant.
3. Restore the index; re-run twice — passes without manual cleanup.

## Performance Considerations

Integration specs hit a real local Postgres; keep them few and fixture-scoped. Use per-scenario teardown (delete the two auth users, cascading) rather than a full `db reset` between tests to keep the suite fast.

## Migration Notes

No schema or data migration. `.env.test` holds local-stack demo credentials only; never the remote project values from `.env`/`.dev.vars`.

## References

- Related research: [context/changes/testing-reservation-exclusivity/research.md](research.md)
- Test plan (Risk #1, Phase 1): [context/foundation/test-plan.md](../../foundation/test-plan.md)
- Concurrency precedent: [context/archive/2026-05-27-wishlist-data-schema/race-test.sh](../../archive/2026-05-27-wishlist-data-schema/race-test.sh)
- Reserve path: [src/actions/index.ts:240-261](../../../src/actions/index.ts#L240-L261), [src/lib/services/reservations.ts:13-28](../../../src/lib/services/reservations.ts#L13-L28)
- Invariant + RLS + membership: [supabase/migrations/20260527125732_initial_wishlist_schema.sql](../../../supabase/migrations/20260527125732_initial_wishlist_schema.sql)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Bootstrap Vitest + reserve-error mapping unit test

#### Automated

- [x] 1.1 Dependencies install: `npm install` — 69c1e85
- [x] 1.2 Unit project runs green: `npm run test:unit` — 69c1e85
- [x] 1.3 Type checking passes: `npx astro sync && npx tsc --noEmit` — 69c1e85
- [x] 1.4 Linting passes: `npm run lint` — 69c1e85

#### Manual

- [x] 1.5 `npm run test:unit` reports the mapping cases with no external services running — 69c1e85
- [x] 1.6 Reserving still shows the CONFLICT message on a real conflict (action path unchanged) — 69c1e85

### Phase 2: Integration harness + concurrency proof

#### Automated

- [x] 2.1 Integration project runs green: `npx supabase start` then `npm run test:integration` (2 tests) — 6573b9e
- [x] 2.2 Full suite passes: `npm test` (6 tests) — 6573b9e
- [x] 2.3 Type checking passes: `npm run build` green; new files add no `tsc` errors (the 3 pre-existing `InviteDialog.tsx` errors are unrelated, same as 1.3) — 6573b9e
- [x] 2.4 Linting passes: `npm run lint` — 6573b9e

#### Manual

- [x] 2.5 Dropping `reservations_one_active_per_item` locally made the concurrency spec fail with two successes (`Expected 1, Received 2`); index restored — 6573b9e
- [x] 2.6 Suite passes twice in a row without manual DB cleanup (fixtures self-teardown via user-delete cascade) — 6573b9e

### Phase 3: Document the pattern

#### Automated

- [x] 3.1 Markdown formats clean: `npx prettier --check` on the changed docs passes (repo-wide `npm run format` reformats many unrelated legacy docs, so scoped the check to Phase 3 files) — 8b762fd

#### Manual

- [x] 3.2 A reader can follow §6.2 to add an integration test without rediscovering wiring (env template, fixture-helper, and RLS guidance are spelled out) — 8b762fd
- [x] 3.3 Phase 1 status in the test plan reflects completion (§3 row → `complete`, §4 Vitest → 3.2.7, §6 cookbook filled) — 8b762fd
