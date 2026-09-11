# Per-user default currency with PLN system fallback — Plan Brief

> Full plan: `context/changes/per-user-default-currency/plan.md`

## What & Why

Let each user pick a **default currency** stored on their profile, applied to new items when they don't specify one, and move the system-wide fallback from `USD` to `PLN` (Polish market first). Today currency is a single hardcoded `"USD"` constant that no user can change and no form surfaces — so every priced item is dollars regardless of who created it or where they are.

## Starting Point

Currency lives in exactly one place: `DEFAULT_CURRENCY = "USD"` in `src/lib/services/items.ts:9`, consumed by `resolveCurrency` for both `createItem` and (post-S-02) `updateItem`. Item forms never surface currency; the optimistic placeholder in `AddItemForm.tsx` hardcodes `"USD"`. `items.currency` is a nullable `char(3)` with a `^[A-Z]{3}$` CHECK (migration `20260528110336_items_add_price.sql`). There is **no per-user data store** — auth is Supabase `auth.users` only; F-01 added `lists`/`items`/`invitations`/`reservations` but nothing keyed to a user preference. S-02's F1 fix already made `updateItem` preserve an item's stored currency rather than clobbering it, so this builds on that cleanly.

## Desired End State

A signed-in user visits a protected `/settings` page, sees their current default currency in a fixed dropdown (`PLN`, `EUR`, `USD`, `GBP`), changes it, and saves (toast). New priced items inherit that default — including the optimistic add-item row, which now matches what the server persists. Every user (new signup or pre-existing) has a `profiles` row defaulting to `PLN`. Existing items keep their stored currency untouched; changing the default is never retroactive.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Storage model | Dedicated `public.profiles` table | Canonical, RLS-controlled, queryable home for this and future per-user settings; matches the repo's migrations+RLS conventions. | Interview |
| Currency set | Fixed short dropdown (`PLN`,`EUR`,`USD`,`GBP`) | No invalid/typo codes, clean UX, easy `Intl` formatting; single source of truth in `src/lib/currency.ts`. | Interview |
| Per-item override | None for now — items inherit the profile default | Smallest surface that closes the follow-up; mixed-currency-per-item is a later change. | Interview |
| UI surface | Dedicated protected `/settings` page | A real home for account settings that future prefs extend, cleanly separated from the dashboard. | Interview |
| System fallback | Flip `"USD" → "PLN"`; leave existing items | Matches the Polish-first goal with zero risk to already-priced items. | Interview |
| Provisioning | `handle_new_user()` trigger + one-time backfill, default `PLN` | Every user always has a profile row, so reads never miss and app-side branching stays minimal. | Interview |
| Retroactivity | New items only | Predictable, non-destructive; a "default" shouldn't rewrite history. | Interview |
| Phasing | 3 phases: schema → server wiring → UI | Each phase is independently verifiable; types land before code, server before UI. | Plan |

## Scope

**In scope:**

- New migration: `public.profiles` (`default_currency char(3) not null default 'PLN'`), RLS (self-only select/update/insert), `handle_new_user()` trigger, one-time backfill; regenerated `database.types.ts`.
- New `src/lib/currency.ts` (`SUPPORTED_CURRENCIES`, `SYSTEM_DEFAULT_CURRENCY`, `currencySchema`, `profileUpdateSchema`).
- New `src/lib/services/profiles.ts` (`getDefaultCurrency`, `updateDefaultCurrency`).
- Flip `DEFAULT_CURRENCY` to `PLN`; thread a resolved `defaultCurrency` through `resolveCurrency`/`createItem`/`updateItem` and the `items.create`/`items.update` action handlers.
- New `profile.updateCurrency` action; new protected `src/pages/settings.astro`; new `CurrencySettingsForm.tsx`; shadcn `select` primitive.
- Dashboard `/settings` nav link; thread SSR default currency into `ListDetail` → `AddItemForm` optimistic placeholder.

**Out of scope:**

- Per-item currency override in the item forms.
- Re-stamping / backfilling existing items' currency.
- Multi-currency conversion, FX rates, or cross-currency totals.
- Any account settings beyond the currency selector (the page is scaffolded to grow, currency only ships here).

## Architecture / Approach

Extends the established schema → service → action → island pattern. Phase 1 lands the data foundation (the first per-user table) with trigger-based provisioning and backfill, then regenerates the typed client so everything downstream is typed. Phase 2 is pure server wiring: a currency source-of-truth module, a profiles service, the `USD → PLN` flip, and threading the resolved default into item writes at the action boundary (services stay client-agnostic and take `defaultCurrency` as an argument). Phase 3 adds the `/settings` island and closes the optimistic-parity gap so the add-item placeholder reflects the real default. RLS on `profiles` is self-only and non-recursive, so no SECURITY DEFINER helper is needed.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema + provisioning | `profiles` table, RLS, `handle_new_user()` trigger, backfill, regenerated types | Trigger on `auth.users` + backfill must be verified against a real reset; a missed backfill leaves pre-existing users row-less |
| 2. Server wiring | `currency.ts`, `profiles` service, PLN flip, `defaultCurrency` threaded into item writes | Only two call sites (`items.create`/`items.update`) — must update both signatures; `updateItem` must keep preserving stored currency |
| 3. `/settings` UI + optimistic parity | shadcn `select`, `profile.updateCurrency` action, settings page/form, nav link, optimistic placeholder fix | react-hook-form island must be `client:only`; optimistic row must use the SSR-provided default, not a hardcode |

**Prerequisites:** S-02 shipped and archived (it is). No dependency on S-03/S-04/S-05.
**Estimated effort:** ~3 sessions, one per phase. Phase 1 is DB-heavy; Phase 3 carries the most files and the manual UI checks.

## Open Risks & Assumptions

- **Assumption**: the `handle_new_user()` trigger reliably provisions a profile row on signup; `getDefaultCurrency` still falls back to `SYSTEM_DEFAULT_CURRENCY` defensively if a row is somehow missing.
- **Risk**: forgetting to regenerate `database.types.ts` after the migration would break Phase 2 typing — Phase 1 verification gates on it.
- **Risk**: the `USD → PLN` flip means old default-less items were never stored (currency only set when price present), so there is no silent data change; existing `USD` rows remain `USD` by design and may sit alongside new `PLN` rows. Intentional and expected.
- **Follow-up**: this feature likely warrants a new roadmap slice entry in `context/foundation/roadmap.md`.
