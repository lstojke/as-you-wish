# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-14 (Phase 2 complete: invitation accept + non-member access-control integration specs landed)

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in <area>"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/` (user-confirmed override; `supabase/` excluded as SQL schema only).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the _evidence that surfaced
this risk_ — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| #   | Risk (failure scenario)                                                                                                                                | Impact | Likelihood | Source (evidence — not anchor)                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Exclusive-claim rule fails: two simultaneous Reserve taps both succeed, so two relatives buy the same gift                                             | High   | High       | interview Q1; PRD US-01 / FR-013 / Business Logic; hot-spot dir `src/actions/` (3 commits/30d), `src/lib/services/` (5 commits/30d) |
| 2   | Invitation → accept flow mis-grants access: wrong person gains a list, accept bypasses the email-confirmation gate, or a replayed accept double-grants | High   | High       | interview Q3 (lowest-confidence area); PRD FR-008; hot-spot dir `src/lib/services/` (5 commits/30d)                                 |
| 3   | IDOR / access: a user reads or reserves items on a list they were never invited to (membership/ownership not enforced at the data layer)               | High   | Medium     | PRD Access Control; abuse lens (auth product); hot-spot dir `src/lib/services/` (5 commits/30d), `src/actions/` (3 commits/30d)     |
| 4   | Reserver identity leaks to the list owner, spoiling the gift surprise                                                                                  | High   | Medium     | PRD Guardrails / FR-013 / FR-014 / Business Logic; abuse lens (PII/privacy)                                                         |
| 5   | Server-side validation parity: an action or endpoint trusts client input (price, ownership, list id) without server-side zod checks                    | Medium | Medium     | AGENTS.md (endpoints must zod-validate); abuse lens (untrusted input); hot-spot dir `src/lib/schemas/` (2 commits/30d)              |
| 6   | Deleting or editing an item that has an active reservation leaves inconsistent state (orphaned reservation row, reserver sees a phantom claim)         | Medium | Medium     | PRD Open Question 1; roadmap Open Roadmap Question 1; hot-spot dir `src/components/lists/` (7 commits/30d)                          |

**Impact × Likelihood rubric.**

| Rating | Impact                                                          | Likelihood                                               |
| ------ | --------------------------------------------------------------- | -------------------------------------------------------- |
| High   | user loses access, data, or money; failure is publicly visible  | area changes weekly, or we have already been burned here |
| Medium | feature degrades, a workaround exists, only some users affected | touched occasionally, has been a source of bugs          |
| Low    | cosmetic, easily reverted, no data effect                       | stable code, rarely touched                              |

Protect High × High first (#1 duplicate reservation, #2 invitation/access).
No High-impact × Low-likelihood outage scenarios are padded into this map;
they would belong to observability, not tests.

**Abuse / security lens.** AsYouWish has auth, email invitations, and
user-supplied input, so the map carries abuse scenarios directly:
authorization/access (#3 IDOR — membership, not just authentication),
secret/PII leakage (#4 reserver identity), and untrusted input (#5
server-side validation parity). These are scored on the same two axes as
the functional risks.

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                    | Must challenge                                                                                                              | Context `/10x-research` must ground                                                                                   | Likely cheapest layer                           | Anti-pattern to avoid                                                                            |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| #1   | Two concurrent reserves on one available item resolve to exactly one success; the loser gets a clean rejection; the DB holds exactly one claim | "The app-layer check is enough" — exclusivity must hold at the DB boundary under real concurrency, not just single-threaded | The persisted claim mechanism (unique constraint / RPC), the reserve entry point, and what the losing caller receives | integration (real DB/RPC, two concurrent calls) | happy-path single-reserve only; asserting the app-layer guard while never exercising the DB race |
| #2   | Only the invited email gains access; accept requires a confirmed email; a replayed accept is a no-op                                           | "Signed-in ⇒ authorized to accept"; "invite delivered ⇒ correct recipient"                                                  | Invite creation, the accept RPC, the email-confirmation gate, and accept idempotency                                  | integration                                     | trusting the happy invite→accept path; skipping the unconfirmed-email and replay cases           |
| #3   | A non-invited user's read and reserve on someone else's list are both denied at the data layer                                                 | "Authenticated ⇒ authorized"; ownership ≠ membership                                                                        | Which RLS policy or query gates read vs reserve, and where the membership check runs                                  | integration (act as a non-member principal)     | over-mocking Supabase so RLS/policies are never exercised                                        |
| #4   | Owner-facing surfaces expose only aggregate available/reserved counts — never the reserver's identity, in both API payload and UI              | "Hidden in the UI ⇒ absent from the payload"                                                                                | The owner-facing query/DTO and whether a reserver id ever crosses the boundary                                        | integration (assert payload shape)              | asserting only the rendered UI while the reserver id leaks in the JSON                           |
| #5   | Malformed or hostile input (negative price, foreign list id, missing fields) is rejected server-side, independent of the client                | "Client zod ⇒ server safe"                                                                                                  | Where server-side validation actually runs for actions and endpoints                                                  | integration / contract                          | copying the client schema as the test oracle; testing only the client form                       |
| #6   | Deleting or editing a reserved item leaves no orphaned reservation and the reserver's view stays consistent                                    | "Delete just works" — check what happens to the existing claim                                                              | Cascade / FK behavior on item delete and what the reserver observes afterward                                         | integration                                     | asserting current behavior as correct without verifying DB consistency                           |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name                          | Goal (one line)                                                                                                                   | Risks covered | Test types             | Status      | Change folder                                    |
| --- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------- | ----------- | ------------------------------------------------ |
| 1   | Bootstrap + reservation exclusivity | Stand up Vitest and prove the exclusive-claim rule resolves concurrent reserves to exactly one success                            | #1            | unit + integration     | complete    | context/changes/testing-reservation-exclusivity/ |
| 2   | Invitation & access control         | Prove invite/accept grants access only to the right, email-confirmed user and that non-members are denied read/reserve            | #2, #3        | integration            | complete      | context/changes/testing-invitation-access-control/ |
| 3   | Privacy + input integrity           | Prove reserver identity never reaches the owner, server-side validation parity holds, and reserved-item mutation stays consistent | #4, #5, #6    | integration + contract | not started | —                                                |
| 4   | Quality-gates wiring                | Lock lint + typecheck + test into CI so the floor can't silently regress                                                          | cross-cutting | gates                  | not started | —                                                |

**Status vocabulary** (fixed — parser literals): `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer                  | Tool                                 | Version                | Notes                                                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unit + integration     | Vitest                               | 3.2.7                  | two projects in `vitest.config.ts` — `unit` (`src/**/*.test.ts`, env `node`, no setup) and `integration` (`tests/integration/**`, setup `tests/setup/integration.ts`). Vite-native; project pins `vite@^7` via `overrides`. Landed in Phase 1 |
| DB-integration harness | Supabase (local stack)               | via `supabase` CLI 2.x | integration tests for #1–#3, #6 run against the local Supabase started by `npx supabase start` (Docker)                                                                                                                                       |
| API mocking            | none yet                             | —                      | prefer real local Supabase over mocking; mock only the external email edge if needed — see Phase 2                                                                                                                                            |
| e2e                    | none yet                             | —                      | optional; Playwright tools are available this session but concurrency/RLS risks get cheaper signal from DB-integration tests                                                                                                                  |
| accessibility          | none                                 | —                      | out of scope for MVP (no PRD NFR)                                                                                                                                                                                                             |
| (optional) AI-native   | Playwright MCP — checked: 2026-09-13 | n/a                    | do NOT use where a deterministic integration test already catches the regression                                                                                                                                                              |

**Stack grounding tools (current session):**

- Docs: none — no Context7 or framework-docs MCP exposed this session; recommendations grounded in `package.json`, `AGENTS.md`, and `astro.config.mjs`; checked: 2026-09-13
- Search: web fetch only (no Exa.ai) — not used for this write; checked: 2026-09-13
- Runtime/browser: Playwright tools available — noted as a possible e2e layer, not used for the strategy above; checked: 2026-09-13
- Provider/platform: GitHub tools available; no Supabase/Cloudflare MCP — CI gate (Phase 4) targets the existing `.github/workflows/ci.yml`; checked: 2026-09-13

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate                  | Where                | Required?                 | Catches                                                                          |
| --------------------- | -------------------- | ------------------------- | -------------------------------------------------------------------------------- |
| lint + typecheck      | local + CI           | required                  | syntactic / type drift                                                           |
| unit + integration    | local + CI           | required after §3 Phase 1 | reservation, invitation, access, validation regressions                          |
| e2e on critical flows | CI on PR             | optional                  | broken end-to-end reserve/invite paths (only if integration proves insufficient) |
| pre-prod smoke        | between merge + prod | optional                  | environment-specific failures on Cloudflare Workers                              |

Gate wiring itself lands in §3 Phase 4.

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

- Put pure logic in a service under `src/lib/` with **type-only** cross-module imports so the unit graph never pulls in `astro:*` runtime modules, then colocate the spec as `src/**/*.test.ts`.
- Run with `npm run test:unit` (the `unit` Vitest project, env `node`, no setup file, no external services). Import modules under test via the `@/*` alias — mirrored to `./src` in `vitest.config.ts`.
- Example: [src/lib/services/reservations.test.ts](../../../src/lib/services/reservations.test.ts) exercises `reserveErrorPayload` — a Postgres `23505` maps to `CONFLICT`, everything else to `INTERNAL_SERVER_ERROR` — with no DB running.

### 6.2 Adding an integration test (against local Supabase)

- Start the stack first: `npx supabase start` (Docker). Put the spec under `tests/integration/**/*.test.ts` and run `npm run test:integration` (or `npm test` for the whole suite).
- **Credentials**: the `integration` project's setup file [tests/setup/integration.ts](../../../tests/setup/integration.ts) loads a gitignored `.env.test` via `process.loadEnvFile` and fails fast with an actionable message if the stack is unreachable or a var is missing. Copy `.env.test.example` and fill it from `npx supabase status` (`SUPABASE_URL`, `SUPABASE_ANON_KEY` = publishable key, `SUPABASE_SERVICE_ROLE_KEY` = secret key, `SUPABASE_DB_URL` = the Database URL, used only by fixtures needing direct auth-schema access). Never commit `.env.test`; never point it at the remote project.
- **Fixtures & RLS**: seed the membership graph with a **service-role** client (bypasses RLS) — see [tests/helpers/reservationFixtures.ts](../../../tests/helpers/reservationFixtures.ts): `auth.admin.createUser({ email_confirm: true })` for each actor, then insert `lists`/`items`/`invitations` (set `accepted_by_user_id` to make an invitee a member). Then exercise the actual behaviour through **member clients** signed in with the publishable key (`signInWithPassword`) so RLS is genuinely tested. Teardown deletes the auth users, which cascades away lists/items/invitations/reservations — keeping runs isolated without a full `db reset`.

### 6.2b Access-control (non-member denied) pattern

- Seed the full membership graph with the **service-role** client (owner + list + item), plus a signed-in **outsider** member who was never invited to that list — see [tests/helpers/invitationFixtures.ts](../../../tests/helpers/invitationFixtures.ts). Exercise denial through the outsider's **publishable-key** client so RLS is genuinely enforced.
- **Assert the two denial shapes, which differ**: a blocked SELECT returns an **empty result set with no error** (RLS filters rows silently — `lists_select` / `items_select` via `is_list_member`), whereas a blocked write **rejects** (`reservations_insert` WITH CHECK `is_item_list_member`). Don't expect an error on the read.
- **Guard against false-empty**: pair every "read denied" assertion with a service-role control read of the same rows proving they exist — otherwise a seeding gap masquerades as a passing denial. Pattern: [tests/integration/access-control.test.ts](../../../tests/integration/access-control.test.ts).
- **Negative control** (manual one-off, never committed): temporarily relax the relevant policy locally (e.g. broaden `reservations_insert` or `items_select`), re-run the spec, and confirm the denial case flips to a pass-through — proof the test exercises RLS, not app logic. Restore the policy afterward. This mirrors §6.5's dropped-index proof without a destructive automated step.

### 6.3 Adding an e2e test

- TBD — optional; see §3 Phase 2. Only add if a risk's failure mode requires the full deployed auth + cookie + handler shape.

### 6.4 Adding a test for a new Astro action or API endpoint

- TBD — see §3 Phase 3 for the server-side validation-parity pattern (assert the server rejects hostile input independent of the client schema).

### 6.5 Adding a test for a reservation / claim rule

- Exclusivity is a **DB invariant** (the `reservations_one_active_per_item` unique partial index), not an app check — test it as such. Seed one item and two members, then fire both reserves concurrently (fire both promises, don't await the first) and `Promise.allSettled`. Assert exactly one fulfilled, one rejected carrying `code === "23505"`, and exactly one active row (`released_at is null`) via a service-role query.
- Add a release-then-reserve case to guard the partial-index semantics. Pattern: [tests/integration/reservations.concurrency.test.ts](../../../tests/integration/reservations.concurrency.test.ts).
- **Negative control**: dropping the unique index locally must make the concurrency spec fail with two successes — proof the test exercises the DB guarantee, not app logic.

### 6.6 Per-rollout-phase notes

(Optional. After each phase lands, `/10x-implement` appends a 2–3 line note here capturing anything surprising the rollout phase taught.)

- **Phase 1**: The Supabase CLI (2.98+) issues per-project **publishable/secret** keys (`sb_publishable_…`/`sb_secret_…`) that are not deterministic across machines — so local test credentials live in a gitignored `.env.test` (template committed) rather than being hard-coded. `process.loadEnvFile` (Node 22) loads them with zero extra deps.
- **Phase 2**: GoTrue refuses a password session for any user whose `email_confirmed_at` is null (even with `GOTRUE_MAILER_AUTOCONFIRM=true`), and the admin API can't un-confirm an already-confirmed user. To exercise the `accept_invitation` P0001 gate with a live session, the fixture signs the user in **while confirmed**, then nulls `email_confirmed_at` directly via a `pg` connection (`SUPABASE_DB_URL`, added to `.env.test`) so the RPC re-reads the un-confirmed row. This is the only path that reaches the RPC's own guard rather than the upstream login gate.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Static / marketing Astro pages** (`src/pages/index.astro`, welcome/banner content) — lowest blast radius; no business logic. Re-evaluate if a static page starts carrying auth or data logic. (Source: Phase 2 interview Q5.)
- **Vendored shadcn/ui primitives** (`src/components/ui/`) — the upstream library is the test; only test project-specific composition on top. Re-evaluate if a primitive is hand-modified. (Source: Phase 2 interview Q5, cost × signal.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-13
- Stack versions last verified: 2026-09-13
- AI-native tool references last verified: 2026-09-13

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive (e.g. the AI gift-ideas feature FR-016 ships),
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
