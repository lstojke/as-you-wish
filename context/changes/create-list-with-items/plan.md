# Create List With Items Implementation Plan

## Overview

S-01 lands the first product UI on top of the F-01 schema: a signed-in user can create a wish list, add items to it (title, estimated price, store link), and see their own lists alongside lists shared with them on `/dashboard`. Mutations go through **Astro Actions** (typed, zod-validated); reads are SSR via the Supabase server client; authorization is fully delegated to F-01's RLS.

## Current State Analysis

- **F-01 schema is live** (commits `4f6153b` → `93809dd`): tables `lists`, `items`, `invitations`, `reservations`, the `item_reservation_status` view, and the `SECURITY DEFINER` helpers (`is_list_owner`, `is_list_member`, `is_item_list_member`, `is_item_reserved`) are applied to the production Supabase project.
- **`items` is missing a price column.** F-01 stored `title`, `notes`, `link` only. Roadmap S-01 and PRD FR-009 both require estimated price. S-01 closes this gap with a follow-on migration.
- **No data layer exists yet**: no `src/db/database.types.ts`, no `src/lib/services/`, no JSON or Action endpoints. Auth endpoints use `formData` + redirects (`src/pages/api/auth/{signin,signup,signout}.ts`), but AGENTS.md mandates zod on `/api/**` for any new endpoint — and S-01 sidesteps `/api/**` entirely by using Astro Actions.
- **shadcn/ui is barely seeded**: only `src/components/ui/button.tsx` exists. Every other primitive S-01 needs (`form`, `input`, `label`, `dialog`, `card`, `skeleton`, `sonner`) must be added via `npx shadcn@latest add`.
- **Routing baseline**: `src/middleware.ts` gates `PROTECTED_ROUTES = ["/dashboard"]`. `src/pages/dashboard.astro` is a stub that just greets the user. `src/pages/index.astro` is the public welcome.
- **React island pattern** (`src/components/auth/*`): forms use `useState` + native `<form action>` POST to `/api/auth/*` redirects. S-01 introduces the **Astro Actions + react-hook-form + zod** pattern for the first time; this becomes the precedent for S-02–S-05.
- **No test infrastructure** (no vitest, no playwright). S-01 does not introduce one — verification is `npm run lint` + `astro check` + manual UI testing per phase.

## Desired End State

- A signed-in user can navigate to `/dashboard` and see two sections: **My lists** (owned, with an empty hero + "Create list" CTA on first visit) and **Shared with me** (rendered only when at least one accepted invitation exists). Each list is a `Card` showing title, item count, and a "View" link.
- A "Create list" dialog opens from the dashboard, validates a title (1–200 chars), and on submit the new list appears in **My lists** optimistically. Server failure rolls the optimistic insert back and surfaces a sonner toast.
- Clicking a list card navigates to `/lists/<id>`, SSR-rendered with the list title and its items. If the list does not belong to the user (owner or accepted invitee), Supabase returns no rows under RLS and the page returns 404.
- The list-detail page shows an items list and an inline add-item form (title, optional price, optional store link). On submit the item appears optimistically; server failure rolls back + toasts.
- The full chain `dashboard → create list → list detail → add item → see item` works end-to-end in production against the real RLS-protected schema, with all interactions completing under 2 s (PRD NFR).
- `change.md` status flipped to `planned`; this plan is the contract for execution.

### Key Discoveries

- **Astro Actions are the right fit given the roadmap's `Supabase direct` mobile strategy** (PRD Open Question 3). The web does not need a portable HTTP API — F-01's RLS is the shared contract between web and future mobile. Actions give type-safety + minimal boilerplate without locking out mobile, because mobile bypasses the web layer entirely.
- **F-01 already enforces every authorization rule S-01 needs**. The Action handlers and SSR queries are thin: validate input, call Supabase, map errors. Any access mistake fails at the DB, not in app code — but app code must surface those failures correctly.
- **Identity-hiding invariant is inherited.** S-01 never queries `reservations` directly; the dashboard and list-detail use `item_reservation_status` for any status-display work (none yet in S-01, but the service interface should be ready).
- **`items.title` is the canonical column name** (F-01 chose `title` over `name`). UI labels still read "Name" to match PRD wording; the storage column is `title`. No rename.
- **`auth.users.email` case normalization** is already handled in F-01's invitation predicates; S-01 inherits this and must not re-implement.

## What We're NOT Doing

- No edit or delete of lists or items — those belong to S-02. RLS already permits owner updates/deletes; S-01 simply does not expose the UI.
- No invitation flow, no shared-list browsing for invitees beyond what already exists at the DB level (S-03/S-04).
- No reservation UI, no `item_reservation_status` rendering yet (S-05).
- No item images, no notes UI (F-01 has `items.notes` but S-01 leaves it unused — defer to a later slice).
- No tests / no test infrastructure. Verification is `npm run lint`, `astro check`, and manual UI walk-throughs per phase.
- No TanStack Query / SWR / cache layer. Optimistic updates are local React state only.
- No JSON `/api/**` endpoints for list/item CRUD. Mutations are Astro Actions; reads are SSR via `src/lib/supabase.ts`.
- No multi-currency UX beyond storing currency text. The dialog defaults to a single currency (see Implementation Approach) and surfaces no selector.
- No price calculation, totals, or aggregation.
- No realtime updates. Optimistic add covers the single-user-per-tab case; cross-tab sync waits.

## Implementation Approach

S-01 ships in **four phases**, each independently verifiable. Phase 1 closes the schema gap (`items.price_cents` + `items.currency`) and generates `src/db/database.types.ts`. Phase 2 lays the type-safe infrastructure (shadcn primitives, Astro Actions config, shared zod schemas, service-layer wrappers). Phase 3 is the dashboard surface (owned + shared sections, create-list dialog). Phase 4 is the list-detail surface (items list, add-item form, RLS-driven 404). Each phase ends with `astro check` + `npm run lint` + manual UI verification before commit.

**Currency convention.** Storage is `price_cents int` + `currency char(3)`. The UI uses a single default currency for MVP (locale-derived; if unset, `"USD"`). The Action accepts an optional `priceCents` integer and an optional `currency` string; if `priceCents` is provided without `currency`, the Action fills in the default. No selector UI in S-01.

**Service layer.** `src/lib/services/lists.ts` and `src/lib/services/items.ts` expose the small set of operations S-01 needs (`listOwnedAndShared`, `getListById`, `listItems`, `createList`, `createItem`). The Actions are 3-line wrappers around services; Astro SSR pages call services directly. This keeps RLS-aware Supabase queries in one place per entity and makes the future mobile-via-Supabase-direct path obvious (the mobile client implements the same queries against PostgREST).

## Critical Implementation Details

- **Optimistic add must roll back on Action failure.** The pattern: insert a placeholder row keyed by a client-side UUID, await the Action, then either replace the placeholder with the server row (success) or remove it + toast (failure). Toast copy must distinguish validation errors (inline, no toast) from server errors (toast). Without rollback, a denied insert leaves a phantom card on screen.
- **RLS-denied reads return zero rows, not an error.** `getListById` on a list the user doesn't own and isn't invited to returns `null`, not a 403. The list-detail page must treat `null` as 404 (`return new Response(null, { status: 404 })`); rendering an empty page would silently leak the URL surface.
- **Astro Actions return errors as `ActionError`, not exceptions.** Handler code must `throw new ActionError({ code, message })` for failures so the client receives a typed `error` field. Returning a plain object with an error key bypasses the typed-error channel and will appear as a successful action with garbage data.
- **`src/db/database.types.ts` is generated, not hand-edited.** Regenerate via `npx supabase gen types typescript --linked > src/db/database.types.ts` after any schema change. Phase 1 is the first generation; future migrations re-run this step.
- **The Toaster must be in the shared layout, not per-page.** Multiple `<Toaster />` instances stack and produce duplicate toasts. The single mount lives in `src/layouts/Layout.astro` (or whatever shared layout dashboard + list-detail both use).

## Phase 1: Schema delta + generated types

### Overview

Add the two missing columns to `items`, apply locally then to production, and regenerate `database.types.ts` so all downstream code is typed end-to-end before any UI work starts.

### Changes Required

#### 1. Migration: add price columns to `items`

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_items_add_price.sql` (use `date -u +%Y%m%d%H%M%S`)

**Intent**: Extend `items` with the two columns S-01 needs to capture estimated price without precision loss. Both nullable so existing rows (none in prod yet, but the convention matters) remain valid.

**Contract**:
- `alter table public.items add column price_cents integer null check (price_cents is null or price_cents >= 0);`
- `alter table public.items add column currency char(3) null check (currency is null or currency ~ '^[A-Z]{3}$');`
- No index — price is not a query predicate at MVP scale.
- No RLS changes — existing `items` policies already cover all CRUD with the right per-op constraints.

#### 2. Apply migration locally + remotely

**Intent**: Land the schema change in both environments before any app code references the new columns.

**Contract**: `npx supabase db reset` (local) applies the new migration alongside F-01's; `npx supabase db push --linked` applies to production. Verify via `npx supabase migration list --linked` that the new migration appears as applied.

#### 3. Generate database types

**File**: `src/db/database.types.ts` (new; create `src/db/` directory)

**Intent**: Capture the live schema as TypeScript so services and actions get end-to-end type safety from query to UI.

**Contract**: Run `npx supabase gen types typescript --linked > src/db/database.types.ts`. The generated file exports a `Database` type with `public.Tables.{lists,items,invitations,reservations}` row/insert/update shapes. Do not hand-edit.

#### 4. Re-type the Supabase server client

**File**: `src/lib/supabase.ts`

**Intent**: Make every call site aware of the generated schema so misnamed columns or wrong-type values fail at compile time.

**Contract**: Parameterize the `createServerClient` call with the generated `Database` type (`createServerClient<Database>(...)`). Existing call sites (middleware, auth pages) keep working — the change is additive at the type level.

### Success Criteria

#### Automated Verification

- Migration file naming matches `^[0-9]{14}_[a-z0-9_]+\.sql$`.
- `npx supabase db reset` exits 0 with both F-01 and the new migration applied.
- `npx supabase migration list --linked` shows the new migration as applied to production.
- `astro check` passes (types compile after `database.types.ts` lands).
- `npm run lint` passes.

#### Manual Verification

- `\d+ public.items` in local psql shows the two new columns with the right `CHECK` constraints.
- Inserting a row with `price_cents = -1` is rejected.
- Inserting a row with `currency = 'usd'` is rejected; `currency = 'USD'` is accepted.
- No regression in production auth (sign-in still works).

**Implementation Note**: After Phase 1, pause for manual confirmation that the production migration applied cleanly and auth still works before proceeding to UI infrastructure.

---

## Phase 2: Foundations — shadcn, Astro Actions, services, schemas

### Overview

Add every shadcn primitive S-01 needs, scaffold the Astro Actions runtime, define the shared zod schemas, and write the service-layer wrappers. No UI changes visible to the user yet — this is the chassis.

### Changes Required

#### 1. Add shadcn primitives

**Intent**: Bring in the components the dashboard and list-detail forms depend on. Use the CLI so we follow the project's "new-york" style and the components land in `src/components/ui/`.

**Contract**: Run, in order: `npx shadcn@latest add form input label dialog card skeleton sonner`. Each generates a file under `src/components/ui/`. Do not hand-roll equivalents. After this step, all primitives required by S-01 are present.

#### 2. Install runtime dependencies

**Intent**: react-hook-form + zod resolver are required by shadcn's `form` component for typed validation.

**Contract**: `npm install react-hook-form @hookform/resolvers zod`. zod is likely already pulled in by shadcn's form; confirm and skip the duplicate install if so.

#### 3. Shared zod schemas

**File**: `src/lib/schemas/wishlist.ts` (new; create `src/lib/schemas/` directory)

**Intent**: One source of truth for list and item input validation, consumed by both the Astro Actions (server) and react-hook-form (client). Avoids drift between client and server validation.

**Contract**:
- Export `listCreateSchema` — `{ title: z.string().trim().min(1).max(200) }`.
- Export `itemCreateSchema` — `{ listId: z.string().uuid(), title: z.string().trim().min(1).max(500), priceCents: z.number().int().nonnegative().optional(), currency: z.string().regex(/^[A-Z]{3}$/).optional(), link: z.string().url().max(2000).optional() }`.
- Export inferred TS types (`ListCreateInput`, `ItemCreateInput`) for service consumers.

#### 4. Service: lists

**File**: `src/lib/services/lists.ts` (new; create `src/lib/services/` directory)

**Intent**: Encapsulate every Supabase call related to lists in one module. Pages and Actions call these — they never touch the Supabase client directly.

**Contract**: Functions take a `SupabaseClient<Database>` as the first argument (so callers pass the SSR client from `context.locals` once it's added to `App.Locals`, or build it from `src/lib/supabase.ts`).
- `listOwnedAndShared(client)` — returns `{ owned: ListRow[]; shared: ListRow[] }`. Two queries: one for owner-side (where `owner_id = current user`), one for invitee-side (join `invitations` where `accepted_by_user_id = current user`). RLS does the filtering; the service just structures the result.
- `getListById(client, listId)` — returns `ListRow | null`. Returns `null` when RLS denies (Supabase returns zero rows; the service maps `data.length === 0` to `null`).
- `createList(client, input)` — accepts `ListCreateInput`, sets `owner_id = (await client.auth.getUser()).data.user.id`, inserts, returns the created `ListRow`. Throws on Supabase error.

#### 5. Service: items

**File**: `src/lib/services/items.ts`

**Intent**: Symmetric to the lists service for everything item-related.

**Contract**:
- `listItems(client, listId)` — returns `ItemRow[]`. RLS-gated; outsider call returns `[]`.
- `createItem(client, input)` — accepts `ItemCreateInput`; if `priceCents` is set but `currency` is not, defaults `currency` to `"USD"`. Inserts, returns the created `ItemRow`. Throws on Supabase error.

#### 6. Expose Supabase client via `context.locals`

**File**: `src/middleware.ts`

**Intent**: Build the SSR Supabase client once per request in middleware and stash it on `context.locals.supabase`. Pages and Actions read it from there instead of rebuilding the cookie-aware client themselves.

**Contract**: Add `context.locals.supabase = createServerClient<Database>(...)` early in the middleware chain; update `App.Locals` in `src/env.d.ts` to declare `supabase: SupabaseClient<Database>`. Existing auth gating logic stays unchanged.

#### 7. Astro Actions scaffold

**File**: `src/actions/index.ts` (new; create `src/actions/`)

**Intent**: Stand up the Astro Actions runtime with the two actions S-01 needs, each a thin wrapper around the service layer.

**Contract**:
- Export `server = { lists: { create: defineAction(...) }, items: { create: defineAction(...) } }`.
- `lists.create` — `input: listCreateSchema`; handler reads `context.locals.supabase`, calls `listsService.createList`, returns the new list row. On Supabase error, `throw new ActionError({ code: 'INTERNAL_SERVER_ERROR', message: 'Could not create list' })`. On unauthenticated session, `throw new ActionError({ code: 'UNAUTHORIZED' })`.
- `items.create` — same shape using `itemCreateSchema` + `itemsService.createItem`.
- See [Astro Actions docs](https://docs.astro.build/en/guides/actions/) for `defineAction` import path and middleware wiring.

#### 8. Mount Toaster in the shared layout

**File**: `src/layouts/Layout.astro` (or the existing shared layout — confirm path; create if absent)

**Intent**: Single `<Toaster />` instance so sonner toasts from any island work without duplicates.

**Contract**: Add `<Toaster client:load />` near the closing `</body>`. If no shared layout exists yet, create one that wraps the dashboard and list-detail pages so they inherit the toaster + any future global chrome.

### Success Criteria

#### Automated Verification

- `astro check` passes (all new files type-check against `Database` types).
- `npm run lint` passes.
- `ls src/components/ui/` shows the seven new primitives (`form.tsx`, `input.tsx`, `label.tsx`, `dialog.tsx`, `card.tsx`, `skeleton.tsx`, `sonner.tsx`).
- `ls src/actions/index.ts src/lib/services/lists.ts src/lib/services/items.ts src/lib/schemas/wishlist.ts` all return file paths.

#### Manual Verification

- Existing auth pages still render and sign-in/sign-up/sign-out still work (no regression from middleware changes).
- Importing `actions` in a temporary scratch React component compiles — verifies the Actions client surface is wired correctly.
- Reading `context.locals.supabase` in a temporary `dashboard.astro` log statement returns a working client (auth still flows through it).

**Implementation Note**: After Phase 2, pause for manual confirmation that the auth regression checks pass before building UI on top of the new chassis.

---

## Phase 3: Dashboard — owned + shared lists + create-list flow

### Overview

Replace the dashboard stub with the real lists home: SSR-fetched owned lists and a conditional "Shared with me" section, a hero empty state for first-time users, and a "Create list" dialog wired to `actions.lists.create` with optimistic insert.

### Changes Required

#### 1. Dashboard page

**File**: `src/pages/dashboard.astro`

**Intent**: Server-render the dashboard with the current user's owned and shared lists, then hand interactivity to the React island.

**Contract**: `export const prerender = false;`. In the frontmatter, call `listsService.listOwnedAndShared(Astro.locals.supabase)` to get `{ owned, shared }`. Pass both arrays as props to a single `<DashboardLists client:only="react" owned={owned} shared={shared} />` (note: `client:only="react"` rather than `client:load` — required to avoid an Astro SSR React-instance mismatch with react-hook-form/Radix UI inside the dialog; see Phase 3 impl-review F1). `userEmail` is rendered in a static Astro `<header>` block, not passed as a prop to the island (static content belongs in Astro). Render inside the shared layout so the Toaster is present.

#### 2. Dashboard React island

**File**: `src/components/dashboard/DashboardLists.tsx` (new; create `src/components/dashboard/`)

**Intent**: Render the two sections (My lists, Shared with me) and host the Create-list trigger. Manages optimistic state for newly created lists.

**Contract**: Props `{ owned: ListRow[]; shared: ListRow[]; userEmail: string }`. Local `useState` mirrors `owned` for optimistic inserts; `shared` is read-only in S-01. Renders:
- A heading "My lists" with a `Card` grid of owned lists, each linking to `/lists/<id>`. If `owned` is empty, render a hero empty state (centered, large, with "Create your first list" CTA).
- A heading "Shared with me" with a `Card` grid, **rendered only if `shared.length > 0`**.
- A "Create list" button (top-right of "My lists" header when non-empty; inside the hero when empty) opens `<CreateListDialog />`.
- Each `Card` shows list title; item count is deferred (no aggregate query in S-01).

#### 3. Create-list dialog

**File**: `src/components/dashboard/CreateListDialog.tsx`

**Intent**: Modal form for creating a list, validated client-side via react-hook-form + `listCreateSchema`, submitted via `actions.lists.create`, with optimistic insert into the dashboard's owned-lists state.

**Contract**: Uses shadcn `Dialog`, `Form`, `Input`, `Label`. `useForm` with `zodResolver(listCreateSchema)`. On submit:
1. Generate a placeholder list with a client UUID; call the parent's `onOptimisticAdd(placeholder)`.
2. `const { data, error } = await actions.lists.create({ title })`.
3. On success: call `onOptimisticReplace(placeholder.id, data)`; close dialog; sonner success toast ("List created").
4. On `error`: call `onOptimisticRemove(placeholder.id)`; keep the dialog open; sonner error toast with `error.message` (validation errors are surfaced inline by react-hook-form before submit, so any toast error is a server failure).
5. Reset the form on dialog close.

### Success Criteria

#### Automated Verification

- `astro check` passes.
- `npm run lint` passes.
- `npm run build` succeeds (catches Cloudflare-runtime incompatibilities).

#### Manual Verification

- Sign in as a fresh user → `/dashboard` shows the hero empty state with "Create your first list".
- Click "Create your first list" → dialog opens.
- Submit with empty title → inline validation error, no network call.
- Submit with a valid title → dialog closes, the new list appears in "My lists" within ~200 ms (optimistic), success toast appears.
- Simulate a server error (temporarily throw in `lists.create` handler) → list disappears from the dashboard, error toast appears, dialog stays open.
- Sign out, sign in as a user with no shared invitations → "Shared with me" section is **not** rendered (no empty heading).
- Manually seed an `invitations` row with `accepted_by_user_id` matching a second user, sign in as that user → "Shared with me" section appears with the seeded list.

**Implementation Note**: After Phase 3, pause for manual confirmation that the dashboard works end-to-end in production before building list-detail on top.

---

## Phase 4: List detail — view items + add-item flow

### Overview

Add the `/lists/[id]` route, SSR-fetch the list and its items, render an items list, and provide an inline add-item form wired to `actions.items.create` with optimistic insert.

### Changes Required

#### 1. Gate the new route

**File**: `src/middleware.ts`

**Intent**: Add `/lists` to the protected route prefix so unauthenticated requests are redirected before the page renders.

**Contract**: Update `PROTECTED_ROUTES` to `["/dashboard", "/lists"]`. Verify the existing prefix-matching logic treats `/lists/<uuid>` as protected.

#### 2. List detail page

**File**: `src/pages/lists/[id].astro` (new; create `src/pages/lists/`)

**Intent**: SSR-render the list title and items; treat RLS-denied access as 404; hand interactivity to the React island.

**Contract**: `export const prerender = false;`. In the frontmatter:
1. Read `Astro.params.id`; validate as UUID (if not, return `new Response(null, { status: 404 })`).
2. Call `listsService.getListById(Astro.locals.supabase, id)`. If `null`, return 404.
3. Call `itemsService.listItems(Astro.locals.supabase, id)`.
4. Render `<ListDetail client:load list={list} initialItems={items} />` inside the shared layout.

#### 3. List detail React island

**File**: `src/components/lists/ListDetail.tsx` (new; create `src/components/lists/`)

**Intent**: Compose the list header, items list, and add-item form. Owns the optimistic items state.

**Contract**: Props `{ list: ListRow; initialItems: ItemRow[] }`. Local `useState<ItemRow[]>(initialItems)`. Renders the list title, a back link to `/dashboard`, `<ItemsList items={items} />`, and `<AddItemForm listId={list.id} onAdd={...} />`. `onAdd` updates the local state with the new item.

#### 4. Items list component

**File**: `src/components/lists/ItemsList.tsx`

**Intent**: Render the items in a simple stack. Empty state is a muted prompt above the form, not a hero.

**Contract**: Props `{ items: ItemRow[] }`. Each item renders title, formatted price (if present, e.g., `$49.99` derived from `price_cents` + `currency`), and the store link as a `<a>` (target=`_blank`, `rel="noopener noreferrer"`). When `items.length === 0`, render `<p class="text-muted-foreground">No items yet. Add your first below.</p>`.

#### 5. Add-item form component

**File**: `src/components/lists/AddItemForm.tsx`

**Intent**: Inline form for adding items, validated via react-hook-form + `itemCreateSchema`, submitted via `actions.items.create`, optimistic insert with rollback on error.

**Contract**: Props `{ listId: string; onAdd: (item: ItemRow) => void; onOptimisticAdd: (placeholder: ItemRow) => void; onOptimisticReplace: (id: string, item: ItemRow) => void; onOptimisticRemove: (id: string) => void; }`. Fields: required `title`, optional `priceInput` (text "49.99" → cents conversion at submit), optional `link`. On submit: optimistic insert → `actions.items.create` → success: replace placeholder + reset form + success toast; failure: remove placeholder + error toast + keep form populated.

### Success Criteria

#### Automated Verification

- `astro check` passes.
- `npm run lint` passes.
- `npm run build` succeeds.
- `curl -I https://as-you-wish.as-you-wish.workers.dev/lists/00000000-0000-0000-0000-000000000000` returns 302 (redirect to sign-in) when signed-out, confirming the middleware gate.

#### Manual Verification

- Sign in, navigate to `/dashboard`, click an owned list → `/lists/<id>` loads with the list title and an empty items message.
- Add an item with title only → appears immediately, success toast.
- Add an item with title + `49.99` + a valid URL → appears with formatted price and clickable link.
- Submit with empty title → inline error, no network call.
- Submit with malformed URL → inline error.
- Manually paste another user's list UUID into the URL → page returns 404.
- Sign in as a second user who has accepted an invitation to the first user's list → `/lists/<id>` for that list renders with items.
- Sign out, hit `/lists/<id>` → redirected to sign-in.
- Simulate a server error → optimistic item disappears, error toast appears, form retains the entered values.

**Implementation Note**: After Phase 4, S-01 is done. Flip `change.md` status to `implemented`, update the roadmap At-a-glance row for S-01, and mark the slice ready for `/10x-impl-review`.

---

## Testing Strategy

### Unit Tests

None — S-01 introduces no test infrastructure. Type safety (`astro check`) plus zod runtime validation plus RLS enforcement carry the correctness load.

### Integration Tests

None automated. The manual verification steps per phase are the integration test.

### Manual Testing Steps

1. **First-run flow**: Fresh signup → `/dashboard` empty state → create list → add three items → reload page → all data persists.
2. **Sharing read path**: Seed an invitation for a second test user (insert directly via Supabase Studio with `accepted_by_user_id = <user2>`). Sign in as user 2 → "Shared with me" section appears with the list → click through → items are visible, no add-item form authorization issue (form will fail on submit because RLS denies non-owner inserts; this is expected and out of scope until S-02/S-03 design how non-owners interact).
3. **RLS-denied access**: As user 2, manually navigate to `/lists/<list-not-shared>` → 404.
4. **Optimistic rollback**: Temporarily make `items.create` throw → confirm optimistic item disappears + toast.
5. **Validation**: Submit empty title, malformed URL, negative price → all rejected inline before network.

## Performance Considerations

PRD NFR: under 2 s perceived latency per interaction. SSR + optimistic update easily meets this. The dashboard does two Supabase queries (owned + shared); both are indexed (`lists.owner_id` is the PK lookup pattern; invitations join uses `invitations(accepted_by_user_id)` which is small at MVP scale). No additional indexes needed.

The Cloudflare Workers runtime constrains cold-start adapter weight; sticking to the existing `@astrojs/cloudflare` chain plus the small services keeps the bundle slim.

## Migration Notes

- The Phase 1 migration is **additive and nullable** — production rollback is safe (drop the columns, no data loss because no rows in production yet). For any future rollback, follow AGENTS.md guidance: the prior Worker must remain compatible with the new schema, which it is (the old Worker never read the new columns).
- After Phase 1 lands, every future migration must regenerate `src/db/database.types.ts` as part of its plan.

## References

- Roadmap: `context/foundation/roadmap.md` — S-01 row + Stream A
- PRD: `context/foundation/prd.md` — FR-001..FR-009, NFRs, Access Control
- F-01 plan: `context/changes/wishlist-data-schema/plan.md` — schema + RLS contract S-01 builds on
- F-01 brief: `context/changes/wishlist-data-schema/plan-brief.md` — key decisions S-01 inherits
- Auth wiring: `src/middleware.ts`, `src/lib/supabase.ts`
- Existing component conventions: `src/components/auth/*`, `src/components/ui/button.tsx`
- AGENTS.md: API conventions, shadcn rules, migration naming, Cloudflare runtime constraints

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema delta + generated types

#### Automated

- [x] 1.1 Migration file naming matches `^[0-9]{14}_[a-z0-9_]+\.sql$` — ee94b15
- [x] 1.2 `npx supabase db reset` exits 0 with both migrations applied — ee94b15
- [x] 1.3 `npx supabase migration list --linked` shows new migration applied to production — ee94b15
- [x] 1.4 `astro check` passes — ee94b15
- [x] 1.5 `npm run lint` passes — ee94b15

#### Manual

- [x] 1.6 `\d+ public.items` shows the two new columns with correct CHECK constraints — ee94b15
- [x] 1.7 Negative `price_cents` insert rejected — ee94b15
- [x] 1.8 Lowercase `currency` insert rejected; uppercase accepted — ee94b15
- [x] 1.9 Production sign-in still works (no auth regression) — ee94b15

### Phase 2: Foundations — shadcn, Astro Actions, services, schemas

#### Automated

- [x] 2.1 `astro check` passes — b760add
- [x] 2.2 `npm run lint` passes — b760add
- [x] 2.3 All seven shadcn primitives present under `src/components/ui/` — b760add
- [x] 2.4 `src/actions/index.ts`, `src/lib/services/lists.ts`, `src/lib/services/items.ts`, `src/lib/schemas/wishlist.ts` all exist — b760add

#### Manual

- [x] 2.5 Existing auth pages still render and sign-in/sign-up/sign-out work — b760add
- [x] 2.6 Scratch React component importing `actions` compiles — deferred; covered implicitly by Phase 3 dashboard form — b760add
- [x] 2.7 `context.locals.supabase` works end-to-end in a scratch page — deferred; covered implicitly by Phase 3/4 — b760add

### Phase 3: Dashboard — owned + shared lists + create-list flow

#### Automated

- [x] 3.1 `astro check` passes — e7fd0fe
- [x] 3.2 `npm run lint` passes — e7fd0fe
- [x] 3.3 `npm run build` succeeds — e7fd0fe

#### Manual

- [x] 3.4 Fresh user `/dashboard` shows hero empty state with CTA — e7fd0fe
- [x] 3.5 Empty title submission shows inline validation error, no network call — e7fd0fe
- [x] 3.6 Valid submission inserts optimistically and shows success toast — e7fd0fe
- [x] 3.7 Simulated server error rolls back optimistic insert and shows error toast — e7fd0fe
- [x] 3.8 No-invitations user does not see a "Shared with me" section — e7fd0fe
- [x] 3.9 User with an accepted invitation sees the shared list under "Shared with me" — e7fd0fe

### Phase 4: List detail — view items + add-item flow

#### Automated

- [x] 4.1 `astro check` passes
- [x] 4.2 `npm run lint` passes
- [x] 4.3 `npm run build` succeeds
- [x] 4.4 Signed-out `curl -I` on `/lists/<uuid>` returns redirect to sign-in

#### Manual

- [x] 4.5 Clicking an owned list card opens `/lists/<id>` with title + items
- [x] 4.6 Add item with title only → appears immediately + success toast
- [x] 4.7 Add item with title + price + URL → renders formatted price and link
- [x] 4.8 Empty title / malformed URL / negative price all rejected inline
- [x] 4.9 Unauthorized list UUID returns 404
- [x] 4.10 Second user with accepted invitation can view the shared list's items
- [x] 4.11 Signed-out access to `/lists/<id>` redirects to sign-in
- [ ] 4.12 Simulated server error rolls back optimistic insert and shows error toast
