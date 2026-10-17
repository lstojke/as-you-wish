# Plan: Per-user default currency with PLN system fallback

## Context

Today every item's currency is decided by a single hardcoded constant `DEFAULT_CURRENCY = "USD"` in [src/lib/services/items.ts](../../../src/lib/services/items.ts) (`resolveCurrency`, line 9). The item add/edit forms never surface currency — `mapItemFormToCreate`/`mapItemFormToUpdate` in [src/lib/schemas/wishlist.ts](../../../src/lib/schemas/wishlist.ts) omit it, and the optimistic placeholder in [src/components/lists/AddItemForm.tsx](../../../src/components/lists/AddItemForm.tsx) hardcodes `"USD"`. `items.currency` is a nullable `char(3)` with a `^[A-Z]{3}$` CHECK (migration `20260528110336_items_add_price.sql`).

There is **no per-user data store** yet — auth is Supabase `auth.users` only; the F-01 schema (`lists`/`items`/`invitations`/`reservations`) holds nothing keyed to a user preference. This change introduces the first one: a `public.profiles` table carrying `default_currency`.

S-02's F1 fix already made `updateItem` preserve an item's stored currency instead of clobbering it to USD, so this change builds on that cleanly (see the note it left in `items.ts`).

### Locked decisions (from planning interview)

- **Storage**: dedicated `public.profiles` table (not auth `user_metadata`) — canonical, RLS-controlled, gives future per-user settings a home.
- **Currency set**: fixed short dropdown (`PLN`, `EUR`, `USD`, `GBP`) — no free-form entry.
- **Per-item override**: none for now; items silently inherit the profile default.
- **UI surface**: dedicated protected `/settings` page.
- **System fallback**: flip `DEFAULT_CURRENCY` `"USD" → "PLN"`; existing items keep their stored currency (no item backfill).
- **Provisioning**: `handle_new_user()` trigger for new signups + one-time backfill for existing users; profile default `'PLN'`.
- **Retroactivity**: changing the default affects only items created afterward; existing items are never re-stamped.

### Conventions to honor

- Migrations: `supabase/migrations/YYYYMMDDHHmmss_short_description.sql`; always enable RLS; per-op, per-role policies; SECURITY DEFINER helpers with `set search_path = public` when a policy would recurse (see [lessons.md](../../foundation/lessons.md) and the F-01 migration header).
- `src/db/database.types.ts` is **generated, not hand-edited** — regenerate via `npx supabase gen types typescript --linked > src/db/database.types.ts` after the migration.
- Path alias `@/*` → `src/*`. React islands that use react-hook-form must mount `client:only="react"` (SSR instance mismatch otherwise).
- Astro Actions in [src/actions/index.ts](../../../src/actions/index.ts): `requireSupabase(locals)` gate, try/catch, `console.error("<action> failed", err)` with the eslint-disable comment, then `ActionError({ code: "INTERNAL_SERVER_ERROR", message })`. Validate input with zod.
- shadcn/ui new-york: add primitives via `npx shadcn@latest add <name>`; never hand-roll.
- Verification uses the existing Vitest runners (`npm run test:unit` / `npm run test:integration`), `npm run lint`, and `npx astro check`. Integration tests that need the database use the local Supabase stack; local DB checks use `npx supabase db reset` / `npx supabase migration list --linked`.
- Lessons priors: URL fields require an `^https?:\/\//i` refine (already satisfied); modal form dialogs reset on both open and close (no new modal here, but the settings form should reset predictably).

---

## Phase 1: Schema

Introduce the per-user profile store and provision a row for every user (new + existing), then regenerate the typed client so all downstream code is typed end-to-end before any service/UI work.

### 1. Migration — `public.profiles` + RLS + trigger + backfill

**File**: `supabase/migrations/<UTC timestamp>_add_profiles_default_currency.sql` (use the actual `date -u +%Y%m%d%H%M%S` at implementation time; must sort after `20260528110336`).

- `create table public.profiles`:
  - `id uuid primary key references auth.users (id) on delete cascade`
  - `default_currency char(3) not null default 'PLN' check (default_currency ~ '^[A-Z]{3}$')`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
- Reuse the existing `public.set_updated_at()` function: `create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();`
- `alter table public.profiles enable row level security;`
- Policies (self-only; `profiles` never recurses into another RLS'd table, so no SECURITY DEFINER helper needed):
  - `profiles_select` for select to authenticated using `id = (select auth.uid())`.
  - `profiles_update` for update to authenticated using `id = (select auth.uid())` with check `id = (select auth.uid())`.
  - `profiles_insert` for insert to authenticated with check `id = (select auth.uid())` — defensive self-insert path; primary provisioning is the trigger below.
- `handle_new_user()` provisioning trigger (mirrors the SECURITY DEFINER style of F-01's helpers):
  - `create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$ begin insert into public.profiles (id) values (new.id) on conflict (id) do nothing; return new; end; $$;`
  - `create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();`
- One-time backfill for existing users: `insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;`

**Contract**: `npx supabase db reset` applies the migration alongside prior ones with no error; `npx supabase migration list --linked` shows it applied after push. Every existing `auth.users` row gains exactly one `profiles` row defaulting to `PLN`; a fresh signup auto-creates one.

### 2. Regenerate the typed client

**File**: `src/db/database.types.ts` (generated).

- Run `npx supabase gen types typescript --linked > src/db/database.types.ts`.
- Confirm `Database["public"]["Tables"]["profiles"]` now exists with `Row`/`Insert`/`Update` carrying `id`, `default_currency`, `created_at`, `updated_at`.

### 3. Profile integration tests

**File**: `tests/integration/profiles.test.ts`.

- Use the existing local Supabase integration setup to verify a newly provisioned user receives a `PLN` profile.
- Verify an authenticated user can read and update their own profile but cannot read or update another user's profile.
- Keep the one-time backfill check in the manual verification because it runs during migration application, before the integration suite.

### Phase 1 verification

#### Automated Verification

- `npx supabase db reset` succeeds; the profiles table, trigger, and policies are present (`\d public.profiles`, `select * from pg_policies where tablename = 'profiles'`).
- `npm run test:integration -- tests/integration/profiles.test.ts` passes the provisioning and cross-user RLS cases.
- `npx astro check` passes with the regenerated types (no code consumes `profiles` yet, so this only confirms the types compile).

#### Manual Verification

- `select id, default_currency from public.profiles` returns one `PLN` row per existing user.
- Inspect the profile policies and trigger to confirm their self-only access and provisioning behavior.

---

## Phase 2: Server wiring

Make new items inherit the caller's profile default, flip the system fallback to PLN, and keep `updateItem`'s currency-preservation behavior intact. No UI yet.

### 1. Currency source of truth

**File**: `src/lib/currency.ts` (new).

- Export `SUPPORTED_CURRENCIES` as a readonly tuple `["PLN", "EUR", "USD", "GBP"] as const` and a `SupportedCurrency` type.
- Export `SYSTEM_DEFAULT_CURRENCY = "PLN"` (the last-resort fallback).
- Export `currencySchema = z.enum(SUPPORTED_CURRENCIES)` and `profileUpdateSchema = z.object({ defaultCurrency: currencySchema })` with its inferred `ProfileUpdateInput` type. This is the single place the allowed set is declared; the settings form and action both consume it.

### 2. Profiles service

**File**: `src/lib/services/profiles.ts` (new; mirror the shape of [src/lib/services/lists.ts](../../../src/lib/services/lists.ts)).

- `type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"]`.
- `getDefaultCurrency(client): Promise<string>` — resolve the current user via `client.auth.getUser()`, select `default_currency` from `profiles` where `id = user.id` (`maybeSingle`). Return the stored value, or `SYSTEM_DEFAULT_CURRENCY` when the row is missing/unauthenticated (defensive; the trigger should guarantee a row). Throw on a real query error.
- `updateDefaultCurrency(client, input: ProfileUpdateInput): Promise<ProfileRow>` — resolve the user, `.update({ default_currency: input.defaultCurrency }).eq("id", user.id).select("*").single()` (RLS also scopes it). Throw on error.

### 3. Flip the system fallback and thread the default into item writes

**File**: [src/lib/services/items.ts](../../../src/lib/services/items.ts).

- Replace `const DEFAULT_CURRENCY = "USD";` with an import of `SYSTEM_DEFAULT_CURRENCY` from `@/lib/currency` (or set the local constant to `"PLN"`); update the stale S-02 comment.
- Change `resolveCurrency(priceCents, currency)` to `resolveCurrency(priceCents, currency, defaultCurrency)` returning `priceCents !== undefined ? (currency ?? defaultCurrency) : (currency ?? null)`.
- `createItem(client, input, defaultCurrency: string)` — pass `defaultCurrency` into `resolveCurrency`.
- `updateItem(client, input, defaultCurrency: string)` — keep the read-existing-currency logic; change the fallback branch to `input.priceCents !== undefined ? (input.currency ?? existing.currency ?? defaultCurrency) : null`. Preserves stored currency; only uses the profile default when a price is newly added to an item that had none.

### 4. Resolve the default in the item action handlers

**File**: [src/actions/index.ts](../../../src/actions/index.ts).

- In `items.create` and `items.update` handlers, after `requireSupabase`, `const defaultCurrency = await getDefaultCurrency(client);` inside the try block, then pass it as the new arg to `createItem`/`updateItem`. Keep the existing catch/`console.error`/`ActionError` shape unchanged.

### Phase 2 verification

#### Automated Verification

- `npm run lint` and `npx astro check` pass (all `createItem`/`updateItem` call sites updated — only the two action handlers call them).

#### Manual Verification

- Manual (local `supabase start`): with a profile default of `PLN`, add a priced item → row stores `PLN`. Edit an existing `USD` priced item's title → currency stays `USD`. Add a price to a previously price-less item → currency becomes the profile default.

---

## Phase 3: UI

Give users a place to change their default and make the optimistic add-item row reflect it.

### 1. shadcn select primitive

- `npx shadcn@latest add select` (adds `src/components/ui/select.tsx`). Do not hand-roll.

### 2. Profile update action

**File**: [src/actions/index.ts](../../../src/actions/index.ts).

- Add a `profile` group with `updateCurrency`: `defineAction({ accept: "json", input: profileUpdateSchema, handler })` → `requireSupabase` → try `updateDefaultCurrency(client, input)` → catch with `console.error("profile.updateCurrency failed", err)` + `ActionError({ code: "INTERNAL_SERVER_ERROR", message: "Could not update settings" })`.

### 3. Settings page (SSR shell)

**Files**: [src/middleware.ts](../../../src/middleware.ts), `src/pages/settings.astro` (new).

- Add `"/settings"` to `PROTECTED_ROUTES`.
- `settings.astro`: `export const prerender = false;`, guard `user`/`supabase` from `Astro.locals` (same pattern as `dashboard.astro`), load `const defaultCurrency = await getDefaultCurrency(supabase)`, wrap in `Layout`, render `<CurrencySettingsForm client:only="react" defaultCurrency={defaultCurrency} />`. Include a "← Back to lists" link.

### 4. Currency settings form (island)

**File**: `src/components/settings/CurrencySettingsForm.tsx` (new).

- Props `{ defaultCurrency: string }`. `useForm` with `zodResolver(profileUpdateSchema)`, `defaultValues: { defaultCurrency }`.
- shadcn `Select` bound to the `defaultCurrency` field, options from `SUPPORTED_CURRENCIES`.
- On submit: `actions.profile.updateCurrency(values)`; on error `toast.error`, on success `toast.success("Settings saved")` and reset the form's default to the saved value so the button disables until the next change. Disable submit while `isSubmitting` or when the value is unchanged.

### 5. Shared profile menu + optimistic currency parity

**Files**: `src/components/AppHeader.astro`, `src/components/ProfileMenu.tsx` (new), [src/pages/lists/[id].astro](../../../src/pages/lists/%5Bid%5D.astro), [src/components/lists/ListDetail.tsx](../../../src/components/lists/ListDetail.tsx), [src/components/lists/AddItemForm.tsx](../../../src/components/lists/AddItemForm.tsx).

- Add a `ProfileMenu` React island to the shared `AppHeader` so it appears on all signed-in pages. Render a circular avatar button with the uppercase first character of the user's email; its dropdown contains a `/settings` link and the existing sign-out action. Use the existing shadcn dropdown-menu primitives.
- `lists/[id].astro`: load `const defaultCurrency = await getDefaultCurrency(supabase);` and pass it to `ListDetail`.
- `ListDetail`: accept `defaultCurrency: string`, forward it to `AddItemForm`.
- `AddItemForm`: accept `defaultCurrency: string`; replace the hardcoded `currency: input.priceCents !== undefined ? "USD" : null` placeholder with `input.priceCents !== undefined ? defaultCurrency : null` so the optimistic row matches what the server will persist. (The server remains authoritative — `onOptimisticReplace` swaps in the real row.)

### Phase 3 verification

#### Automated Verification

- `npm run lint` and `npx astro check` pass.

#### Manual Verification

- Manual: visit `/settings` while signed in → shows current default; unauthenticated → redirected to `/auth/signin`. Change default to `EUR`, save (toast). Add a priced item → optimistic row and persisted row both show `EUR`. Existing `USD` items are unchanged. The shared profile menu appears on signed-in pages, shows the email initial, links to settings, and signs out successfully.

---

## Out of scope

- Per-item currency override in the add/edit item forms (deferred; profile default only).
- Backfilling or re-stamping existing items' currency (existing rows keep their stored value).
- Multi-currency conversion / FX rates / totals — items store a single currency string; no arithmetic across currencies.
- Broader account/profile settings beyond the currency selector (the `/settings` page is scaffolded to grow, but only currency ships here).
- Avatar initials from a user's name and profile photo uploads (the initial is derived from email for now).

## Progress

### Phase 1: Schema

#### Automated

- [x] 1.1 Write the `profiles` migration (table, RLS policies, `handle_new_user()` trigger, backfill) — 294eda5
- [x] 1.2 `npx supabase db reset` applies the migration; profiles table and policies exist — 294eda5
- [x] 1.3 Regenerate `src/db/database.types.ts`; confirm `profiles` types; `npx astro check` passes — 294eda5
- [x] 1.4 `npm run test:integration -- tests/integration/profiles.test.ts` passes provisioning and cross-user RLS cases — 294eda5

#### Manual

- [ ] 1.5 Confirm one `PLN` profile per existing user and inspect the self-only policies and trigger

### Phase 2: Server wiring

#### Automated

- [x] 2.1 Add `src/lib/currency.ts` (`SUPPORTED_CURRENCIES`, `SYSTEM_DEFAULT_CURRENCY`, `currencySchema`, `profileUpdateSchema`)
- [x] 2.2 Add `src/lib/services/profiles.ts` (`getDefaultCurrency`, `updateDefaultCurrency`)
- [x] 2.3 Flip fallback to PLN and thread `defaultCurrency` through `resolveCurrency`/`createItem`/`updateItem`
- [x] 2.4 Resolve default in `items.create`/`items.update` action handlers
- [x] 2.5 `npm run lint` and `npx astro check` pass

#### Manual

- [ ] 2.6 New priced items use the profile default; title-only edits preserve stored currency; adding a price uses the default

### Phase 3: UI

#### Automated

- [ ] 3.1 `npx shadcn@latest add select`
- [ ] 3.2 Add `profile.updateCurrency` action
- [ ] 3.3 Add `/settings` to `PROTECTED_ROUTES` and create `settings.astro`
- [ ] 3.4 Create `CurrencySettingsForm.tsx`
- [ ] 3.5 Add the shared email-initial profile menu with Settings/Sign out and thread `defaultCurrency` into `ListDetail`/`AddItemForm` optimistic placeholder
- [ ] 3.6 `npm run lint` and `npx astro check` pass

#### Manual

- [ ] 3.7 `/settings` shows the saved default when signed in and redirects unauthenticated users to sign-in
- [ ] 3.8 Saving a changed default succeeds; optimistic and persisted new-item currencies match; existing items remain unchanged
- [ ] 3.9 The shared profile menu appears across signed-in pages and its Settings and Sign out actions work
