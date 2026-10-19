# Privacy and Input Integrity Test Rollout Plan

## Overview

Add focused regression coverage for Phase 3 risks #4–#6 in [context/foundation/test-plan.md](../../foundation/test-plan.md): reservation identity privacy, input validation at server boundaries, and reservation consistency across item edits/deletions. This is a test-only change using the existing Vitest and local-Supabase setup; no production behavior or database schema changes are planned.

## Current State Analysis

- Reservation privacy is enforced by Supabase RLS and a boolean-only `item_reservation_status` view. `createReservation` returns a reservation row to its creator, which is not an owner-facing identity leak ([research](research.md), [schema migration](../../../supabase/migrations/20260527125732_initial_wishlist_schema.sql#L267)).
- Astro business actions declare Zod schemas, but no test currently proves schema constraints or Astro's action-boundary rejection. Valid foreign UUID authorization is a separate RLS concern; the existing access-control integration spec already exercises that case ([research](research.md), [access-control spec](../../../tests/integration/access-control.test.ts#L31)).
- Deleting an item cascades its reservation row; editing preserves the item identity and its reservation. Notification or warning behavior is an unresolved product question and is explicitly out of scope ([research](research.md), [PRD](../../foundation/prd.md#L120)).
- `setupReservationScenario()` already provides an owner, accepted invitee, item, member clients, and service-role assertions, so these tests need no fixture refactor ([reservation fixture](../../../tests/helpers/reservationFixtures.ts#L9)).
- The Vitest configuration currently has unit and Supabase integration projects; the existing integration setup loads `.env.test` and checks local Supabase availability ([Vitest config](../../../vitest.config.ts#L1), [integration setup](../../../tests/setup/integration.ts#L1)).

## Desired End State

A list owner cannot read another member's reservation identity but can still see reserved status. Integration tests prove an active reservation stays attached when its item is edited and is removed when the item is deleted. Pure schema tests cover security- and business-relevant Zod constraints, while a dedicated action-test project proves malformed JSON is rejected by Astro before the handler runs. The test-plan cookbook records these patterns and accurately describes the existing foreign-resource authorization coverage.

### Key Discoveries

- The reservation row returned by the reserve action is caller-owned; testing it as an owner-facing leak would encode the wrong contract ([actions](../../../src/actions/index.ts#L239), [research](research.md)).
- Astro's installed action runtime runs `safeParseAsync` before invoking the action handler; the public action RPC endpoint is `/_actions/<name>` ([Astro action handler declarations](../../../node_modules/astro/dist/actions/handler.d.ts), [Astro server runtime](../../../node_modules/astro/dist/actions/runtime/server.js)).
- The existing outsider reserve denial test already supplies a valid UUID and exercises RLS, so Phase 3 should reference that coverage rather than duplicate it ([access-control spec](../../../tests/integration/access-control.test.ts#L31)).
- Existing schema rules include HTTP(S)-only persisted links, matching the accepted URL safety lesson ([wishlist schemas](../../../src/lib/schemas/wishlist.ts#L22), [lessons](../../foundation/lessons.md)).

## What We're NOT Doing

- No production action, service, UI, or RLS behavior changes.
- No database migration or fixture abstraction/refactor.
- No signin/signup route validation in this phase; record that separate gap for follow-up.
- No warning/notification policy for a reserver when an owner edits or deletes an item. Tests assert current persistence semantics, not that silent claim removal is desirable UX.
- No duplicate test for valid-UUID foreign-resource authorization already covered by the existing access-control spec.
- No browser E2E layer; the database invariants and action validation boundary have cheaper direct signals.

## Implementation Approach

Proceed from real database invariants to pure validation rules, then verify Astro's runtime boundary. Reuse the reservation fixture for privacy and mutation integration tests; keep schema tests in the existing fast unit project; add a separate Vitest project for one HTTP request against a locally started Astro dev server. Keep the action test unauthenticated and submit a malformed item-create payload: the observable contract is an input-validation error rather than the handler's `UNAUTHORIZED` error, demonstrating parsing occurs before handler execution without requiring Supabase or a write.

## Phase 1: Reservation Privacy and Mutation Integration

### Overview

Add local-Supabase integration tests for owner-visible privacy and the reservation lifecycle around item edit/delete. Use member clients for policy-enforced operations and the service-role client only as a control for persisted rows.

### Changes Required

#### 1. Owner-readable reservation privacy test

**File**: `tests/integration/reservations.privacy.test.ts` (new)

**Intent**: Prove an owner cannot read an invitee's reservation identity while still observing that the item is reserved.

**Contract**: Set up `setupReservationScenario()`, reserve as the invitee through `createReservation`, then query the reservation as the owner and assert RLS returns an empty result with no error. Pair this with an admin control read proving the row exists and belongs to the invitee. Query `item_reservation_status` as the owner and assert the item is reserved and the returned view row has no claimer identity field.

#### 2. Reserved-item mutation integration tests

**File**: `tests/integration/items.reserved-mutations.test.ts` (new)

**Intent**: Lock the existing database behavior for editing and deleting an actively reserved item.

**Contract**: With a reservation created by the invitee, update the item through the owner member client and assert the reservation remains linked to that item and remains visible to the invitee. In a separate scenario, delete the item through the owner member client and assert via admin that its reservation row is gone, and via the invitee client that the item is no longer in their active reserved-item result. Reuse the current scenario cleanup.

### Success Criteria

#### Automated Verification

- `npx supabase start` followed by `npm run test:integration` passes with the new privacy and mutation specs.
- The privacy spec has both a service-role existence/identity control and owner-client RLS/view assertions.
- Delete and edit tests each start from a real active reservation created by a signed-in member client.

#### Manual Verification

- Review test setup to confirm service-role access is limited to fixture controls and assertions; behavior under test uses owner/invitee clients.
- Confirm no assertion treats lack of a reserver notification as correct product behavior.

**Implementation Note**: Pause for human confirmation after automated checks and this fixture-boundary review.

## Phase 2: Schema Constraint Unit Tests

### Overview

Add fast unit coverage for representative Zod constraints derived from the product contract and the accepted URL-safety lesson. Do not duplicate every field assertion or use the schema itself as the oracle for unrelated business behavior.

### Changes Required

#### 1. Wishlist schema constraint tests

**File**: `src/lib/schemas/wishlist.test.ts` (new)

**Intent**: Protect important item/list input constraints without starting Astro or Supabase.

**Contract**: Cover negative and fractional `priceCents`, missing/blank and oversized item title, invalid UUID shape, non-HTTP(S) persisted URL (including a dangerous scheme), valid HTTP(S) URL acceptance, and currency supplied without a price. Expectations come from the public business constraints and the URL safety lesson; tests call `safeParse` on the production schemas but do not derive expected behavior from their output.

### Success Criteria

#### Automated Verification

- `npm run test:unit` passes with the new schema cases.
- The tests distinguish malformed UUID shape from valid foreign-resource authorization, which remains covered by the existing RLS integration test.
- `npm run lint` passes.

#### Manual Verification

- Review each rejection expectation against `context/foundation/test-plan.md` and `context/foundation/lessons.md` rather than copying error text from the schema implementation.

**Implementation Note**: Pause for human confirmation before proceeding to the action-boundary phase.

## Phase 3: Astro Action Boundary Contract and Cookbook

### Overview

Add an isolated Vitest project that starts Astro locally and proves invalid action input is rejected before handler execution. Document the tests and commands in the test-plan cookbook once all three phases pass.

### Changes Required

#### 1. Dedicated action test project

**Files**: `vitest.config.ts`, `package.json`, `tests/actions/` and `tests/setup/actions.ts` (new as needed)

**Intent**: Exercise Astro's actual `/_actions/<name>` RPC route without mixing the dev server lifecycle into the Supabase integration project.

**Contract**: Add an `actions` Vitest project with its own include/setup and a `test:actions` script; the overall `npm test` command includes it. Setup starts an Astro dev server on an isolated local port, waits for readiness, and reliably stops the process after the project. The test posts malformed JSON to `/_actions/items.create` with a valid list UUID but an invalid item field and asserts the returned action result is an input-validation failure, not the handler's unauthenticated `UNAUTHORIZED` result. No valid action is invoked and no Supabase mutation is needed. Use Astro's action RPC serialization/validation behavior rather than hard-coding an undocumented numeric HTTP status.

#### 2. Cookbook and rollout record

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the Phase 3 placeholders with actionable recipes and reflect the shipped evidence.

**Contract**: Document (a) owner/client RLS privacy check plus admin control and boolean-view assertion, (b) delete cascade/edit preservation integration setup, and (c) representative schema-unit and Astro action-boundary validation tests. Clarify that valid foreign UUID authorization is already covered in §6.2b; signin/signup validation and reserver notification remain outside this rollout. Update the Phase 3 cookbook placeholder, append a concise Phase 3 note in §6.6, update the guide's last-updated note, and mark rollout Phase 3 complete only after all checks and manual sign-off.

#### 3. Change metadata

**File**: `context/changes/testing-privacy-input-integrity/change.md`

**Intent**: Record completion after all phases pass.

**Contract**: Update status and date according to the change workflow after final sign-off.

### Success Criteria

#### Automated Verification

- `npm run test:actions` passes against the local Astro action endpoint.
- `npm test` passes all unit, action-contract, and local-Supabase integration projects (Supabase running for integration tests).
- `npm run lint` and `npx astro check` pass.
- Prettier check passes for changed Markdown and configuration files.
- `context/foundation/test-plan.md` Phase 3 cookbook and status match the tests that actually shipped.

#### Manual Verification

- Confirm the action test starts and stops its server without leaving a background process or colliding with another local port.
- Confirm the failure observed by the malformed request is Astro input validation, not auth middleware, handler logic, or a missing test server.
- Confirm the documentation does not imply that silent claim removal is the desired user experience.

**Implementation Note**: Final phase. After all automated checks pass, pause for human sign-off before marking the rollout complete.

## Testing Strategy

### Unit Tests

- Exercise representative Zod boundaries: numeric price constraints, required/bounded title, UUID shape, HTTP(S)-only link, and currency/price pairing.

### Integration Tests

- Owner cannot select an invitee's reservation row; the invitee can create/read their claim; the owner still sees the reserved boolean.
- Editing an actively reserved item preserves the reservation link and reserver-visible active item id.
- Deleting an actively reserved item removes the reservation via cascade and removes it from the reserver's active claim query.
- Continue relying on `tests/integration/access-control.test.ts` for valid-UUID non-member reserve denial; do not duplicate it.

### Action Contract Tests

- An invalid item-create payload to Astro's action RPC is rejected as input validation before the handler's authentication guard can run.

### Manual Testing Steps

1. Start local Supabase with `npx supabase start`, then run `npm run test:integration`.
2. Run `npm run test:unit` and `npm run test:actions` independently to confirm each project is isolated.
3. Run `npm test` and verify all test projects complete and the action server shuts down.
4. Read the updated cookbook and confirm it distinguishes schema validation, action parsing, and RLS authorization.

## Performance Considerations

The DB integration tests create only a small number of local auth users and rows per case. The action project pays one Astro dev-server startup per run; keep it as one representative boundary request, not a server startup per test. Unit schema checks remain server-free.

## Migration Notes

None. No production schema, data, or runtime behavior changes are planned.

## References

- Research baseline: [research.md](research.md)
- Rollout guidance: [context/foundation/test-plan.md](../../foundation/test-plan.md)
- Existing fixture: [reservationFixtures.ts](../../../tests/helpers/reservationFixtures.ts)
- Existing RLS precedent: [access-control.test.ts](../../../tests/integration/access-control.test.ts)
- Astro Actions guide: [Actions](https://docs.astro.build/en/guides/actions/)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` - <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reservation privacy and mutation integration

#### Automated

- [ ] 1.1 Privacy integration proves owner RLS denial, admin control, and reserved boolean visibility
- [ ] 1.2 Edit/delete integration proves claim preservation and cascade removal
- [ ] 1.3 Local-Supabase integration suite passes

#### Manual

- [ ] 1.4 Fixture review confirms member clients exercise behavior and admin is control-only

### Phase 2: Schema constraint unit tests

#### Automated

- [ ] 2.1 Representative Zod boundary tests pass in the unit project
- [ ] 2.2 Unit suite and lint pass

#### Manual

- [ ] 2.3 Expected behavior matches the product constraints and URL safety lesson

### Phase 3: Astro action boundary and cookbook

#### Automated

- [ ] 3.1 Dedicated action project rejects malformed input before handler auth guard
- [ ] 3.2 Full test suite, `npx astro check`, and lint pass
- [ ] 3.3 Cookbook, Phase 3 status, and formatting checks match shipped coverage

#### Manual

- [ ] 3.4 Action server lifecycle is isolated and leaves no process running
- [ ] 3.5 Final test-plan walkthrough and scope review pass
