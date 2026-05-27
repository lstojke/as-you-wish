---
project: AsYouWish
version: 1
status: draft
created: 2026-05-27
updated: 2026-05-27
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: AsYouWish

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

A private family gift coordinator is flooded with "what should I buy for X?" messages, has to invent non-duplicate ideas, and repeats their own wishes to every relative one-by-one. Existing tools (Amazon wishlists, store registries) expose lists but give no shared visibility into who is buying what — so duplicates still happen. AsYouWish solves this for a small trusted circle: shared lists with exclusive item claims that hide the reserver's identity from the list owner.

## North star

**S-01: Owner creates a list and adds items** — the smallest end-to-end flow whose successful delivery would prove the core product hypothesis: that the family coordinator will actually build a list in this app rather than keep using their existing channel.

> "North star" here means the smallest end-to-end slice whose successful delivery would prove the core product hypothesis — placed as early as Prerequisites allow because everything else only matters if this works.

## At a glance

| ID    | Change ID                  | Outcome (user can …)                                                | Prerequisites | PRD refs                                          | Status   |
| ----- | -------------------------- | ------------------------------------------------------------------- | ------------- | ------------------------------------------------- | -------- |
| F-01  | wishlist-data-schema       | (foundation) lists / items / invitations / reservations tables + RLS landed | —             | FR-005, FR-008, FR-009, FR-013, Access Control, Business Logic | ready    |
| S-01  | create-list-with-items     | Sign in, create a wish list, add items (name, est. price, store link) | F-01          | FR-001, FR-002, FR-003, FR-004, FR-005, FR-009    | proposed |
| S-02  | manage-own-lists-and-items | Edit and delete one's own lists and items                            | S-01          | FR-006, FR-007, FR-010, FR-011                    | proposed |
| S-03  | share-list-by-email-invite | Invite a specific person to a list via email                         | S-01          | FR-008                                            | proposed |
| S-04  | view-shared-list           | View items on a shared list with available / reserved status        | S-03          | FR-012                                            | proposed |
| S-05  | reserve-item-exclusively   | Reserve an available item on a shared list — exclusive, identity hidden from owner | S-04          | US-01, FR-013                                     | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                | Chain                                  | Note                                                                                  |
| ------ | -------------------- | -------------------------------------- | ------------------------------------------------------------------------------------- |
| A      | Own-data lifecycle   | `F-01` → `S-01` → `S-02`               | Owner creates and curates their own list — the north star anchors this stream.        |
| B      | Sharing & claim loop | `S-03` → `S-04` → `S-05`               | Joins Stream A at `S-01`; this is the must-have chain that lands the reservation rule.|

## Baseline

What's already in place in the codebase as of `2026-05-27` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 + React 19 islands, Tailwind 4, shadcn/ui ("new-york") under `src/components/ui/`.
- **Backend / API:** present — Astro SSR endpoints; auth routes live at `src/pages/api/auth/{signin,signup,signout}.ts`.
- **Data:** partial — Supabase Postgres available via `@supabase/ssr`; `supabase/migrations/` is scaffolded but no app tables exist yet.
- **Auth:** present — `@supabase/ssr` server client in `src/lib/supabase.ts`, route gating in `src/middleware.ts`, signup/signin/signout endpoints + `auth/*.astro` pages cover FR-001 through FR-003.
- **Deploy / infra:** present — Cloudflare Workers via `@astrojs/cloudflare`; `wrangler.jsonc` has named `preview` + `production` envs; Workers Builds auto-deploys `master` to `https://as-you-wish.as-you-wish.workers.dev/`.
- **Observability:** partial — `observability.enabled: true` in `wrangler.jsonc` gives Cloudflare Workers logs; no error tracking or product analytics. No PRD NFR requires more for MVP.

## Foundations

### F-01: Wishlist data schema

- **Outcome:** (foundation) Postgres tables for lists, items, invitations, and reservations are landed via `supabase/migrations/`, with RLS policies that enforce the PRD's Access Control rules (owner-writes-own, invitee-reads-shared, exclusive single-claim per item, reserver identity hidden from owner).
- **Change ID:** wishlist-data-schema
- **PRD refs:** FR-005, FR-008, FR-009, FR-013, Access Control, Business Logic
- **Unlocks:** S-01 (create list + items), S-02 (edit/delete), S-03 (invitations table), S-04 (read shared via RLS), S-05 (reservation exclusivity via DB constraint)
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sequenced first because every must-have slice consumes this schema; landing it in one cohesive migration lets RLS policies be designed against the full entity graph rather than retrofitted. A piecemeal schema would force re-migrations as later slices reveal cross-table policy needs.
- **Status:** ready

## Slices

### S-01: Owner creates a list and adds items

- **Outcome:** A signed-in user can create a named wish list, add items to it (name, estimated price, store link), and see the list on their home screen alongside any lists shared with them.
- **Change ID:** create-list-with-items
- **PRD refs:** FR-001, FR-002, FR-003, FR-004, FR-005, FR-009
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This is the chosen north star — the user's read is that "will the coordinator build a list at all" is the bigger open question, ahead of the concurrency rule. Sequenced immediately after F-01 to keep the validation cycle short. Auth FRs (FR-001/002/003) are already satisfied by baseline; they appear in PRD refs because the create flow consumes them.
- **Status:** proposed

### S-03: Owner shares a list by email invitation

- **Outcome:** A list owner can send an email invitation to a specific person; the invitee receives a message and, after signing up (or in), the list appears on their home screen.
- **Change ID:** share-list-by-email-invite
- **PRD refs:** FR-008
- **Prerequisites:** S-01
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:**
  - Email delivery transport (Supabase Auth emails vs. dedicated provider). Owner: user. Block: no.
- **Risk:** Sequenced ahead of S-02 because the speed-biased must-have path to the reservation flow runs S-01 → S-03 → S-04 → S-05; S-02 is hygiene that can land any time after S-01. Spam/inbox-reliability is a known PRD concession (FR-008 Socratic note); not blocking for MVP.
- **Status:** proposed

### S-04: Invitee views a shared list with item statuses

- **Outcome:** A signed-in user invited to a list can open it and see every item with its current status (available or reserved), without seeing who reserved which item.
- **Change ID:** view-shared-list
- **PRD refs:** FR-012
- **Prerequisites:** S-03
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Straightforward read-side slice once F-01 RLS policies are correct; the work here is mostly UI and a query. Risk concentrated in the RLS policy design, which lands in F-01.
- **Status:** proposed

### S-05: Gift-giver reserves an item on a shared list

- **Outcome:** A signed-in viewer of a shared list can reserve any item with status "available"; the claim is exclusive (two simultaneous reserves resolve to one), the list owner sees only an aggregate change, and the reserver can see that they hold the claim.
- **Change ID:** reserve-item-exclusively
- **PRD refs:** US-01, FR-013
- **Prerequisites:** S-04
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:**
  - How does an active reservation interact with the owner editing or deleting that item (PRD Open Question 1)? Owner: user. Block: no.
- **Risk:** This is the load-bearing concurrency rule (FR-013); a missed DB constraint here means the headline value prop silently fails. Risk is mitigated by enforcing exclusivity at the DB layer in F-01 (unique partial index on reservations), not in app code.
- **Status:** proposed

### S-02: Owner edits and deletes lists and items

- **Outcome:** A list owner can rename and delete lists they own, and edit and delete items on those lists, each behind a confirmation prompt for destructive actions.
- **Change ID:** manage-own-lists-and-items
- **PRD refs:** FR-006, FR-007, FR-010, FR-011
- **Prerequisites:** S-01
- **Parallel with:** S-03, S-04, S-05
- **Blockers:** —
- **Unknowns:**
  - How does edit/delete behave when the item already has an active reservation (PRD Open Question 1)? Owner: user. Block: no.
- **Risk:** Sequenced last on the must-have path because the speed bias prefers reaching the reservation flow first; this slice is curation hygiene and is parallel-friendly with every slice in Stream B.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                  | Suggested issue title                                       | Ready for `/10x-plan` | Notes                                                  |
| ---------- | -------------------------- | ----------------------------------------------------------- | --------------------- | ------------------------------------------------------ |
| F-01       | wishlist-data-schema       | Land core wishlist schema (lists, items, invitations, reservations) + RLS | yes                   | Run `/10x-plan wishlist-data-schema`                   |
| S-01       | create-list-with-items     | Owner creates a wishlist and adds items                     | no                    | Depends on F-01                                        |
| S-02       | manage-own-lists-and-items | Owner edits and deletes own lists and items                 | no                    | Depends on S-01                                        |
| S-03       | share-list-by-email-invite | Owner shares a list by email invitation                     | no                    | Depends on S-01                                        |
| S-04       | view-shared-list           | Invitee views a shared list with item statuses              | no                    | Depends on S-03                                        |
| S-05       | reserve-item-exclusively   | Gift-giver reserves an item with exclusive single-claim     | no                    | Depends on S-04; load-bearing concurrency rule         |

## Open Roadmap Questions

1. **How should an active reservation behave when the list owner edits or deletes the item?** Owner: user. Block: `S-02`, `S-05` (Block: no — MVP can ship with confirmation dialog and no special enforcement; surface exact behavior before either slice closes).

## Parked

- **Photo upload on items** — Why parked: PRD §Non-Goals; deferred to v2 (see PRD Open Question 2).
- **Group contributions on a single item** — Why parked: PRD §Non-Goals.
- **Price tracking / purchase integration with stores** — Why parked: PRD §Non-Goals; buying happens outside the app.
- **Public registry surface** — Why parked: PRD §Non-Goals; product targets a private family circle.
- **FR-014: List owner sees aggregate count of available vs reserved items** — Why parked: nice-to-have; deferred to keep the must-have path short under `main_goal: speed`.
- **FR-015: User cancels their own reservation** — Why parked: nice-to-have; user has flagged it as more valuable than FR-014, but still not on the MVP path.
- **FR-016: AI-generated gift idea suggestions** — Why parked: nice-to-have; pulls in a new Edge Function + LLM dependency that the 3-week budget can't absorb without dropping a must-have.

## Done

(Empty on first generation. `/10x-archive` appends an entry here — and flips that item's `Status` to `done` — when a change whose `Change ID` matches the item is archived. Do NOT pre-populate.)
