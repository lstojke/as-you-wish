# Wishlist Data Schema — Plan Brief

> Full plan: `context/changes/wishlist-data-schema/plan.md`

## What & Why

Land the AsYouWish data foundation as a single Postgres migration: four tables (`lists`, `items`, `invitations`, `reservations`) with full Row-Level Security, the FR-013 exclusive-reservation invariant enforced by a unique partial index, and a view that lets list owners see reservation state without seeing claimer identity. This is roadmap F-01 — the only `ready` item and the schema substrate every later vertical slice builds on.

## Starting Point

`supabase/migrations/` does not exist yet — this is the first migration. Supabase SSR auth is already wired (`src/lib/supabase.ts`), so `auth.uid()` and `auth.jwt() ->> 'email'` are available inside RLS predicates. No application-layer data code exists; that lands in S-01.

## Desired End State

After this change, a developer can `npx supabase db reset` and get a clean database with the full AsYouWish entity graph. Concurrent reservation attempts on the same item resolve with exactly one winner via Postgres unique-violation. A list owner can read every column of their own list and items, can see *whether* an item is reserved, but cannot — through any query path — discover *who* reserved it.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Reservation model | Separate `reservations` table | Preserves history, gives RLS a dedicated table for identity hiding, matches roadmap's named approach | Plan |
| FR-013 enforcement | Unique partial index `where released_at is null` | Postgres handles the race natively, no app-level locking | Plan |
| Invitations design | Email-keyed row (no token) | Matches PRD wording "sent to specific people"; no link-leak risk | Plan |
| Identity hiding | RLS restricts `reservations` to claimer; owner reads via `item_reservation_status` view | DB-enforced privacy — a missed `select *` in app code can't leak claimer_id | Plan |
| Owner self-claim | Allowed | User decision: owner may need to mark "got this already" | Plan |
| Edit-during-reservation (PRD Q1) | Allow edits, no version tracking | MVP simplicity; downstream UX work in S-05 if needed | Plan |
| Delete semantics | Hard delete + CASCADE | No tombstones, no `deleted_at` filters in every policy | Plan |
| Invitations RLS | Owner manages; invitee accepts via email match | Both sides see what they need; acceptance is a single `update` | Plan |
| Primary keys | UUID v4 (`gen_random_uuid()`) | Non-enumerable IDs safe to expose in URLs | Plan |
| Migration shape | Single migration file | Atomic apply/rollback; one reviewable diff | Plan |
| Seed data | None | Migration is schema-only; tests build fixtures | Plan |
| Plan scope | Migration + RLS only | Application code belongs to S-01 | Plan |

## Scope

**In scope:**
- Single SQL migration file under `supabase/migrations/`
- Four tables, all FKs, supporting indexes, the FR-013 unique partial index
- `updated_at` triggers on `lists` and `items`
- RLS enabled on all four tables, per-op per-role policies
- `item_reservation_status` view
- Local-verification artifacts (`verify.sql`, `race-test.sh`) in the change folder
- Apply to remote (production) Supabase project

**Out of scope:**
- Any application code (API routes, components, services, generated `database.types.ts`)
- Realtime, notifications, mobile, rich content (FR-014/015/016 — parked)
- Soft delete / `deleted_at`
- Token-based shareable invitation links
- Multi-owner lists, list transfer
- Edit-tracking columns or `item_version`
- Seed data or fixtures

## Architecture / Approach

```
auth.users
   └── lists (owner_id)
         ├── items (list_id)
         │     └── reservations (item_id, claimer_id)
         └── invitations (list_id, email, accepted_by_user_id)

         + view: item_reservation_status(item_id, list_id, is_reserved)
```

One migration: schema → indexes → triggers → enable RLS → policies → view. Verification runs in three personas (owner / invitee / outsider) covering every CRUD on every table, plus a parallel-claim race script for FR-013.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Author migration | Single timestamped SQL file with full schema + RLS + view | Wrong RLS predicate leaks `claimer_id` |
| 2. Local verification | Migration applies cleanly on `db reset`; race test + RLS probes pass | Race test is flaky or doesn't exercise real concurrency |
| 3. Remote apply | Migration on production Supabase; smoke confirms no auth regression | Production project is the same one serving live auth — wrong apply could break login |

**Prerequisites:** Supabase CLI installed; Docker running for local stack; production Supabase project linked.
**Estimated effort:** ~1–2 evening sessions across the three phases.

## Open Risks & Assumptions

- **`item_reservation_status` view privacy is RLS-dependent.** If the view is created `security definer` or with the wrong owner, RLS on the underlying tables won't gate it. The plan calls for `security_invoker = true`; verify in Phase 2.
- **Email normalization assumption.** Storing emails lowercased+trimmed assumes Supabase's `auth.users.email` is also stored that way — if Supabase preserves case anywhere upstream, the policy comparison must normalize both sides.
- **Production smoke risks the live login.** Phase 3 applies to the same Supabase project that serves auth today. The migration is purely additive (new tables only, no touches to `auth.*`), but the smoke step exists to catch any surprise interaction.

## Success Criteria (Summary)

- A fresh `npx supabase db reset` produces a working AsYouWish schema with all RLS enabled.
- Two parallel reservation inserts on the same item: exactly one wins (Postgres `23505`); the other can retry after release.
- A list owner can never read `reservations.claimer_id` through any query path — direct table, view, or join.
