# Privacy and Input Integrity Test Rollout — Plan Brief

> Full plan: [plan.md](plan.md)
> Research: [research.md](research.md)

## What & Why

This rollout adds focused regression tests for reserver-identity privacy, server-side input validation, and reservation consistency when owners edit or delete reserved items. These are the remaining risks in Phase 3 of the project's phased test rollout.

## Starting Point

Vitest already has unit and local-Supabase integration projects, and existing fixtures provide owner/invitee clients. Reservation identity is hidden through RLS and a boolean-only view; deletion cascades claims, while edits preserve them. The gaps are tests for those contracts and for Astro's action validation boundary.

## Desired End State

Tests prove owners cannot read another member's reservation identity, item edits preserve active claims, and item deletion removes the reservation row without orphans. Representative Zod constraints and one real Astro action RPC request verify malformed input is rejected before handler execution. The test-plan cookbook reflects the resulting patterns.

## Key Decisions Made

| Decision                  | Choice                                                                  | Why                                                                                       | Source          |
| ------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------- |
| Credential-route scope    | Keep signin/signup validation out                                       | Focus this rollout on the business-action risks; record auth routes as follow-up          | Plan            |
| Delete UX                 | Test current database semantics only                                    | Warning/notification policy remains an explicit product question                          | Research / Plan |
| Privacy oracle            | Assert owner RLS denial and boolean status, not reserve response shape  | The reserve response belongs to the caller and contains their own id                      | Research        |
| Foreign-resource coverage | Reuse existing access-control spec                                      | It already proves a valid foreign item UUID is denied by RLS                              | Research        |
| Action validation         | Dedicated Vitest project with an Astro dev server and one HTTP contract | Proves Astro validation before the auth guard without relying only on direct schema tests | Plan            |

## Scope

**In scope:** reservation privacy integration; reserved-item edit/delete integration; representative Zod schema unit cases; one Astro action input-validation contract; test-plan cookbook update.

**Out of scope:** production code or database changes; signin/signup validation; notification or warning UX; duplicated valid-foreign-ID RLS test; browser E2E.

## Architecture / Approach

Reuse `setupReservationScenario()` and exercise privacy/mutation behavior through signed-in owner and invitee clients, with service-role reads only as controls. Test Zod constraints in the existing unit project. A separate Vitest project starts Astro locally and posts malformed JSON to `/_actions/items.create`; input validation must be returned instead of the handler's unauthenticated error.

## Phases at a Glance

| Phase                                           | What it delivers                                        | Key risk             |
| ----------------------------------------------- | ------------------------------------------------------- | -------------------- |
| 1. Reservation privacy and mutation integration | Owner privacy, edit preservation, delete cascade proofs | #4, #6               |
| 2. Schema constraint unit tests                 | Cheap regression signal for Zod boundaries              | #5                   |
| 3. Astro action boundary and cookbook           | Runtime parsing proof and actionable test recipes       | #5, rollout accuracy |

**Prerequisites:** Local Supabase and `.env.test` for Phase 1; Node/npm dependencies installed.  
**Estimated effort:** A few focused implementation sessions across three gated phases.

## Open Risks & Assumptions

- Astro dev-server startup under the Cloudflare adapter must be reliable and isolated in CI; keep one boundary request to limit overhead.
- The PRD's deletion-notification question remains unresolved and is not answered by this test plan.

## Success Criteria (Summary)

- Owner-readable data never exposes another member's claimer identity while reserved status remains available.
- Edit preserves and delete cascades an active reservation, with both member-visible state and database state verified.
- Schema and actual Astro action boundary tests pass, and the cookbook describes the distinct validation and authorization layers.
