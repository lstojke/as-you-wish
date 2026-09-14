# Invitation & Access-Control Integration Tests Implementation Plan

## Overview

Add integration tests (against the local Supabase stack) that protect two High-impact risks from `context/foundation/test-plan.md` rollout Phase 2:

- **Risk #2** — the invitation → accept flow must grant access only to the correct, email-confirmed user, and a replayed accept must be a no-op.
- **Risk #3** — a user who was never invited must be denied both read and reserve on someone else's list, enforced at the data layer (RLS), not merely in the app.

No production code changes. This is a test-only change that mirrors the harness established in Phase 1.

## Current State Analysis

The data layer that these tests exercise already exists and is the ground truth:

- **Accept flow** is the SECURITY DEFINER RPC `accept_invitation(invite_id uuid)` in [supabase/migrations/20260809190233_accept_invitation_rpc.sql](supabase/migrations/20260809190233_accept_invitation_rpc.sql). It reads `auth.users.email_confirmed_at` directly (deliberately not the flaky `email_verified` JWT claim — see [lessons.md](context/foundation/lessons.md)), and raises: `28000` (unauthenticated), `P0001` (email not confirmed), `P0002` (not found), `P0003` (email mismatch). It is idempotent: a second accept returns the same `list_id` without a second `UPDATE`.
- **Service wrapper** `acceptInvitation` maps those codes to `{ ok: false, reason }` in [src/lib/services/invitations.ts](src/lib/services/invitations.ts#L67) (`not_confirmed` | `not_found` | `mismatch` | `unauthenticated` | `unknown`); success returns `{ ok: true, listId }`. `createReservation` in [src/lib/services/reservations.ts](src/lib/services/reservations.ts#L28) inserts `{ item_id, claimer_id }` and throws the raw PostgrestError on failure.
- **Access RLS** (initial schema, [supabase/migrations/20260527125732_initial_wishlist_schema.sql](supabase/migrations/20260527125732_initial_wishlist_schema.sql)): `lists_select` = owner or `is_list_invitee(id)`; `items_select` = `is_list_member(list_id)`; `reservations_insert` WITH CHECK = `claimer_id = auth.uid() AND is_item_list_member(item_id)`. Membership is via an invitation row whose `accepted_by_user_id = auth.uid()`.
- **Local auth**: `enable_confirmations = false` ([supabase/config.toml](supabase/config.toml#L209)) — an unconfirmed user can still sign in locally, which is what lets a real member client reach the RPC and trigger the `P0001` gate.

**Existing test harness to mirror:**

- [tests/helpers/reservationFixtures.ts](tests/helpers/reservationFixtures.ts) seeds via a service-role client (`auth.admin.createUser({ email_confirm: true })`, then inserts `lists`/`items`/`invitations`) and returns publishable-key member clients signed in with `signInWithPassword` so RLS is genuinely exercised. Teardown deletes the auth users, cascading away everything.
- [tests/integration/reservations.concurrency.test.ts](tests/integration/reservations.concurrency.test.ts) is the shape to follow (`beforeEach` seed, `afterEach` cleanup, service-role assertions for RLS-bypassing counts).
- [tests/setup/integration.ts](tests/setup/integration.ts) loads `.env.test` and fails fast if the local stack is down.
- Vitest `integration` project: `include: ["tests/integration/**/*.test.ts"]`, `testTimeout: 20000` ([vitest.config.ts](vitest.config.ts#L30)). Run via `npm run test:integration`.

The current `reservationFixtures.ts` seeds an **already-accepted** invitee. These tests additionally need a **pending** (un-accepted) invitation, an **unconfirmed** user, and a **non-member outsider** — none of which the existing fixture provides.

## Desired End State

`npm run test:integration` runs two new specs alongside the reservation spec, all green against a running local Supabase:

- `tests/integration/invitations.accept.test.ts` proves: happy accept makes the invitee a member (list + items become visible to their client); a wrong-email user's accept is denied (`mismatch`); an unconfirmed user's accept is denied (`not_confirmed`); a replayed accept returns the same `listId` and leaves exactly one accepted invitation row (no double-grant).
- `tests/integration/access-control.test.ts` proves: an outsider's `lists`/`items` SELECT returns zero rows (RLS filters silently), and `createReservation` on the outsider client is rejected.

Verify: `npm run test:integration` passes; `npm run test:unit` still passes; typecheck/lint clean; the reservation spec still passes after the shared-helper extraction.

### Key Discoveries:

- `enable_confirmations = false` locally ([supabase/config.toml](supabase/config.toml#L209)) — an `email_confirm: false` user can `signInWithPassword`, so the `P0001` path is reachable through a real member client rather than a service-role hack.
- Idempotency is provable without a second RPC error: after two `acceptInvitation` calls, a service-role `select count(*)` on `invitations` where `accepted_by_user_id = <uid>` for that list must be exactly 1.
- RLS SELECT denial returns an **empty result set, not an error** (PostgREST semantics); reserve denial returns an **error** (RLS `WITH CHECK` violation). The two assertions are asymmetric by design.
- The email mismatch is best exercised by a signed-in, confirmed user whose email differs from the invite's `email` — the RPC's `P0003` branch. `createMember` already generates unique emails, so an "outsider" confirmed user doubles as the mismatch actor.

## What We're NOT Doing

- Not testing invite **creation** authorization (non-owner cannot `createInvitation`, duplicate → `already_invited`) — deferred; the accept flow is the proof target for #2.
- Not asserting the direct `is_item_reserved` probe for non-members (the membership guard in [20260913081500_align_is_item_reserved_membership_guard.sql](supabase/migrations/20260913081500_align_is_item_reserved_membership_guard.sql)) — #3 is scoped to read + reserve only.
- Not adding an automated negative control that toggles RLS on the shared local DB (too stateful); the negative control is documented as a manual one-off in the cookbook.
- Not touching production code, RLS policies, or migrations.
- No e2e / Playwright layer — DB-integration gives the cheaper signal (test-plan §4).

## Implementation Approach

Extract the reusable Supabase test primitives shared by both fixture modules into one small module, add a purpose-built `invitationFixtures.ts` that seeds the fuller membership graph, then write the two specs. Finally, update the test-plan cookbook and statuses so the rollout ledger reflects Phase 2 landing.

## Phase 1: Shared fixtures + invitation accept spec (#2)

### Overview

Create the shared client/user primitives, the invitation fixtures, and the accept spec. This phase carries the refactor of the existing reservation fixture onto the shared module.

### Changes Required:

#### 1. Shared Supabase test primitives

**File**: `tests/helpers/supabaseTestClients.ts` (new)

**Intent**: House the primitives currently private to `reservationFixtures.ts` so both fixture modules share one implementation instead of duplicating it.

**Contract**: Export `FIXTURE_PASSWORD: string`, `anonClient(): Client`, `adminClient(): Client`, `createMember(admin: Client, role: string, opts?: { emailConfirm?: boolean }): Promise<{ id: string; email: string }>`, and `signIn(email: string): Promise<Client>`, where `Client = SupabaseClient<Database>`. Same behavior as today's private helpers, plus `createMember` gains an `emailConfirm` option (default `true`) so callers can seed an unconfirmed user (`email_confirm: false`).

#### 2. Refactor reservation fixtures onto the shared module

**File**: [tests/helpers/reservationFixtures.ts](tests/helpers/reservationFixtures.ts)

**Intent**: Remove the now-duplicated primitives and import them from the shared module; behavior unchanged.

**Contract**: Delete the local `FIXTURE_PASSWORD`, `env`, `anonClient`, `adminClient`, `createMember`, `signIn` definitions; import them from `./supabaseTestClients`. `setupReservationScenario` keeps its exact signature and returned `ReservationScenario` shape.

#### 3. Invitation fixtures

**File**: `tests/helpers/invitationFixtures.ts` (new)

**Intent**: Seed the membership graph the accept and IDOR specs need — one owner with a list and item, plus the actors each spec draws from.

**Contract**: Export `setupInvitationScenario(): Promise<InvitationScenario>` where `InvitationScenario` provides: `listId`, `itemId`, `owner` (member with client), a **pending** invitation `{ invitationId, email }` addressed to `invitee`, `invitee` (confirmed member client whose email matches the pending invite, **not** yet accepted), `unconfirmedInvitee` (a second pending invite addressed to an `email_confirm: false` member with a signed-in client), `outsider` (a confirmed member client with no invitation to this list), `admin` (service-role client), and `cleanup()`. Seed invitations with the service-role client (no `accepted_*` fields for the pending rows). Teardown deletes all created auth users.

#### 4. Invitation accept spec

**File**: `tests/integration/invitations.accept.test.ts` (new)

**Intent**: Prove the four accept behaviors named in the test-plan risk-response for #2.

**Contract**: One `describe` with `beforeEach`/`afterEach` seeding/cleaning `setupInvitationScenario`. Cases:
- **happy**: `acceptInvitation(invitee.client, { invitationId })` → `{ ok: true, listId }`; afterwards the invitee client can SELECT the list (1 row) and its items (≥1 row).
- **mismatch**: `acceptInvitation(outsider.client, { invitationId })` → `{ ok: false, reason: "mismatch" }`; the invitation stays unaccepted (service-role check `accepted_by_user_id is null`).
- **unconfirmed**: `acceptInvitation(unconfirmedInvitee.client, { invitationId: <their pending invite> })` → `{ ok: false, reason: "not_confirmed" }`.
- **replay**: call `acceptInvitation(invitee.client, …)` twice; both return the same `listId`; service-role `count` of accepted rows for that invite/user is exactly 1.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Unit tests still pass: `npm run test:unit`
- Integration suite passes (incl. the unchanged reservation spec): `npm run test:integration`

#### Manual Verification:

- With the local stack stopped, the spec fails fast with the actionable "Run `npx supabase start`" message (setup guard intact).
- The accept spec exercises real RLS: the happy case's post-accept list/items reads go through the invitee's publishable-key client, not the service-role client.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: Non-member access-control spec (#3)

### Overview

Add the IDOR spec proving an outsider is denied read and reserve, reusing the invitation fixtures.

### Changes Required:

#### 1. Access-control spec

**File**: `tests/integration/access-control.test.ts` (new)

**Intent**: Prove a non-invited user cannot read or reserve on someone else's list at the data layer.

**Contract**: One `describe` seeding `setupInvitationScenario` (the `outsider` never accepts any invite to this list). Cases:
- **read denied**: `outsider.client.from("lists").select("*").eq("id", listId)` returns `data` of length 0, `error` null; `outsider.client.from("items").select("*").eq("list_id", listId)` returns length 0. Guard against false-empty: a control read of the same rows via the service-role `admin` client returns ≥1, proving the rows exist and RLS is what hides them.
- **reserve denied**: `createReservation(outsider.client, { itemId })` rejects (RLS `reservations_insert` WITH CHECK fails); assert the promise rejects and no active reservation exists for the item via a service-role query.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Integration suite passes: `npm run test:integration`

#### Manual Verification:

- The "read denied" assertion is paired with a service-role control read proving the rows exist — an empty result from a seeding bug cannot masquerade as a pass.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 3: Test-plan cookbook + status update

### Overview

Reflect Phase 2 landing in the test-plan document and the change identity file.

### Changes Required:

#### 1. Access-control cookbook pattern

**File**: [context/foundation/test-plan.md](context/foundation/test-plan.md)

**Intent**: Replace the §6.2b placeholder with the actual non-member-denied pattern, including the manual negative control.

**Contract**: §6.2b documents: seed a member graph with the service-role client, act as a signed-in **outsider** client, assert read = empty (paired with a service-role control read) and reserve = rejection. Add a note that the negative control is a manual one-off: temporarily relax the relevant RLS policy locally and confirm the denial test flips to pass-through — never committed.

#### 2. Rollout status + phase note

**File**: [context/foundation/test-plan.md](context/foundation/test-plan.md)

**Intent**: Move the §3 Phase 2 status forward and capture any surprise in §6.6.

**Contract**: In the §3 table, set Phase 2 Status to `complete` (or `implementing` until manual sign-off, per the orchestrator convention). Append a 2–3 line §6.6 "Phase 2" note (e.g. the `enable_confirmations = false` insight that makes the `P0001` path reachable via a member client). Update the "Last updated" header line.

#### 3. Change identity

**File**: [context/changes/testing-invitation-access-control/change.md](context/changes/testing-invitation-access-control/change.md)

**Intent**: Record progress on the change file.

**Contract**: Set `status: planned` → later `complete` and bump `updated` per the workflow.

### Success Criteria:

#### Automated Verification:

- Markdown reflects reality: `ls tests/integration/invitations.accept.test.ts tests/integration/access-control.test.ts` both exist.
- Full suite green: `npm test`.

#### Manual Verification:

- §6.2b reads as an actionable recipe a future contributor can follow without re-deriving the RLS semantics.
- §3 status and §6.6 note match what actually shipped.

**Implementation Note**: Final phase — confirm the full suite is green and the test-plan ledger is accurate.

---

## Testing Strategy

### Integration Tests:

- Accept happy / mismatch / unconfirmed / replay (Phase 1).
- Non-member read-denied and reserve-denied (Phase 2).
- All run against local Supabase via publishable-key member clients so RLS/RPC are genuinely exercised; service-role client used only for seeding and RLS-bypassing assertions.

### Manual Testing Steps:

1. `npx supabase start`, then `cp .env.test.example .env.test` and fill from `npx supabase status` (if not already present).
2. `npm run test:integration` — all specs green.
3. One-off negative control: relax the `reservations_insert` (or `items_select`) policy locally, re-run the access-control spec, confirm the denial case now fails (proving it tests RLS), then restore the policy.

## Migration Notes

None — no schema or data changes.

## References

- Test plan (rollout Phase 2): [context/foundation/test-plan.md](context/foundation/test-plan.md)
- Prior phase (pattern to mirror): [tests/integration/reservations.concurrency.test.ts](tests/integration/reservations.concurrency.test.ts), [tests/helpers/reservationFixtures.ts](tests/helpers/reservationFixtures.ts)
- Accept RPC: [supabase/migrations/20260809190233_accept_invitation_rpc.sql](supabase/migrations/20260809190233_accept_invitation_rpc.sql)
- RLS & membership helpers: [supabase/migrations/20260527125732_initial_wishlist_schema.sql](supabase/migrations/20260527125732_initial_wishlist_schema.sql)
- Membership guard: [supabase/migrations/20260913081500_align_is_item_reserved_membership_guard.sql](supabase/migrations/20260913081500_align_is_item_reserved_membership_guard.sql)
- Service wrappers: [src/lib/services/invitations.ts](src/lib/services/invitations.ts), [src/lib/services/reservations.ts](src/lib/services/reservations.ts)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Shared fixtures + invitation accept spec (#2)

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck` — dfc9e1d
- [x] 1.2 Linting passes: `npm run lint` — dfc9e1d
- [x] 1.3 Unit tests still pass: `npm run test:unit` — dfc9e1d
- [x] 1.4 Integration suite passes (incl. unchanged reservation spec): `npm run test:integration` — dfc9e1d

#### Manual

- [x] 1.5 Stack-down guard still fails fast with the actionable message — dfc9e1d
- [x] 1.6 Happy-case reads go through the invitee's publishable-key client (real RLS) — dfc9e1d

### Phase 2: Non-member access-control spec (#3)

#### Automated

- [x] 2.1 Type checking passes: `npm run typecheck` — 0ca206e
- [x] 2.2 Linting passes: `npm run lint` — 0ca206e
- [x] 2.3 Integration suite passes: `npm run test:integration` — 0ca206e

#### Manual

- [x] 2.4 Read-denied assertion paired with a service-role control read — 0ca206e

### Phase 3: Test-plan cookbook + status update

#### Automated

- [x] 3.1 Both new spec files exist on disk — d19a315
- [x] 3.2 Full suite green: `npm test` — d19a315

#### Manual

- [x] 3.3 §6.2b reads as an actionable recipe — d19a315
- [x] 3.4 §3 status and §6.6 note match what shipped — d19a315
