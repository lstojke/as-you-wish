---
project: AsYouWish
version: 1
status: draft
created: 2026-05-19
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

## Vision & Problem Statement

Around a gift occasion, family gift coordinators are flooded with "what should I buy for X?" messages from relatives — forcing them to invent multiple non-duplicate gift ideas for the same person, sometimes buying the gift themselves on behalf of a relative, and simultaneously repeating their own wish list to every family member individually.

The insight: existing tools (Amazon wishlists, store-specific registries, wedding portals) are locked to a single retailer or a single occasion type. They expose a list of items but provide no shared visibility into who is buying what — so duplicates still happen, and the coordinator's question-fielding burden is unchanged.

## User & Persona

**Primary persona:** The family gift coordinator — a person embedded in a close family circle who both manages gift ideas for others (fielding questions, preventing duplicates) and maintains their own wish list that multiple relatives need access to. This is not a public-registry user; the circle is small and trusted.

## Success Criteria

### Primary
- A logged-in gift-giver can open a shared wish list, see which items are still available, and reserve one — without asking the coordinator. The reservation is exclusive: only one person can hold a claim on any item.

### Secondary
- The list owner can see how many items on their list are still available vs already claimed (aggregate count only — not who claimed what, to preserve gift surprise).

### Guardrails
- No duplicate reservations: two simultaneous Reserve taps must result in exactly one successful claim.
- List owner cannot see the identity of who reserved their own items — gift surprise must be preserved.

## User Stories

### US-01: Gift-giver reserves an item

- **Given** a logged-in user viewing a wish list shared with them
- **When** they tap Reserve on an item with status "available"
- **Then** the item status changes to "reserved", it is no longer claimable by anyone else, and the list owner's aggregate available count decreases by one — but the list owner does not see who made the reservation

#### Acceptance Criteria
- Two simultaneous Reserve taps on the same item result in exactly one successful claim
- The reserver can see that they hold the claim on that item
- The list owner sees only the count change, not the reserver's identity

## Functional Requirements

### Authentication
- FR-001: User can sign up with email and password. Priority: must-have
  > Socrates: Counter-argument considered: "auth friction excludes less tech-savvy relatives." Resolution: kept — accounts are necessary to enforce exclusive claims and hide reserver identity. Auth friction is a UX polish concern, not a reason to skip accounts.
- FR-002: User can log in with email and password. Priority: must-have
- FR-003: User can log out. Priority: must-have

### Wish Lists
- FR-004: User can see their own wish lists and lists shared with them on a single home screen. Priority: must-have
  > Socrates: Counter-argument considered: "mixing own and shared lists on one screen is a UX anti-pattern." Resolution: kept for MVP — at family-circle scale (a handful of lists) a single screen is sufficient. Two-tab separation is a v2 polish item.
- FR-005: User can create a wish list with a name. Priority: must-have
  > Socrates: Covered under FR-007 delete challenge — no independent challenge for create.
- FR-006: User can edit a wish list (name, items). Priority: must-have
  > Socrates: No counter-argument raised; standard capability.
- FR-007: User can delete a wish list. Priority: must-have
  > Socrates: Counter-argument considered: "accidental deletion has no undo." Resolution: kept — a confirmation dialog is a must before delete executes. No list recovery mechanism needed for MVP.
- FR-008: User can share a wish list by sending email invitations to specific people. Priority: must-have
  > Socrates: Counter-argument considered: "email invite delivery is unreliable (spam, ignored)." Resolution: kept — email is the simplest private-circle invite mechanism. Delivery reliability is a v2 concern (retry, in-app notification).

### Items
- FR-009: User can add an item to their own wish list (name, estimated price, store link). Priority: must-have
  > Socrates: Counter-argument considered: "photo upload is the most expensive piece — a link is enough for MVP." Resolution: REVISED — photo field dropped from MVP. FR-009 covers name, estimated price, and store link only. Photo upload is explicitly deferred to v2.
- FR-010: User can edit an item on their own wish list. Priority: must-have
  > Socrates: Counter-argument considered: "editing a reserved item invalidates the reserver's intent silently." Resolution: kept — no system enforcement added for MVP (family-circle trust is assumed), but item edit while reserved is flagged as an Open Question for UX handling.
- FR-011: User can delete an item from their own wish list. Priority: must-have
  > Socrates: Counter-argument considered: "deleting a reserved item drops an active claim with no warning." Resolution: kept — confirmation dialog required; acknowledged risk in a family circle is low.

### Claiming
- FR-012: User can view items on a shared list with status (available / reserved). Priority: must-have
  > Socrates: Counter-argument considered: "reserved status lets a curious owner infer who reserved from timing clues." Resolution: kept — this is an inherent limitation of a private circle, not a solvable app problem. The value of preventing duplicates outweighs the residual timing-inference risk.
- FR-013: User can reserve an available item on a shared list (exclusive — one claim per item; list owner cannot see who reserved). Priority: must-have
  > Socrates: Counter-argument considered: "a stale reservation with no expiry blocks an item permanently." Resolution: kept — in a private family circle, going AWOL is low-risk. Stale-reservation handling deferred to v2 (FR-015 nice-to-have).
- FR-014: List owner can see aggregate count of available vs reserved items on their list (not who reserved). Priority: nice-to-have
  > Socrates: Counter-argument considered: "aggregate count in a tiny list risks leaking identity by timing." Resolution: kept as nice-to-have; implementation note: show count only, never timing.
- FR-015: User can cancel their own reservation on an item. Priority: nice-to-have
  > Socrates: User notes FR-015 matters more than FR-014 — plans change and permanently blocked items are a real problem. Kept as nice-to-have but elevated in priority relative to FR-014.

### AI Gift Ideas
- FR-016: User can request AI-generated gift idea suggestions for a wish list recipient (name, optional age/interests as context). The app returns a short list of suggestions the user can add directly to the wish list. Priority: nice-to-have
  > Note: Implemented via a Supabase Edge Function calling an LLM API. Rate-limited to prevent runaway API costs (max N requests per user per day — exact limit TBD at implementation). Suggestions are not saved automatically; user explicitly chooses which to add as items.

## Non-Functional Requirements

- User-perceived response time for any interaction (reserve, create list, add item) is under 2 seconds under normal load.
- The app is usable on the two most recent major versions of iOS Safari and Android Chrome.

## Business Logic

Each item on a shared wish list can be reserved by exactly one gift-giver; the reservation is visible to all gift-givers but the reserver's identity is hidden from the list owner.

The rule consumes two inputs: an item with status "available" on a wish list shared with the acting user, and that user's explicit Reserve action. The output is a status transition — the item becomes "reserved," the acting user holds the claim (visible to themselves), and all other viewers see the item as no longer claimable. The list owner sees only that the available count decreased; no identity is surfaced. The rule is enforced at the moment of reservation: concurrent Reserve attempts on the same item resolve to exactly one success.

## Access Control

Multi-user login (email + password or social OAuth). Flat role model: every logged-in member can create and manage their own wish list, and view and claim items on any other member's list. No admin tier for MVP. Sign-up creates an account; the family circle forms by members registering and finding each other within the app. List membership is established by email invitation from the list owner (FR-008).

## Non-Goals

- No price tracking or purchase integration with stores — the app lists items and links to them; the act of buying happens outside the app entirely.
- No group contributions on a single item — one reserver per item; splitting the cost of an expensive gift is out of scope for MVP.
- No photo upload on items for MVP — deferred to v2 (see Open Question 2).
- No unreserve/cancel-claim flow guaranteed for MVP — FR-015 is nice-to-have only.
- No public registry surface — the product targets a private family circle, not open discovery.

## Open Questions

1. **What should happen when a list owner edits or deletes an item that already has an active reservation?** Should the reserver be notified? Should their claim be silently dropped? Owner: user. Block: no (MVP ships with confirmation dialog; exact behavior TBD).
2. **Photo upload (dropped from MVP FR-009).** Should v2 support upload, URL paste, or both? Owner: user. By: v2 planning.
3. ~~**Mobile surface scope.**~~ Resolved at tech-stack-selection: native mobile app via Expo (React Native + TypeScript) + Supabase direct. Web surface deferred to v2.
4. **AI gift ideas rate limit (FR-016).** What is the maximum number of AI suggestion requests per user per day? Owner: user. By: FR-016 implementation. Block: no (feature is nice-to-have; a conservative default like 5/day can be used until decided).
