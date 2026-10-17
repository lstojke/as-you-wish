# Read-only wishlist links for non-members: Implementation Plan

## Overview

Allow a list owner to generate a stable, unlisted URL that anyone can open without an account. Non-members receive a strictly read-only view without any reservation information. Existing owners and accepted invitees opening an active link are redirected to the normal list page with their existing permissions.

## Current State Analysis

All `/lists` routes require authentication (`src/middleware.ts:4-23`). The normal detail page loads list, item, reservation, and invitation data before rendering an interactive React island (`src/pages/lists/[id].astro:30-70`).

Database policies restrict list and item reads to owners and accepted invitees. Existing email-invitation links require authentication and matching email; they are not anonymous bearer links. Neither mechanism should be weakened for this feature.

The change has an intent-only identity file; there is no upstream frame or research artifact. The following decisions were confirmed during planning:

| Area | Decision |
| --- | --- |
| Access | Anyone possessing the unlisted link may read; forwarding is possible |
| Contents | List title and item titles, notes, prices/currencies, and store links |
| Reservations | No status, aggregates, identity, or reservation controls for non-members |
| Membership | Link access never creates an invitation or membership |
| Existing members | Active links redirect owners/accepted invitees to the normal list page |
| Lifecycle | One stable link per list; no automatic expiry; explicit disable and replacement |
| Disabled state | Old URL remains unusable; only explicit replacement restores sharing |
| Freshness | Current contents on each request; no automatic updates while open |
| Existing sharing | Email invitations remain unchanged |

### Key discoveries

- Normal list queries use `select("*")`; tokens must not become columns on `lists` (`src/lib/services/lists.ts:19-39`).
- `ListDetail` enables claiming for non-owners, and `ItemsList` renders reservation badges. Neither is a safe public view without changing its behavior (`src/components/lists/ListDetail.tsx:133-148`, `src/components/lists/ItemsList.tsx:54-93`).
- Item display columns are `title`, `notes`, `link`, `price_cents`, and `currency` (`src/db/database.types.ts:63-73`).
- Existing database functions demonstrate explicit definer privileges and grants (`supabase/migrations/20260809190233_accept_invitation_rpc.sql:13-18,58-59`).
- Local pgcrypto is installed in `extensions`; the initial migration only enables the extension, so new SQL must establish the expected extension placement rather than assume it (`supabase/migrations/20260527125732_initial_wishlist_schema.sql:14`).
- The layout always hydrates its toaster; a public static view should be able to opt out (`src/layouts/Layout.astro:7-20,40`).
- Tests already have real anonymous/authenticated clients and accepted-member fixtures (`tests/helpers/supabaseTestClients.ts:15-43`, `tests/helpers/reservationFixtures.ts:25-53`).

## Desired End State

The owner has an additional share-link control on their list. First creation generates a URL; repeated copying returns that exact URL. Disabling makes it unavailable. Creating a replacement generates a different URL and permanently invalidates the old one. List deletion removes its sharing record.

An anonymous visitor or signed-in outsider can read the current list and item details without reservation information or mutation controls. They gain no dashboard membership and no permission on normal list/item/reservation APIs. An existing member opening the same active link reaches the normal list page. Invalid, disabled, replaced, and deleted links have the same generic unavailable response.

## What We're NOT Doing

- Anonymous reservations, purchases, editing, or membership creation.
- Public discovery, registry search, search indexing, or a public directory.
- Changes to email invitation acceptance, delivery, or member permissions.
- Multiple active links, recipient-specific revocation, passwords, expiry settings, or re-enabling old URLs.
- Snapshot publishing, realtime updates, analytics, or a new service-role client.
- Reworking existing authenticated list rendering or unrelated project health findings.

## Implementation Approach

Add a separate owner-readable `list_share_links` table and narrow database functions. Retain current list/item policies. Anonymous read authorization occurs inside a fixed-projection function that validates an active bearer token, not through broadly readable tables or privileged application credentials.

Store the recoverable token separately because the owner explicitly needs the same URL on later visits. Generate 32 random bytes in PostgreSQL and encode them as 64 lowercase hexadecimal characters. A token hash alone cannot reproduce a previously generated URL; adding encryption or another secret store is unnecessary for this scope.

Use a public SSR route outside `/lists`. Load a dedicated DTO, then check existing membership using the normal cookie-backed client and list RLS. Keep public item presentation static and separate from claim-enabled React components.

## Critical Implementation Details

### Authorization and lifecycle

All link-management functions must explicitly require `auth.uid()` to own the target list. Lock the parent list row before reading or modifying the share row so concurrent first creation cannot produce multiple active links. A disabled row is retained as a tombstone; ordinary create/get must never reactivate it.

### Privacy boundaries

The public read result may include the list UUID for server-side membership lookup, but never the owner ID, invitation data, item/reservation IDs, reservation fields, or timestamps. Do not serialize the internal UUID or bearer token into client props, structured data, canonical tags, or application diagnostics. A UUID is an identifier, not authorization; normal RLS remains authoritative.

### Revocation limitations

Disabling or replacing prevents subsequent authorized reads, not copies already received or an in-flight response already authorized. Use no-store responses, not shared caching, and warn owners that recipients can forward or retain content.

## Phase 1: Database contract and authorization

### Overview

Land additive sharing state and functions, with real-database tests proving lifecycle behavior and isolation.

### Changes Required

#### 1. Sharing migration

**File:** `supabase/migrations/<YYYYMMDDHHmmss>_list_share_links.sql`

**Intent:** Store stable bearer links separately from ordinary list data and authorize narrowly scoped reads and owner management.

**Contract:**

- `list_share_links`: `list_id uuid` primary key referencing `lists(id) ON DELETE CASCADE`, unique non-null `token text` matching 64 lowercase hex characters, nullable `disabled_at timestamptz`.
- Enable RLS. Permit owner-only SELECT for `authenticated`; grant no direct anonymous access and no client INSERT/UPDATE/DELETE privileges.
- Generate with `encode(extensions.gen_random_bytes(32), 'hex')` after ensuring pgcrypto is in the expected schema. Pin definer functions to an empty search path and fully qualify objects/functions. Revoke default PUBLIC execution; explicitly grant only the required roles.
- `get_or_create_list_share(p_list_id uuid)`: authenticated owner only. Lock the owned list row; create once when absent; return existing token when active; return disabled state with no token when disabled.
- `disable_list_share(p_list_id uuid)`: authenticated owner only, same lock; idempotently disable an existing row without creating a link.
- `replace_list_share(p_list_id uuid)`: authenticated owner only, same lock; generate a fresh token and clear disabled state. This is an explicit replacement, never an automatic retry of create/get.
- Management return contract: state `not_created | active | disabled` and `token: string | null`; a token is returned only for active state. Reject unauthenticated/non-owner management without revealing another owner's link.
- `read_list_share(p_token text) RETURNS jsonb`: executable by `anon` and `authenticated`. Return SQL NULL for malformed, unknown, disabled, replaced, or deleted-list tokens. An active link returns `{ list_id, title, items }`, with item fields exactly `title`, `notes`, `price_cents`, `currency`, `link`.
- Build the projection explicitly; never serialize a table row. Return `items: []` for empty lists and order items deterministically by `created_at, id`. Never read reservations or invitations in this function.
- Preserve existing table/view policies and mutation permissions.

#### 2. Generated types and database integration tests

**Files:** `src/db/database.types.ts`, `tests/integration/list-shares.test.ts`, supporting fixtures under `tests/helpers/` only if needed.

**Intent:** Make the RPC contract available to typed callers and prove behavior under actual RLS and concurrent requests.

**Contract:** Regenerate types with `npx supabase gen types typescript --local > src/db/database.types.ts`; do not hand-edit generated definitions. Reuse existing client and member fixtures; use local disposable Supabase only.

### Success Criteria

#### Automated Verification

- Migration applies to the disposable local database: `npx supabase db reset`; never target a remote or non-disposable database.
- Sharing and existing access-control integration tests pass: `npm run test:integration -- tests/integration/list-shares.test.ts tests/integration/access-control.test.ts`.
- Tests prove concurrent create/get returns one stable URL; disable and replacement invalidate old tokens; list deletion cascades; non-owners cannot read/manage token records; public DTO fields exclude all reservation and identity data.

#### Manual Verification

- Inspect the local function/grant definitions and generated types: only the narrow read function permits anonymous execution, and ordinary anonymous/outsider table access remains closed.

**Implementation Note:** Pause after automated checks for human confirmation of this phase's manual criterion before proceeding.

## Phase 2: Public read-only SSR view

### Overview

Deliver the account-free view and existing-member redirect without exposing interactive list controls.

### Changes Required

#### 1. Typed service and input boundaries

**Files:** `src/lib/services/list-shares.ts`, `src/lib/schemas/list-shares.ts`, `src/types.ts`, `src/lib/services/list-shares.test.ts`.

**Intent:** Centralize sharing operations, validate RPC JSON, and separate expected unavailable links from infrastructure failures.

**Contract:** Validate tokens against 64 lowercase hex characters. Parse the fixed read DTO using Zod rather than casts. Use the existing Supabase client type and service-family error convention: throw unexpected failures and map them at the route/action boundary. SQL NULL is expected unavailability; malformed non-null RPC output is an error, not an empty list.

For signed-in callers, use a narrow normal `lists` query by the resolved UUID with `maybeSingle()` to check membership through existing RLS. Zero visible rows means outsider; query failures must not silently become outsider results. No invitation joins, service-role access, or new membership function is needed.

#### 2. Public route and presentation

**Files:** `src/pages/share/[token].astro`; a small static item component under `src/components/lists/` only if it improves presentation reuse.

**Intent:** Render a useful, escaped, non-interactive wishlist without importing reservation-aware components.

**Contract:** Explicit `prerender = false`. Use the middleware-provided client. Resolve an active token before any membership redirect. Redirect existing owners/accepted invitees to `/lists/<id>` with HTTP 302; anonymous visitors and signed-in outsiders render identical list content.

Render title, item titles, notes as plain text, optional prices/currencies, and HTTP(S) store links. Reuse the existing price-display convention where available. Guard stored URLs at render time as well as following the established schema rule. No reservation query, badge, counts, controls, or hydrated authenticated list island. Include clear read-only wording and an empty-list state.

Malformed/missing/disabled/replaced/deleted links return the same generic 404 without list metadata. Infrastructure failures return a generic unavailable 503 and sanitized repository-standard diagnostics; do not log tokens, request URLs, raw RPC arguments, or token-bearing errors.

#### 3. Response privacy and product documentation

**Files:** `src/layouts/Layout.astro`, `context/foundation/prd.md`.

**Intent:** Support a private, static public-route shell and document the intentional access-control exception.

**Contract:** Add optional layout controls for `noindex, nofollow`, no-referrer metadata, and disabling the toaster, preserving existing defaults for all other pages. Apply `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`, and `X-Robots-Tag: noindex, nofollow` to public-route success, failures, and redirects. External store links use `rel="noopener noreferrer"` and no-referrer behavior.

Amend the PRD access-control requirements/non-goal wording narrowly: owner-enabled unlisted read access without membership is supported; discovery and anonymous claiming remain excluded. Preserve historic MVP context and existing requirement identifiers.

### Success Criteria

#### Automated Verification

- Service unit and database sharing tests pass: `npm run test:unit -- src/lib/services/list-shares.test.ts` and `npm run test:integration -- tests/integration/list-shares.test.ts`.
- With the local app running, HTTP smoke checks verify anonymous 200, equivalent signed-in outsider view, existing-member 302, generic invalid/disabled/replaced/deleted 404, and privacy headers on each response.
- Type checks and touched-file lint pass: `npx astro check` and `npx eslint src/lib/services/list-shares.ts src/lib/services/list-shares.test.ts src/lib/schemas/list-shares.ts src/types.ts src/pages/share/'[token].astro' src/layouts/Layout.astro`; include any added presentation file.

#### Manual Verification

- In a private browser, verify notes, prices, safe store links, empty state, and mobile layout; no reservation data or mutation controls appear.
- Verify owner and accepted-invitee redirects, outsider read-only access, updated contents after refresh, and generic unavailable-link behavior after revocation.

**Implementation Note:** Pause after automated checks for human confirmation of this phase's manual criteria before proceeding.

## Phase 3: Owner sharing controls

### Overview

Expose deliberate, reliable owner controls without changing email invitations or member workflows.

### Changes Required

#### 1. Authenticated actions and sharing dialog

**Files:** `src/actions/index.ts`, `src/components/lists/ShareLinkDialog.tsx`, `src/components/lists/ListDetail.tsx`.

**Intent:** Let owners create, copy, disable, and replace their stable link while keeping every privileged operation enforced in the database.

**Contract:** Add Zod-validated sharing actions using `requireSupabase` and the sharing service. Use existing dialog/button primitives. Show the control only to the owner; do not fetch bearer state for invitees.

Display explicit never-created, active, disabled, pending, and error states. Load owner-only state when needed without creating links as a side effect of opening the dialog. First creation returns the URL; active repeated sharing reuses it. Disabled state shows no copyable URL and requires explicit replacement. Confirm disabling/replacement with wording that old recipients lose access and replacement requires redistributing the URL.

Build absolute URLs using the trusted request origin or the project's existing canonical-origin convention, not submitted host data. Keep tokens in the owner interaction only; do not place them in analytics or ordinary list props. Disable overlapping mutation buttons and refresh authoritative state after uncertain failures; do not automatically retry a replacement.

Copy through the browser clipboard API with a visible error and selectable URL if copying fails. Explain that anyone with the link can view and forward it, no automatic expiry applies, and already received content cannot be withdrawn. Keep existing email-invite controls and member actions unchanged.

#### 2. Verification completion

**Files:** `src/lib/services/list-shares.test.ts`, `tests/integration/list-shares.test.ts`, relevant existing test files only when necessary.

**Intent:** Cover lifecycle mapping, owner-only state lookup, and regressions in the existing sharing model.

**Contract:** Extend the established Node unit/local Supabase test setup; do not add a frontend test framework solely for this change. Exercise clipboard/dialog behavior through explicit manual checks.

### Success Criteria

#### Automated Verification

- Unit tests pass: `npm run test:unit`.
- Sharing, access-control, invitation, and reservation regression tests pass: `npm run test:integration`.
- Project lint, type checking, and build pass: `npm run lint`, `npx astro check`, `npm run build`, using the repository's existing local environment setup.

#### Manual Verification

- Owner creates a link, closes/reopens the dialog, and copies the identical URL; failed copying is visible and the URL remains selectable.
- Disable makes the URL unavailable; reopening the dialog does not reactivate it; replacement restores access only through a different URL; deleting the list invalidates its link.
- Non-owner UI exposes no sharing-management controls, and existing email invitations, owner editing, and member reserve/cancel flows still work.
- Review preview/production request-log settings for bearer paths before rollout; prevent token-bearing application diagnostics and document any platform retention that cannot be redacted as an operational limitation.

**Implementation Note:** Pause for human confirmation of manual criteria before marking the implementation complete or deploying to production.

## Testing Strategy

### Unit tests

Cover token validation, strict DTO validation, nullable fields, empty lists, expected unavailability, unexpected RPC errors, owner-management state mapping, membership zero-row versus failure, and unsafe legacy store URLs. Keep tests compatible with the existing Node Vitest project rather than importing unsupported Astro virtual modules.

### Integration tests

Use separate owner, accepted-invitee, outsider, and anonymous clients. Test base-table and function grants, cross-list isolation, pending versus accepted invitations, no membership creation, create/get concurrency, idempotent disable, explicit replacement, replacement/disable serialization, deleted lists, and exact public DTO keys. Verify direct token-table reads and mutation functions cannot disclose or alter another owner's link.

### HTTP and manual checks

Use a local workerd-backed app for route/header checks because unit tests alone do not prove SSR behavior. Never send production tokens to external tools. Perform browser checks in signed-out, owner, invited-member, and outsider sessions. A successful public read must never include `Available`, `Reserved`, claim counts, identities, or reservation actions.

## Performance Considerations

Unique token lookup and the existing item `list_id` index bound reads to one list. Return the current list in one RPC, plus one narrow membership lookup only for signed-in visitors. No polling, subscriptions, public shared cache, or new dependencies. Preserve the PRD's under-two-second normal-load interaction target; measure locally/preview with representative family-sized lists rather than adding pagination speculatively.

## Migration Notes

The schema is additive and leaves existing lists unshared by default. Apply the migration before deploying the Worker that calls its functions; regenerate types against the migrated local schema. Run destructive reset commands only against a disposable local test database.

Worker rollback leaves the table/functions in place and does not invalidate already enabled links at the database layer. If access itself must be stopped, disable the links or revoke the public reader's execution grants as a deliberate operational action; do not rely on a Worker rollback as database revocation. Direct production deployments require human confirmation.

Bearer paths may appear in browser history and platform request logs even with application privacy controls. Noindex is not access control. Review Cloudflare invocation/request logging without disabling unrelated observability wholesale; communicate any unavoidable retention.

## References

- Change intent: `context/changes/non-users-list-view/change.md`
- Product baseline: `context/foundation/prd.md`
- Accepted rules: `context/foundation/lessons.md`
- Middleware: `src/middleware.ts:4-23`
- Existing detail: `src/pages/lists/[id].astro:30-70`
- List services: `src/lib/services/lists.ts:19-39`
- Definer precedent: `supabase/migrations/20260809190233_accept_invitation_rpc.sql:13-18,58-59`
- Database schema: `supabase/migrations/20260527125732_initial_wishlist_schema.sql`
- Integration clients: `tests/helpers/supabaseTestClients.ts:15-43`
- Member fixtures: `tests/helpers/reservationFixtures.ts:25-53`
- Test configuration: `vitest.config.ts:20-33`

## Progress

> Convention: pending boxes become done during implementation; append the closing commit SHA when a step lands. Do not rename step titles.

### Phase 1: Database contract and authorization

#### Automated

- [x] 1.1 Migration applies to the disposable local database — d7c698b
- [x] 1.2 Sharing and existing access-control integration tests pass — d7c698b
- [x] 1.3 Lifecycle, concurrency, isolation, and DTO exclusion assertions pass — d7c698b

#### Manual

- [x] 1.4 Inspect local grants, generated types, and unchanged table access — d7c698b

### Phase 2: Public read-only SSR view

#### Automated

- [x] 2.1 Service unit and database sharing tests pass — 0ce1bb3
- [x] 2.2 HTTP status, member redirect, and privacy-header smoke checks pass — 0ce1bb3
- [x] 2.3 Type checks and touched-file lint pass — 0ce1bb3

#### Manual

- [x] 2.4 Verify private-browser display, mobile layout, and absence of reservation data — 0ce1bb3
- [x] 2.5 Verify member redirects, outsider access, refresh freshness, and revocation — 0ce1bb3

### Phase 3: Owner sharing controls

#### Automated

- [x] 3.1 Unit tests pass — 3df2022
- [x] 3.2 Sharing and existing integration regression tests pass — 3df2022
- [x] 3.3 Project lint, type checking, and build pass — 3df2022

#### Manual

- [x] 3.4 Verify stable URL persistence and clipboard failure behavior — 3df2022
- [x] 3.5 Verify disable, replacement, and list-deletion lifecycle — 3df2022
- [x] 3.6 Verify owner-only controls and existing invitation/editing/reservation flows — 3df2022
- [x] 3.7 Review bearer-path logging and document platform retention limitations — 3df2022
