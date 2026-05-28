# Create List With Items — Plan Brief

> Full plan: `context/changes/create-list-with-items/plan.md`

## What & Why

S-01 puts the first product UI on top of F-01's schema: a signed-in user can create a wish list, add items, and see their owned lists plus lists shared with them on `/dashboard`. This is the chosen north star — the smallest slice that proves the family coordinator will actually build a list in this app instead of staying in their existing channel.

## Starting Point

F-01 landed the full data foundation in production (commits `4f6153b` → `93809dd`): `lists`, `items`, `invitations`, `reservations`, the `item_reservation_status` view, and the RLS-recursion-safe `SECURITY DEFINER` helpers. No data-layer code exists yet — no `database.types.ts`, no services, no actions. shadcn/ui is seeded with `button.tsx` only. `dashboard.astro` is a stub greeting the user.

## Desired End State

Signed-in users land on `/dashboard` and see two sections — **My lists** (owned, with a hero empty state on first visit) and **Shared with me** (rendered only when an accepted invitation exists). A "Create list" dialog opens from the dashboard, optimistically inserts on submit, and rolls back with a toast on server error. Clicking a list card navigates to `/lists/<id>`, SSR-rendered with the list title and its items; RLS-denied access returns 404. An inline add-item form on that page captures title, optional price, and optional store link with the same optimistic flow.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Estimated-price storage | New migration adding `items.price_cents int` + `items.currency char(3)`, both nullable | Matches PRD FR-009 + roadmap wording; integer cents avoids float drift | Plan |
| Mutation pattern | Astro Actions (typed, zod-validated) | Mobile is `Supabase direct` (PRD Q3), so web doesn't need a portable HTTP API; minimal boilerplate for someone new to React | Plan |
| Lists-home surface | `/dashboard` (replace the existing stub) | Matches existing `PROTECTED_ROUTES`; clean separation of marketing vs app surface | Plan |
| List-detail surface | New `/lists/[id]` route | Deep-linkable for future invitation flow; clean URLs; SSR-friendly | Plan |
| S-01 vs S-02 scope | Create-only — no edit, no delete in S-01 | Smallest slice; matches roadmap's PRD-ref list exactly; maximum speed to feedback | Plan |
| Form validation/error UX | react-hook-form + zod (shared schema) + shadcn `form` + sonner toasts | Zero schema duplication; standard shadcn pattern; best DX | Plan |
| Owned vs shared on dashboard | Two labeled sections; "Shared with me" rendered conditionally on non-empty | FR-004 satisfied literally; section appears naturally when S-03 produces rows; no second pass on the dashboard | Plan |
| Empty/error/loading UX | Hero empty state for first-time dashboard; sonner toasts for server errors; skeleton on initial nav; optimistic add with rollback | Polished onboarding; meets PRD NFR <2 s perceived latency | Plan |
| Service-layer placement | `src/lib/services/{lists,items}.ts` consumed by both SSR pages and Astro Actions | Single home for RLS-aware Supabase calls; mobile-direct rebuild path is obvious | Plan |
| Supabase client surface | Build once in middleware, expose via `context.locals.supabase` | Avoids rebuilding cookie-aware client per page; pages and actions share it | Plan |
| Currency UX in MVP | Default to `"USD"` when `price_cents` set without `currency`; no UI selector | Simplest acceptable storage shape; selector is a v2 polish item | Plan |
| Test infrastructure | None introduced in S-01 | Manual + `astro check` + RLS + zod carry the correctness load at MVP scale | Plan |

## Scope

**In scope:**
- One migration adding `items.price_cents` + `items.currency` (nullable, CHECK-constrained)
- Generated `src/db/database.types.ts` from the live schema
- Seven shadcn primitives (`form`, `input`, `label`, `dialog`, `card`, `skeleton`, `sonner`)
- Astro Actions runtime (`src/actions/index.ts`) with `lists.create` and `items.create`
- Shared zod schemas (`src/lib/schemas/wishlist.ts`)
- Service layer (`src/lib/services/{lists,items}.ts`)
- Supabase client on `context.locals.supabase` via middleware
- Toaster mounted in the shared layout
- `/dashboard` replaced with the lists home (owned + conditional shared section, hero empty state, create-list dialog)
- New `/lists/[id]` route with items list + add-item form
- `/lists` added to `PROTECTED_ROUTES`

**Out of scope:**
- Edit / delete of lists or items (S-02)
- Invitations UI / shared-list browsing UI for invitees (S-03/S-04)
- Reservations UI / `item_reservation_status` rendering (S-05)
- Item images, notes UI
- JSON `/api/**` endpoints for list/item CRUD
- TanStack Query / SWR / cache layer
- Realtime updates
- Test infrastructure (vitest, playwright)
- Multi-currency selector
- Item aggregate counts on dashboard cards

## Architecture / Approach

```
src/middleware.ts
  ├── context.locals.user            (existing)
  └── context.locals.supabase        (new — typed SSR client)
       │
       ▼
src/lib/services/{lists,items}.ts    (only place that calls Supabase)
       ▲                  ▲
       │                  │
src/pages/dashboard.astro  src/actions/index.ts
src/pages/lists/[id].astro    (lists.create, items.create)
       │                  ▲
       │                  │
React islands (DashboardLists, CreateListDialog, ListDetail, AddItemForm)
  + shadcn ui + react-hook-form + zod (shared schemas)
```

Pages SSR with the service layer for reads; React islands call Astro Actions for writes; Actions also call the service layer. F-01's RLS is the single authorization surface — no app-layer access checks.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema delta + generated types | `items.price_cents` + `items.currency` applied locally and to prod; `database.types.ts` generated; Supabase client re-typed | Production migration must not regress auth |
| 2. Foundations — shadcn, Actions, services, schemas | All UI primitives, the Actions runtime, the service layer, shared zod schemas, Toaster mounted | Wiring `context.locals.supabase` in middleware without breaking existing auth |
| 3. Dashboard — owned + shared + create-list | `/dashboard` shows real lists, hero empty state, optimistic create-list dialog | Optimistic rollback must run cleanly on server errors |
| 4. List detail — view items + add-item | `/lists/[id]` SSR-renders the list and items; optimistic add-item form | RLS-denied access must surface as 404, not an empty page |

**Prerequisites:** F-01 applied in production (done); Supabase CLI installed + linked; Docker for local stack.

**Estimated effort:** ~3–4 evening sessions across the four phases.

## Open Risks & Assumptions

- **Astro Actions runtime under Cloudflare Workers.** The Action handlers will execute in workerd. Risk: a subtle dependency in the Actions wiring assumes Node. Mitigation: Phase 2's `npm run build` (which uses the Cloudflare adapter) is the canary; any incompatibility surfaces there before UI work in Phase 3.
- **`context.locals.supabase` middleware change risks the existing auth flow.** Mitigated by leaving the existing `getUser()` call exactly as it is and only adding the client to `locals` alongside. Manual auth regression check is in Phase 2 verification.
- **Optimistic rollback must not leak placeholder rows across navigations.** All optimistic state is local React state; no global cache. Mitigated by component structure (state lives on `<DashboardLists>` and `<ListDetail>`, which unmount on navigation).
- **A second user testing the "Shared with me" flow requires a manual SQL seed** (an `invitations` row with `accepted_by_user_id` filled). Acceptable for S-01 verification; the real invitation UX is S-03.

## Success Criteria (Summary)

- A signed-in user with no lists sees a polished empty `/dashboard` and can create their first list in two clicks (open dialog → submit).
- A signed-in user with at least one list and one accepted invitation sees both sections populated on `/dashboard` and can navigate into either kind of list.
- A signed-in user can add items to a list they own; an unauthorized user hitting the same URL gets a 404.
