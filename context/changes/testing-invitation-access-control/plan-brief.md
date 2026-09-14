# Invitation & Access-Control Integration Tests — Plan Brief

> Full plan: `context/changes/testing-invitation-access-control/plan.md`

## What & Why

Rollout Phase 2 of the test plan protects two High-impact risks with integration tests against local Supabase: the invitation → accept flow must grant access only to the correct, email-confirmed user (replay a no-op), and a non-invited user must be denied read and reserve at the data layer. These are the team's lowest-confidence area (interview Q3) and the core access-control guarantee — worth locking behind tests before further change.

## Starting Point

The data layer is done and is the ground truth: the `accept_invitation` SECURITY DEFINER RPC (idempotent, gates on `email_confirmed_at`, raises `P0001`/`P0003`) and RLS policies (`lists_select`, `items_select`, `reservations_insert` via `is_list_member`/`is_item_list_member`). Phase 1 already stood up Vitest with a proven integration harness — `reservationFixtures.ts` + `reservations.concurrency.test.ts` — but that fixture only seeds an *already-accepted* invitee.

## Desired End State

`npm run test:integration` runs two new specs green: `invitations.accept.test.ts` (happy / mismatch / unconfirmed / replay) and `access-control.test.ts` (outsider read-denied + reserve-denied), both driven through real publishable-key member clients so RLS/RPC are genuinely exercised.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| File layout | Two files, one per risk | 1:1 risk-to-file traceability, matching the Phase-1 style | Plan |
| Fixtures location | New `invitationFixtures.ts` + shared primitives module | Purpose-built seed for accept/IDOR is clearer than overloading the reservation fixture | Plan |
| #2 scope | happy + mismatch + unconfirmed + replay | Exactly the four behaviors the test-plan names as proof | Plan / test-plan |
| #3 assertions | read (empty) + reserve (error) only | Matches the risk statement; skip the `is_item_reserved` probe | Plan |
| Denial semantics | read = empty result, reserve = error | True PostgREST/RLS behavior — SELECT filters, WITH CHECK errors | Research |
| Negative control | Documented manual one-off, not automated | Same assurance as §6.5 without a destructive stateful DB toggle | Plan |

## Scope

**In scope:** shared test-client module; `invitationFixtures.ts`; `invitations.accept.test.ts` (#2); `access-control.test.ts` (#3); test-plan §6.2b/§6.6/§3 + status updates.

**Out of scope:** invite-creation authorization; the `is_item_reserved` probe; automated RLS-toggling negative control; any production/schema change; e2e.

## Architecture / Approach

Service-role client seeds the membership graph (owner, list, item, a pending invite to the invitee, a pending invite to an unconfirmed user, and an unrelated outsider). Publishable-key member clients (`signInWithPassword`) drive the actual behavior so RLS/RPC are real; service-role reads back rows for RLS-bypassing assertions. Shared primitives (`adminClient`/`anonClient`/`createMember`/`signIn`) are extracted from the reservation fixture into one module both fixtures import.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Shared fixtures + accept spec (#2) | Shared client module, `invitationFixtures.ts`, accept spec | Refactor must not regress the passing reservation spec |
| 2. Access-control spec (#3) | Outsider read/reserve-denied spec | False-empty read masking a seeding bug (mitigated by service-role control read) |
| 3. Test-plan cookbook + status | §6.2b pattern, §6.6 note, §3 status, `change.md` | Doc drifting from what actually shipped |

**Prerequisites:** running local Supabase (`npx supabase start`) and a filled `.env.test`.
**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- Assumes local `enable_confirmations = false` so an unconfirmed user can sign in and reach the `P0001` gate — verified in `supabase/config.toml`.
- Assumes RLS SELECT denial returns an empty set (not an error) — the read-denied assertion depends on it; paired with a service-role control read to avoid false positives.
- Extracting shared primitives touches the passing reservation fixture; its re-run is the regression guard.

## Success Criteria (Summary)

- Only the invited, confirmed user gains membership; wrong-email and unconfirmed accepts are denied; a replay grants exactly once.
- A non-member reads nothing and cannot reserve on someone else's list.
- `npm test` is green and the test-plan ledger reflects Phase 2 landing.
