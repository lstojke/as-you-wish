# Wishlist Data Schema Implementation Plan

## Overview

Land the AsYouWish data foundation: four Postgres tables (`lists`, `items`, `invitations`, `reservations`) with full RLS, the FR-013 exclusive-reservation invariant enforced by a unique partial index, and a `item_reservation_status` view that lets list owners see reservation state without seeing claimer identity. Greenfield — no prior migrations.

## Current State Analysis

- `supabase/migrations/` does not exist. This is the first migration in the project.
- Supabase SSR auth is wired (`src/lib/supabase.ts`); `auth.uid()` and `auth.jwt() ->> 'email'` are available for RLS predicates.
- AGENTS.md mandates `YYYYMMDDHHmmss_short_description.sql` naming and per-op per-role policies on every new table.
- Local Supabase stack runs via `npx supabase start` (Docker). Remote project is the one already serving production auth.
- No `src/db/database.types.ts` exists yet — out of scope for this change per scope decision.

## Desired End State

- Four tables exist in `public` schema with the relationships and constraints below.
- RLS is enabled on all four tables; every CRUD operation goes through an explicit policy.
- An owner querying their list sees reservation state (taken/free) via `item_reservation_status` but never sees `claimer_id`.
- Two concurrent `INSERT INTO reservations(item_id, claimer_id)` against the same active row: one succeeds (200), the other fails with Postgres error 23505 (unique violation).
- `npx supabase db reset` applies the migration cleanly on a fresh local DB; `npx supabase db push` applies it to the remote project.
- `change.md` status flipped to `planned`; this plan is the contract for execution.

### Key Discoveries

- Roadmap F-01 explicitly anchors FR-013 on a unique partial index — confirmed as the chosen mechanism.
- PRD Open Question 1 (edit-during-reservation) resolved during planning: **owner may edit reserved items freely; no version tracking in MVP**.
- Identity hiding is the load-bearing privacy invariant: it must live in RLS, not the API layer, or a single missed `select *` leaks claimer identity.
- `auth.users.email` is the matching key for invitation acceptance — case-normalize on insert (lowercase, trim) and in the policy predicate.

## What We're NOT Doing

- No realtime subscriptions, channels, or triggers beyond what's needed for the unique index.
- No FR-014 (rich content), FR-015 (mobile), FR-016 (notifications).
- No soft-delete (`deleted_at`) columns — hard delete + CASCADE.
- No app-layer code: no API routes, no React components, no service helpers, no generated `database.types.ts`. Those land in S-01.
- No seed data or fixtures.
- No `item_version` column or edit-tracking for reserved items.
- No revocation flow for invitations beyond owner-issued `DELETE`.
- No token-based shareable links — invitations are email-keyed only.
- No multi-owner lists; no list transfer.

## Implementation Approach

A single timestamped migration file under `supabase/migrations/` contains the entire schema landing: tables, foreign keys, the FR-013 unique partial index, RLS enables, every policy, and the `item_reservation_status` view. Atomic apply, atomic rollback. Verification is psql probes against a fresh local DB plus a parallel-claim race script that proves the unique constraint resolves the race. After local green, the same migration goes to the remote Supabase project via `npx supabase db push`, followed by a manual smoke through the live app.

## Critical Implementation Details

- **Identity-hiding RLS is load-bearing.** The reservations `SELECT` policy must restrict rows to the claimer; the owner-side "is this taken?" path goes through `item_reservation_status`, a view created `WITH (security_invoker = true)` so the caller's RLS on `items` gates the rows the view can read. The view returns only booleans — never `claimer_id`. If both the row and the view leak `claimer_id`, the privacy invariant fails silently.
- **Email normalization on invitations.** `invitations.email` is stored lowercased and trimmed (`CHECK (email = lower(trim(email)))`); the acceptance policy compares `lower(trim(auth.jwt() ->> 'email'))` to the stored value. Mismatched case = silent invitation invisibility.
- **Unique partial index, not full unique.** `CREATE UNIQUE INDEX ON reservations(item_id) WHERE released_at IS NULL` allows a reserved item to be released and re-reserved later; a plain unique constraint would block any historical row.
- **`pgcrypto` for `gen_random_uuid()`.** Enable the extension at the top of the migration; Supabase usually has it but don't assume.
- **CASCADE chain.** `lists` → `items` → `reservations`/`invitations` all use `ON DELETE CASCADE`. Deleting a Supabase auth user cascades to `lists.owner_id` (FK to `auth.users(id)`), which then cascades to children. Verify the FK to `auth.users` references the right column.

## Phase 1: Author migration

### Overview

Write the single SQL migration that lands schema + constraints + RLS + view. No partial commits — the file is reviewable as one diff and applied atomically.

### Changes Required

#### 1. Migration file

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_initial_wishlist_schema.sql` (use `date -u +%Y%m%d%H%M%S`)

**Intent**: Stand up the entire AsYouWish data foundation in one transaction. After this file applies, the four tables exist with full RLS, FR-013 is enforced at the DB layer, and an owner-safe reservation-status view is available.

**Contract**:

- `create extension if not exists pgcrypto;`
- **`lists`** — `id uuid pk default gen_random_uuid()`, `owner_id uuid not null references auth.users(id) on delete cascade`, `title text not null check (char_length(title) between 1 and 200)`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`.
- **`items`** — `id uuid pk default gen_random_uuid()`, `list_id uuid not null references lists(id) on delete cascade`, `title text not null check (char_length(title) between 1 and 500)`, `notes text`, `link text`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`.
- **`invitations`** — `id uuid pk default gen_random_uuid()`, `list_id uuid not null references lists(id) on delete cascade`, `email text not null check (email = lower(trim(email)) and email like '%@%')`, `invited_at timestamptz not null default now()`, `accepted_at timestamptz null`, `accepted_by_user_id uuid null references auth.users(id) on delete set null`, `unique (list_id, email)`.
- **`reservations`** — `id uuid pk default gen_random_uuid()`, `item_id uuid not null references items(id) on delete cascade`, `claimer_id uuid not null references auth.users(id) on delete cascade`, `claimed_at timestamptz not null default now()`, `released_at timestamptz null`.
- **Unique partial index** — `create unique index reservations_one_active_per_item on reservations(item_id) where released_at is null;` (FR-013).
- **Supporting indexes** — `items(list_id)`, `invitations(email)` (lookup on accept), `reservations(claimer_id)` (claimer's own list).
- **`updated_at` trigger** — generic `set_updated_at()` function + `before update` triggers on `lists` and `items`.
- **`alter table … enable row level security;`** on all four tables.
- **RLS policies** — see Phase 1 §2 below for the full matrix; policies live in the same file.
- **View `item_reservation_status`** — `select i.id as item_id, i.list_id, exists(select 1 from reservations r where r.item_id = i.id and r.released_at is null) as is_reserved from items i;`. Created `WITH (security_invoker = true)` so the caller's RLS on `items` filters the rows the view returns. The view does not expose `claimer_id`.

A code snippet is included for the unique partial index because the `WHERE` clause is the load-bearing detail that distinguishes this from a plain unique constraint:

```sql
create unique index reservations_one_active_per_item
  on reservations(item_id)
  where released_at is null;
```

#### 2. RLS policy matrix (same migration file)

**File**: same as §1

**Intent**: Encode the access model in policies, one per table-operation-role, so a single missed condition is visible in code review.

**Contract**: per-table policies, each `to authenticated` unless noted.

- **`lists`**
  - `select` — `using (owner_id = auth.uid() or exists (select 1 from invitations i where i.list_id = lists.id and i.accepted_by_user_id = auth.uid()))`
  - `insert` — `with check (owner_id = auth.uid())`
  - `update` — `using (owner_id = auth.uid()) with check (owner_id = auth.uid())`
  - `delete` — `using (owner_id = auth.uid())`
- **`items`**
  - `select` — `using (exists (select 1 from lists l where l.id = items.list_id and (l.owner_id = auth.uid() or exists (select 1 from invitations i where i.list_id = l.id and i.accepted_by_user_id = auth.uid()))))`
  - `insert` / `update` / `delete` — owner-only, predicate joins through `lists.owner_id = auth.uid()`
- **`invitations`**
  - `select` — owner of the list, OR `lower(trim(auth.jwt() ->> 'email')) = invitations.email`
  - `insert` / `delete` — owner-only
  - `update` — invitee-only acceptance. Field-level immutability of `email`/`list_id` is enforced via Postgres column-level privileges, not RLS WITH CHECK (which cannot reference OLD or restrict columns): `REVOKE UPDATE ON invitations FROM authenticated; GRANT UPDATE (accepted_at, accepted_by_user_id) ON invitations TO authenticated;`. The RLS policy then gates the row: `using (lower(trim(auth.jwt() ->> 'email')) = invitations.email and accepted_at is null) with check (accepted_by_user_id = auth.uid())`. Verify after migration with `\dp invitations` that Supabase's default grants on `authenticated` do not re-open `update` on `email`/`list_id`.
- **`reservations`**
  - `select` — `using (claimer_id = auth.uid())` — claimer-only. Owners see status via the view, never the rows.
  - `insert` — `with check (claimer_id = auth.uid() and exists (select 1 from items it join lists l on l.id = it.list_id where it.id = item_id and (l.owner_id = auth.uid() or exists (select 1 from invitations i where i.list_id = l.id and i.accepted_by_user_id = auth.uid()))))` — owner OR accepted invitee can claim (owner self-claim explicitly allowed).
  - `update` — claimer releases their own reservation. Restrict writable columns via Postgres column ACL (RLS WITH CHECK cannot restrict columns): `REVOKE UPDATE ON reservations FROM authenticated; GRANT UPDATE (released_at) ON reservations TO authenticated;`. RLS predicate: `using (claimer_id = auth.uid()) with check (claimer_id = auth.uid())`. Re-claiming after release creates a new row (new reservation), matching the partial-unique-index design.
  - `delete` — none (hard delete cascades from items/users; claimers cannot delete history rows).
- **View `item_reservation_status`** — `grant select on item_reservation_status to authenticated`. The view's underlying `items` access is gated by the items `select` policy, so visibility is automatically scoped.

### Success Criteria

#### Automated Verification

- Migration file lints with `npx supabase db lint` (or psql `\i` dry-run on a scratch DB).
- File naming matches `^[0-9]{14}_[a-z0-9_]+\.sql$` (AGENTS.md convention).
- `grep -c "enable row level security"` on the file returns `4` (one per table).
- ESLint / typecheck unaffected: `npm run lint` passes.

#### Manual Verification

- File reviewed end-to-end against this plan's contract before applying anywhere.
- No `claimer_id` column appears in any view or policy `using` clause meant for owners.

**Implementation Note**: After Phase 1, pause for manual file-review confirmation before applying to any database.

---

## Phase 2: Local verification

### Overview

Apply the migration to a fresh local Supabase DB and prove every invariant with psql probes plus a parallel-claim race test.

### Changes Required

#### 1. Apply migration locally

**Intent**: Reset the local Supabase DB to a clean state and apply only this migration; confirm zero SQL errors and that all four tables + the view exist.

**Contract**: `npx supabase db reset` runs cleanly; `\d+ public.lists public.items public.invitations public.reservations` and `\d+ public.item_reservation_status` show the expected shapes.

#### 2. RLS probe script

**File**: `context/changes/wishlist-data-schema/verify.sql` (scratch file, not committed to `supabase/`)

**Intent**: Capture the manual psql probes as a reusable script so future schema changes can re-run the privacy + access checks. Three personas: `owner@`, `invitee@`, `outsider@`. For each, assert that they can / cannot perform each CRUD on each table.

**Contract**: Sets `request.jwt.claims` via `set local "request.jwt.claims" = '{"sub":"<uuid>","email":"<addr>"}';` between probes; uses `select set_config('role', 'authenticated', true);`. Expected outcomes documented inline with each query. (Living artifact for the change folder — not part of the production migration.)

#### 3. FR-013 race test

**File**: `context/changes/wishlist-data-schema/race-test.sh` (scratch)

**Intent**: Prove the unique partial index resolves a real concurrent-claim race, not just a serial one.

**Contract**: Bash + `psql` script that opens two `BEGIN; INSERT INTO reservations(item_id, claimer_id) VALUES (...); COMMIT;` blocks in parallel against the same `item_id`. Expected: exactly one commits, the other receives `23505 duplicate key value violates unique constraint`. Re-run after `update reservations set released_at = now() where id = ...` — the next insert succeeds.

### Success Criteria

#### Automated Verification

- `npx supabase db reset` exits 0.
- All four tables show `Row Security: enabled` in `\d+`.
- The unique partial index appears in `\d reservations`.
- `bash context/changes/wishlist-data-schema/race-test.sh` reports `OK: exactly one insert succeeded`.

#### Manual Verification

- Run `verify.sql` and confirm every probe matches its expected outcome.
- Confirm `select * from reservations` as an owner (when not the claimer) returns zero rows.
- Confirm `select * from item_reservation_status where list_id = '<owned>'` as an owner returns expected `is_reserved` booleans.
- Confirm an accepted invitee can `select` items but cannot `update`/`delete` them.

**Implementation Note**: After Phase 2, pause for manual confirmation that all probes pass before applying to remote.

---

## Phase 3: Remote apply

### Overview

Push the verified migration to the production Supabase project and smoke through the live app to confirm no regression in the existing auth flow.

### Changes Required

#### 1. Push migration to remote

**Intent**: Apply the migration to the production Supabase project via the CLI (linked project), confirm it lands without error.

**Contract**: `npx supabase db push` against the linked production project; verify the migration row appears in `supabase_migrations.schema_migrations`.

#### 2. Production smoke

**Intent**: Manual end-to-end probe against `https://as-you-wish.as-you-wish.workers.dev/` confirms existing auth still works and the new schema is reachable.

**Contract**: Log in via the live UI (auth flow already shipped), open Supabase Studio against the production project, manually `insert` one list + one item + one invitation + one reservation, then `delete` the list and confirm CASCADE removed all children. Document the SQL run + results in `context/changes/wishlist-data-schema/smoke-notes.md`.

### Success Criteria

#### Automated Verification

- `npx supabase migration list --linked` shows the new migration as applied to the remote project.
- Cloudflare Worker deploy unaffected — no rebuild required (schema-only change).
- `curl -I https://as-you-wish.as-you-wish.workers.dev/` returns `HTTP/2 200` (regression check).

#### Manual Verification

- Production login still works.
- Manual insert + cascade-delete probe in Studio behaves as designed.
- `smoke-notes.md` recorded in change folder.

**Implementation Note**: After Phase 3, F-01 is done. Flip `change.md` status to `implemented` and update the roadmap At-a-glance row for F-01.

---

## Testing Strategy

### Unit Tests

None — no application code in this change.

### Integration Tests

- The race-test script (Phase 2 §3) is the integration test for FR-013.
- `verify.sql` is the integration test for RLS policies.

### Manual Testing Steps

Per phase, documented in each phase's Manual Verification section above. The key three:

1. RLS probes as three personas (owner / invitee / outsider) covering every CRUD on every table.
2. Parallel-claim race: two concurrent inserts on the same `item_id` — exactly one wins.
3. Owner cannot read `claimer_id` via any query path (direct table, view, join).

## Performance Considerations

Small-scale per PRD (`target_scale.users: small`). The unique partial index is the only performance-sensitive artifact and it's O(log n) per insert. Identity-hiding RLS adds a sub-select per query, fine at this scale. Re-evaluate if reservation volume ever crosses 10k/list.

## Migration Notes

- This is the first migration in the project — no backward-compatibility considerations against prior schema.
- AGENTS.md rollback note applies for future migrations: future schema changes must remain compatible with the previous Worker until that Worker is replaced.
- Hard delete is permanent. There is no undo for "I deleted the wrong list."

## References

- Roadmap: `context/foundation/roadmap.md` (F-01 row + Risk note on full-graph RLS)
- PRD: `context/foundation/prd.md` (FR-005, FR-008, FR-009, FR-013, Access Control, Business Logic)
- AGENTS.md migration conventions: `AGENTS.md` ("Supabase migrations" bullet)
- Auth wiring: `src/lib/supabase.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Author migration

#### Automated

- [x] 1.1 Migration file lints with `npx supabase db lint` — 4f6153b
- [x] 1.2 File naming matches `^[0-9]{14}_[a-z0-9_]+\.sql$` — 4f6153b
- [x] 1.3 `grep -c "enable row level security"` returns 4 — 4f6153b
- [x] 1.4 `npm run lint` passes — 4f6153b

#### Manual

- [x] 1.5 File reviewed end-to-end against the plan contract — 4f6153b
- [x] 1.6 No `claimer_id` appears in any owner-side policy or view — 4f6153b

### Phase 2: Local verification

#### Automated

- [x] 2.1 `npx supabase db reset` exits 0 — 411cbff
- [x] 2.2 All four tables show `Row Security: enabled` — 411cbff
- [x] 2.3 Unique partial index appears in `\d reservations` — 411cbff
- [x] 2.4 `race-test.sh` reports `OK: exactly one insert succeeded` — 411cbff

#### Manual

- [x] 2.5 `verify.sql` probes match expected outcomes per persona — 411cbff
- [x] 2.6 Owner cannot read `reservations` rows — 411cbff
- [x] 2.7 `item_reservation_status` returns correct booleans for owner — 411cbff
- [x] 2.8 Accepted invitee has read-only items access — 411cbff

### Phase 3: Remote apply

#### Automated

- [x] 3.1 `npx supabase migration list --linked` shows migration applied — 93809dd
- [x] 3.2 Cloudflare Worker deploy unaffected (no rebuild required) — 93809dd
- [x] 3.3 `curl -I` against production returns HTTP/2 200 — 93809dd

#### Manual

- [x] 3.4 Production login still works — 93809dd
- [x] 3.5 Manual insert + cascade-delete probe behaves as designed — 93809dd
- [x] 3.6 `smoke-notes.md` recorded in change folder — 93809dd
