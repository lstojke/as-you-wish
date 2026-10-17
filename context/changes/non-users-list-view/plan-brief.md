# Read-only wishlist links for non-members - Plan Brief

> Full plan: `context/changes/non-users-list-view/plan.md`

## What & Why

Let owners share a wishlist with relatives who do not have accounts.
A stable, unlisted link opens a useful read-only view without requiring sign-up.
Anyone receiving or forwarding the URL can view it until the owner disables or replaces it.

## Starting Point

List access currently requires authentication and ownership or an accepted email invitation.
The existing detail UI includes reservation controls and cannot serve as the anonymous view unchanged.

## Desired End State

Owners create a link once and copy the same URL on subsequent visits.
Non-members see current list/item contents but no reservation information or controls.
Existing owners/invitees opening an active link reach the normal list with their usual permissions.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Access | Unlisted bearer URL | Removes account friction without adding public discovery |
| Visible data | List title; item names, notes, prices, store links | Provides useful gift information |
| Reservations | Completely absent for non-members | User explicitly chose not to disclose them |
| Membership | Never granted by link access | Direct invitations remain authoritative |
| Member experience | Automatic redirect to the normal list | Existing members keep their usual capabilities |
| Stability | One URL, no automatic expiry | Repeated sharing and bookmarks stay useful |
| Recovery | Disable or explicitly replace | Makes disclosure recoverable without routine URL changes |
| Freshness | Current data on load/refresh | Avoids snapshots and realtime complexity |
| Authorization | Separate share table and narrow database functions | Keeps normal list/item RLS unchanged |
| Secret storage | Recoverable random token, owner-only table reads | The same URL must remain retrievable |

## Scope

**In scope:** Owner create/copy/disable/replace controls; account-free SSR view;
safe item presentation; member redirects; privacy headers; authorization tests;
a focused PRD access-control amendment.

**Out of scope:** Anonymous reservations or editing; automatic membership;
public discovery; expiry settings; recipient-specific revocation; live updates;
changes to existing email invitations.

## Architecture / Approach

A separate RLS-protected record holds a 256-bit token per list.
Owner-only functions manage its lifecycle; a narrow read function returns only display data.
The `/share/[token]` SSR route renders a static view or checks normal RLS membership and redirects.
No service-role credential, new frontend framework, or globally readable list policy is needed.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Database contract | Stable tokens, owner functions, public projection, integration tests | Anonymous authorization and concurrent lifecycle operations |
| 2. Public SSR view | Read-only contents, member redirects, privacy controls | Accidentally exposing reservation data or caching responses |
| 3. Owner controls | Reliable copy/disable/replace UI and regression coverage | Accidental reactivation or confusing replacement behavior |

**Prerequisites:** Disposable local Supabase, existing test credentials/setup, and the local app environment.
**Estimated effort:** Medium-sized change across three implementation phases; database permission tests are the critical path.

## Open Risks & Assumptions

- Link holders can forward URLs and retain content; revocation cannot withdraw copies.
- A disabled URL is not re-enabled: explicit replacement creates a new URL.
- Recoverable tokens require owner-only storage and careful diagnostics; platform URL logging needs rollout review.
- `wrangler.jsonc` currently enables observability in default, preview, and production environments. Provider invocation/request logs may retain full bearer paths; no-store/no-referrer do not redact server logs. Review retention/access and request-log redaction before rollout. Sharing code logs only fixed operation labels, never raw errors or URLs.
- Search exclusion is not secrecy; no automatic expiry means owners must act to revoke access.
- Migrations remain compatible with the previous Worker; Worker rollback is not database revocation.

## Success Criteria (Summary)

- Repeated sharing returns the same working URL until explicitly disabled or replaced.
- Non-members can read current contents without accounts, membership, or reservation information.
- Existing members keep normal permissions; expired-by-replacement/disabled/deleted links disclose no list data.
