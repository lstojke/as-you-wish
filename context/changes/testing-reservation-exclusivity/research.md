---
date: 2026-09-13T20:40:42+02:00
researcher: Lukasz Stojke
git_commit: 170c5905f2dbe9f6843dfb68b2af1d5f33c63802
branch: master
repository: as-you-wish
topic: "Bootstrap Vitest and prove reservation exclusivity under concurrency (Test Plan Phase 1, Risk #1)"
tags: [research, codebase, reservations, concurrency, vitest, supabase, rls]
status: complete
last_updated: 2026-09-13
last_updated_by: Lukasz Stojke
---

# Research: Reservation exclusivity under concurrency + Vitest bootstrap

**Date**: 2026-09-13T20:40:42+02:00
**Researcher**: Lukasz Stojke
**Git Commit**: 170c5905f2dbe9f6843dfb68b2af1d5f33c63802 (branch `master`, 10 commits ahead of origin — not yet pushed, so local file refs are used instead of GitHub permalinks)
**Branch**: master
**Repository**: as-you-wish

## Research Question

Ground Test Plan Phase 1 ("Bootstrap + reservation exclusivity", Risk #1). Prove that two concurrent reserves on one available item resolve to exactly one success, the losing caller gets a clean rejection, and the DB holds exactly one claim — exclusivity must hold at the DB boundary under real concurrency, not just single-threaded. This phase also bootstraps the Vitest runner (no test infra exists yet). Identify the persisted claim mechanism, the reserve entry point, and what the losing caller receives, plus everything needed to stand up Vitest against local Supabase.

## Summary

Exclusivity is enforced **entirely at the database boundary** by a unique partial index, not by application code:

```sql
create unique index reservations_one_active_per_item
  on public.reservations (item_id)
  where released_at is null;
```

A second concurrent insert for the same `item_id` (with `released_at IS NULL`) fails with Postgres error **`23505`** (unique violation). There is **no RPC, no `FOR UPDATE` lock, no `ON CONFLICT`, and no app-layer check** — the constraint is load-bearing and atomic. The reserve path is a direct `.insert()` on the `reservations` table via the service `createReservation`, wrapped by the Astro action `reservations.reserve`, which maps `23505` → `ActionError({ code: "CONFLICT", message: "Someone just reserved this item first" })`. The client branches on `error.code === "CONFLICT"`.

This means the Phase 1 exclusivity test must exercise a **real concurrent insert race against a real Postgres** (local Supabase), because the guarantee lives in the DB, not in code a unit test could stub. The cheapest test with real signal: two concurrent reserve calls by two list members on one item → assert exactly one success, one `23505`/`CONFLICT`, and exactly one active row in `reservations`. A precedent for the exact race harness already exists in the archive (`race-test.sh`).

**Vitest is not installed.** No test files or configs exist. The project pins `vite@^7` via `overrides`, so Vitest is the low-friction runner. The main bootstrap subtlety: `.env`/`.dev.vars` point at a **remote** Supabase project — integration tests must target the **local** stack (`http://127.0.0.1:54321`, DB `54322`) instead, using the local service-role key for fixtures.

## Detailed Findings

### Reserve entry point (action → service → Supabase)

**Astro action** `reservations.reserve` — [src/actions/index.ts](src/actions/index.ts#L240-L261):
- Input schema: `reservationCreateSchema` = `{ itemId: z.uuid() }` ([src/lib/schemas/wishlist.ts](src/lib/schemas/wishlist.ts#L68-L75)).
- Gets the SSR client + user via `requireSupabase(context.locals)` ([src/actions/index.ts](src/actions/index.ts#L22-L32)) — throws `UNAUTHORIZED` if no user, `INTERNAL_SERVER_ERROR` if no client.
- Delegates to `createReservation`, then maps errors (see loser contract below).

**Service** `createReservation` — [src/lib/services/reservations.ts](src/lib/services/reservations.ts#L13-L25):
```typescript
const { data: { user } } = await client.auth.getUser();
if (!user) throw new Error("Not authenticated");
const { data, error } = await client
  .from("reservations")
  .insert({ item_id: input.itemId, claimer_id: user.id })
  .select("*")
  .single();
if (error) throw error;
return data;
```
- The persisted claim is a **direct `.insert()`**. `claimer_id` is taken from the authenticated user, never from client input.
- On the losing insert, Supabase throws a `PostgrestError` with `code === "23505"`, which propagates up.

**Release / teardown** `reservations.release` → `releaseReservation` — [src/lib/services/reservations.ts](src/lib/services/reservations.ts#L27-L33): soft-delete via `.update({ released_at })` `.eq("item_id", …)` `.is("released_at", null)`. RLS + column grant restrict writes to `released_at` on the caller's own row. Useful for freeing an item between test cases.

**Client SSR construction** — [src/lib/supabase.ts](src/lib/supabase.ts#L1-L22): `createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, { cookies })`; returns `null` if env is missing. Wired into `context.locals.supabase` / `context.locals.user` by [src/middleware.ts](src/middleware.ts#L1-L22).

### What the losing caller receives (the "clean rejection" contract)

**Action-layer mapping** — [src/actions/index.ts](src/actions/index.ts#L247-L257):
```typescript
if (err instanceof ActionError) throw err;
if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505") {
  throw new ActionError({ code: "CONFLICT", message: "Someone just reserved this item first" });
}
console.error("reservations.reserve failed", err);
throw new ActionError({ code: "INTERNAL_SERVER_ERROR", message: "Could not reserve item" });
```

**Client branch** — [src/components/lists/ListDetail.tsx](src/components/lists/ListDetail.tsx#L49-L65): on `error.code === "CONFLICT"` it flips the item to Reserved and toasts "Someone just reserved this item first"; otherwise a generic failure toast. A per-item pending flag disables the button to gate double-submits (app-layer UX guard only — not the exclusivity mechanism).

**Loser contract to assert:**
- At the DB/service layer: the losing `createReservation` throws an error with `code === "23505"`.
- At the action layer: the loser receives `ActionError` with `code === "CONFLICT"` and `message === "Someone just reserved this item first"`.

### The persisted claim mechanism (DB boundary)

`reservations` table — [supabase/migrations/20260527125732_initial_wishlist_schema.sql](supabase/migrations/20260527125732_initial_wishlist_schema.sql#L57-L63):
```sql
create table public.reservations (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.items (id) on delete cascade,
  claimer_id   uuid not null references auth.users (id) on delete cascade,
  claimed_at   timestamptz not null default now(),
  released_at  timestamptz null
);
```

The load-bearing invariant — same file, unique partial index on `(item_id) WHERE released_at IS NULL`. Because it is *partial*, a released item (`released_at` non-null) is excluded, so items can be re-reserved after release.

**RLS INSERT gate** — same file (~L269-L275):
```sql
create policy reservations_insert on public.reservations
  for insert to authenticated
  with check (
    claimer_id = (select auth.uid())
    and public.is_item_list_member(item_id)
  );
```
Both racers must be **members** of the item's list (owner or accepted invitee) — this shapes the fixture (see below). `reservations_select` is claimer-only; `reservations_update` allows only the claimer to write only `released_at` (owner never sees `claimer_id`).

**Taken/free without identity leak**: `is_item_reserved(item_uuid)` (SECURITY DEFINER, membership-guarded) — [supabase/migrations/20260528095257_gate_invitations_on_confirmed_email.sql](supabase/migrations/20260528095257_gate_invitations_on_confirmed_email.sql#L46-L56); surfaced through the `item_reservation_status` boolean view, read by `listReservedItemIds` [src/lib/services/items.ts](src/lib/services/items.ts#L27-L33). (The later migration [supabase/migrations/20260913081500_align_is_item_reserved_membership_guard.sql](supabase/migrations/20260913081500_align_is_item_reserved_membership_guard.sql) keeps this guard aligned.) Relevant to Phase 3 privacy tests, not strictly Phase 1.

**Generated types** — [src/db/database.types.ts](src/db/database.types.ts#L125-L170): `reservations` Row/Insert/Update shapes match the table.

### Vitest bootstrap grounding

- **Nothing installed / configured**: no `vitest`, no `*.test.ts` / `*.spec.ts`, no `vitest.config.*`. Confirmed absent. Must be added.
- **package.json** — [package.json](package.json#L1-L61): scripts are `dev/build/preview/astro/lint/lint:fix/format` (no `test`). Overrides pin `vite: "^7.3.2"`. Key libs: `astro@^6.3.1`, `react@^19.2.6`, `@supabase/supabase-js@^2.106.1`, `@supabase/ssr@^0.10.3`, `zod@^4.4.3`, `typescript@^5.9.3`. Node 22.14.0 (`.nvmrc`). `lint-staged` runs eslint/prettier on staged files.
- **Config inheritance** — [astro.config.mjs](astro.config.mjs#L1-L28): `output: "server"`, cloudflare adapter, `vite.plugins: [tailwindcss()]`, and `env.schema` declaring `SUPABASE_URL`/`SUPABASE_KEY`/`RESEND_*` as server secrets. App code reads them via `astro:env/server` (e.g. [src/lib/supabase.ts](src/lib/supabase.ts#L3), [src/lib/config-status.ts](src/lib/config-status.ts#L1)) — **not** `import.meta.env`.
- **Path alias** — [tsconfig.json](tsconfig.json): `@/* → ./src/*`; Vitest must mirror this via `resolve.alias`.
- **Local Supabase** — [supabase/config.toml](supabase/config.toml#L1-L65): API `54321`, DB `54322`, Studio `54323`; `[db.seed]` references `./seed.sql` (which does **not** exist yet). Local stack already started this session (`npx supabase start`, exit 0).
- **CI** — `.github/workflows/ci.yml`: `npm ci → astro sync → lint → build` (build needs `SUPABASE_URL`/`SUPABASE_KEY`). No test step yet — wiring that is Phase 4, not Phase 1.
- **No seed/helpers**: `supabase/seed.sql` absent; `supabase/snippets/` empty.

## Code References

- `src/actions/index.ts:240-261` — `reservations.reserve` action; `23505` → `CONFLICT` mapping (L247-257)
- `src/actions/index.ts:22-32` — `requireSupabase` (auth/client guard)
- `src/actions/index.ts:262-272` — `reservations.release` action
- `src/lib/services/reservations.ts:13-25` — `createReservation` (the `.insert`)
- `src/lib/services/reservations.ts:27-33` — `releaseReservation` (soft-delete)
- `src/lib/schemas/wishlist.ts:68-75` — `reservationCreateSchema` / `reservationReleaseSchema`
- `src/components/lists/ListDetail.tsx:49-79` — client `handleReserve` / `handleRelease`, CONFLICT branch
- `src/lib/supabase.ts:1-22` — SSR client factory
- `src/middleware.ts:1-22` — attaches `locals.supabase` / `locals.user`
- `src/lib/services/items.ts:27-33` — `listReservedItemIds` (boolean status view)
- `supabase/migrations/20260527125732_initial_wishlist_schema.sql:57-63` — `reservations` table
- `supabase/migrations/20260527125732_initial_wishlist_schema.sql:69-72` — `reservations_one_active_per_item` unique partial index (the invariant)
- `supabase/migrations/20260527125732_initial_wishlist_schema.sql:264-285` — reservations RLS (select/insert/update + column grant)
- `supabase/migrations/20260528095257_gate_invitations_on_confirmed_email.sql:46-56` — membership-guarded `is_item_reserved`
- `supabase/migrations/20260913081500_align_is_item_reserved_membership_guard.sql` — keeps the guard aligned
- `src/db/database.types.ts:125-170` — generated `reservations` types
- `package.json:1-61`, `astro.config.mjs:1-28`, `tsconfig.json`, `supabase/config.toml:1-65`, `.github/workflows/ci.yml` — bootstrap surface

## Architecture Insights

- **The DB is the concurrency authority.** Exclusivity is a single atomic unique-index check; app code only translates the resulting `23505` into a user-facing `CONFLICT`. A test that mocks Supabase would prove nothing — the risk lives precisely where a mock disappears. This is exactly the "must challenge" in the Test Plan Risk #1 row ("the app-layer check is enough" — it isn't; there is no app-layer check).
- **Two layers to assert, one race to run.** The real race must run once at the DB boundary; the `23505 → CONFLICT` mapping is pure translation logic that can be asserted at the action layer (or unit-tested by feeding a fake `{ code: "23505" }` error) without a second live race.
- **Membership shapes the fixture.** RLS requires both racers to be list members. The realistic "two relatives" fixture = list owner + one accepted invitee (two members), each with their own authenticated client, both reserving the same item. Seeding users/lists/invitations is easiest with the local **service-role** client (bypasses RLS), then acting as each member with an anon-key client signed in as that user.
- **Release re-opens the item.** Because the unique index is partial on `released_at IS NULL`, `releaseReservation` cleanly frees an item — handy for resetting state between test cases.
- **Env divergence is a trap.** `astro:env/server` is Astro-runtime-only; Vitest can't import `astro:env/server` directly, so a test-only Supabase client should be built with `@supabase/supabase-js`'s `createClient(url, key)` using **local-stack** URL/keys, not the remote values in `.env`/`.dev.vars`.

## Historical Context (from prior changes)

- [context/archive/2026-09-13-reserve-item-exclusively/plan.md](context/archive/2026-09-13-reserve-item-exclusively/plan.md#L131-L138) — "Conflict mapping is the crux": the service lets Postgres `23505` propagate; the action maps it to `CONFLICT` (409). "The exclusivity race is resolved by the DB, not app code."
- [context/archive/2026-09-13-reserve-item-exclusively/plan.md](context/archive/2026-09-13-reserve-item-exclusively/plan.md#L128-L129) — a per-item pending flag gates double-submits at the UI (UX only, not the invariant).
- [context/archive/2026-05-27-wishlist-data-schema/race-test.sh](context/archive/2026-05-27-wishlist-data-schema/race-test.sh) — **existing precedent**: two concurrent transactions insert a reservation for the same `item_id`; asserts "exactly one success and one failure" with SQLSTATE `23505`. Directly portable as the Vitest concurrency pattern (fixtures via superuser bypass RLS).
- [context/archive/2026-05-27-wishlist-data-schema/verify.sql](context/archive/2026-05-27-wishlist-data-schema/verify.sql) — asserts owner sees 0 reservation rows and an invitee sees only their own (privacy invariant; Phase 3 relevance).
- [context/foundation/prd.md](context/foundation/prd.md#L45-L69) — US-01 acceptance: "Two simultaneous Reserve taps on the same item result in exactly one successful claim"; Business Logic: "concurrent Reserve attempts on the same item resolve to exactly one success."
- PRD FR-013 (exclusive claim, must-have), FR-015 (cancel own reservation, in scope for the S-05 change). Stale-reservation expiry deferred to v2.

## Related Research

- No prior `research.md` artifacts exist under `context/changes/**` or `context/archive/**` (older changes used `plan-brief.md` + `plan.md`). This is the first research doc in the new format for this topic.

## Relevant Lessons (from context/foundation/lessons.md)

- **"Shared-list queries must rely on lists_select RLS, not an invitations join"** — over-mocking or bypassing RLS with a service-role client hides real behavior. For Phase 1, use the service-role client **only** to seed fixtures; run the actual reserve race through **member (anon-key, signed-in) clients** so RLS + the unique index are genuinely exercised. This mirrors the Test Plan anti-pattern "over-mocking Supabase so RLS/policies are never exercised."

## Open Questions

1. **Test entry point: service vs action.** Exercising `createReservation` directly with two signed-in member clients gives the real DB race and the `23505` signal, but the `CONFLICT` mapping lives in the action. Options: (a) race at the service layer + separately unit-test the `23505→CONFLICT` mapping with a fake error; (b) drive the action handler by constructing `context.locals`. Decision deferred to `/10x-plan`.
2. **Fixture strategy.** Confirm the cheapest way to create two email-confirmed members: seed `auth.users` + list + accepted invitation via the local service-role client, or use `supabase.auth.admin.createUser`. Needs a `seed.sql` or a programmatic setup helper. (`supabase/seed.sql` referenced in config but absent.)
3. **Local stack keys wiring.** Decide how the test run obtains local `SUPABASE_URL` / anon key / service-role key — a dedicated `.env.test` (local stack values), reading `supabase status --output json`, or hardcoding the well-known local demo keys. Must not reuse the remote `.env` values.
4. **True concurrency in one Node process.** Confirm firing two `createReservation` promises with `Promise.allSettled` reliably produces the race against local Postgres (the archived `race-test.sh` used two OS processes). If single-process interleaving is insufficient, fall back to two parallel connections / the shell-style harness.
5. **`.single()` on the loser.** Verify the loser's failure surfaces as `code === "23505"` (not a `PGRST116` "no rows" from `.single()`), so the CONFLICT mapping fires as intended.
