# Collaborative List Editing Implementation Plan

## Overview

Allow list owners to invite or designate trusted collaborators who can manage items and rename the list, without granting them control over membership, share links, or list deletion. Preserve the existing viewer role and gift reservation privacy.

## Current State Analysis

- Invitations are unique by list and normalized email; confirmed, matching users accept through an idempotent RPC (`supabase/migrations/20260809190233_accept_invitation_rpc.sql`, `src/lib/services/invitations.ts`).
- Owners can mutate lists and items; accepted invitees can view items and reserve or release their own claims (`supabase/migrations/20260527125732_initial_wishlist_schema.sql:191-285`).
- List-share management is separately owner-gated; public share links grant read-only access and no membership (`supabase/migrations/20261017210751_list_share_links.sql`).
- The list page and dashboard gate management controls on ownership (`src/components/lists/ListDetail.tsx`, `src/components/dashboard/DashboardLists.tsx`). Group organization is personal, not shared.
- The image feature is parked and uncommitted in this worktree. Plan implementation against a clean branch from current `origin/master`, not those unfinished edits. Coordinate image authorization if that feature lands before or after this change.

### Key Discoveries

- Invitation rows are the membership records; only the owner may insert or delete them. Direct invitation updates are limited to acceptance columns, and `is_list_owner` is reused by privileged operations. Do not broaden that helper (`supabase/migrations/20260527125732_initial_wishlist_schema.sql:114-160,230-261`).
- A collaborator-capable list `UPDATE` policy alone could allow ownership or identity changes; protect those fields at the database boundary. A narrow, owner/editor-authorized rename RPC avoids widening direct list updates.
- Existing UI only offers revocation for pending invitations, even though owners can see accepted entries (`src/components/lists/PendingInvitations.tsx`).
- Reservation rows are visible only to their claimer; the member-visible status is boolean. Database reservation insertion currently allows owners too, although the UI hides owner claiming. This change must not expose identities or broaden reservation access.

## Desired End State

- An owner chooses **viewer** or **collaborator** for an email invitation and can change that role for existing pending or accepted invitations.
- Existing invitations default to viewer; acceptance still requires the correct confirmed account. A collaborator can create, edit, and delete items and rename the list.
- Only the owner can invite, revoke or change roles, manage share links, or delete the list. Neither client-side state nor direct database/API calls can bypass those boundaries.
- Collaborators retain the existing invitee reservation and release behavior; they cannot see other claimers' identities or release another person's claim. This preserves current invitee capabilities rather than silently removing them.
- Owner and collaborator permissions update on the next request after a role change; already-running transactions may complete. Existing viewer and anonymous-link behavior stays unchanged.

## What We're NOT Doing

- Multiple owners, ownership transfer, collaborator-controlled access, or collaborator list deletion.
- A new accepted-member removal UI, public editing, change history, live presence, or conflict-resolution UI.
- Changing reservation privacy, exclusivity, or the existing consequences of editing/deleting reserved items.
- Implementing the parked image feature or revising the PRD/roadmap as part of this change.

## Implementation Approach

Use the existing invitation as the role-bearing membership, with a safe `viewer` default and an explicit `collaborator` role. Enforce permissions at the database boundary, expose only the current member's effective capabilities to the application, and use existing forms and actions for list and item editing. The owner manages roles in the existing invitation interface.

**Planning assumptions:** collaborator access is opt-in; pending and accepted members can be promoted or demoted by the owner; collaborators retain their existing ability to reserve/release their own claims; access management includes unlisted share-link controls. These are product assumptions, not prior user confirmations.

## Critical Implementation Details

**Authorization and rollout:** The migration must preserve the separate owner predicate and existing acceptance column grants. Use an owner-only role-change RPC, a role-aware item-edit predicate, and a narrow rename RPC rather than granting collaborators unrestricted `lists` updates. Lock or otherwise safely serialize role changes with acceptance, so accepting an invitation never resets its owner-selected role.

**Item boundaries:** Role-aware item write policies must validate both existing and proposed list membership. Restrict direct updates of item identity and list ownership/membership fields, while keeping the existing app's required item columns writable; test direct PostgREST attempts as well as action calls. If the image migration lands first, preserve its column grants and require the same current collaborator authorization for image grant, attach, replace and remove, including its locked RPC.

## Phase 1: Membership Roles and Database Authorization

### Overview

Extend invitation membership and enforce the role matrix in Postgres before exposing editor controls.

### Changes Required

#### 1. Role-bearing invitations

**Files**: `supabase/migrations/<timestamp>_collaboration_roles.sql`, `src/db/database.types.ts`

**Intent**: Record a viewer/collaborator role per invitation and provide owner-controlled role changes without weakening invitation acceptance.

**Contract**: Existing and legacy-client-created invitations default to viewer. Owner-created invitations may specify a valid role; only the owner can change a pending or accepted invitation's role via an ownership-checked RPC. Direct invitee role updates, malformed roles, cross-list changes, self-promotion, and unaccepted users gaining access are denied. Acceptance preserves the selected role and existing confirmed-email/matching-account checks.

#### 2. Capability checks and narrow mutations

**Files**: same migration, `src/lib/services/lists.ts`, relevant database types and tests

**Intent**: Authorize item editing and list renaming for accepted collaborators while retaining owner-only access management and list deletion.

**Contract**: Add a role-aware, membership-checked capability lookup suitable for SSR and scoped to the current user; it must not expose invitation records or depend on an invitations join being visible under RLS. Item create/update/delete is owner-or-accepted-collaborator only. List rename uses a narrow RPC; direct list updates remain owner-only and collaborators cannot alter list ID or owner. Preserve existing item fields and restrict identity/list reassignment through direct updates. Share-token RPCs and invitation management stay owner-only. Keep reservation and anonymous share policies unchanged.

#### 3. Authorization regression coverage

**Files**: `tests/integration/`, `tests/helpers/`

**Intent**: Exercise actual authenticated and anonymous database access, including malicious direct requests.

**Contract**: Cover owner, accepted collaborator, viewer, pending invitee, outsider, anonymous caller, and demoted collaborator. Test role escalation, acceptance races, cross-list IDs and moves, list ownership transfer, item CRUD, rename, invitation and share management, deletion, reservation privacy and exclusive claims.

### Success Criteria

#### Automated Verification

- Migration applies to a populated local database; existing invitations and old-client inserts remain viewers.
- Integration tests verify the role matrix, safe role changes, direct-request denials, reservation privacy and existing sharing behavior.

#### Manual Verification

- Verify an owner can grant and remove collaborator permissions without granting membership-management or list-deletion rights.

**Implementation Note**: Pause for human confirmation of manual verification before the phase commit.

## Phase 2: Invitation and Role Management

### Overview

Expose role selection and owner-controlled changes in the existing invitation flow, with clear localized messaging.

### Changes Required

#### 1. Invitation actions and services

**Files**: `src/lib/schemas/wishlist.ts`, `src/lib/services/invitations.ts`, `src/actions/index.ts`, `src/db/database.types.ts`

**Intent**: Support role selection at invitation creation and authenticated owner-only role changes for existing invitations.

**Contract**: Zod validates roles; omitted roles default to viewer for existing clients. Role changes call the owner-checking RPC, and failures are surfaced using existing localized action error conventions. Duplicate invitations remain unique and do not silently send another invitation; existing members are managed through the role control instead.

#### 2. Owner and invitee experience

**Files**: `src/components/lists/InviteDialog.tsx`, `src/components/lists/PendingInvitations.tsx`, `src/pages/invitations/accept.astro`, `src/lib/services/invitation-email.ts`, `src/lib/i18n/{pl,en}.ts`

**Intent**: Make the chosen role understandable when sending, reviewing, changing and accepting an invitation.

**Contract**: Viewer remains the default. The owner sees pending and accepted roles and can change them; only the owner sees these controls. Explain collaborator rights and limits in Polish and English, including in the acceptance experience and invitation email without leaking extra information. Preserve current pending-revoke behavior and confirmation/mismatched-account handling.

### Success Criteria

#### Automated Verification

- Unit and integration tests cover invitation role validation, defaulting, duplicate behavior, role changes, acceptance and localized email content.
- Localization parity passes.

#### Manual Verification

- Invite a viewer and collaborator, change an existing member's role, and confirm the role and its limits are clear in Polish and English.

**Implementation Note**: Pause for human confirmation of manual verification before the phase commit.

## Phase 3: Collaborator Controls and End-to-End Regression

### Overview

Expose the permitted item and rename actions to collaborators while keeping owner-only controls hidden and enforcing all operations server-side.

### Changes Required

#### 1. Effective permissions and controls

**Files**: `src/pages/lists/[id].astro`, `src/components/lists/ListDetail.tsx`, `src/components/lists/ItemsList.tsx`, `src/components/dashboard/{DashboardLists,ListActionsMenu}.tsx`, `src/lib/services/lists.ts`, `src/actions/index.ts`

**Intent**: Drive controls from authenticated effective capabilities rather than treating every invitee as read-only.

**Contract**: Accepted collaborators see add/edit/delete item and list rename controls on applicable views; viewers do not. Only owners see invite, role/revoke, share-link and list-delete controls. Collaborators retain their own reservation controls. Use the narrow rename RPC for collaborator renames and preserve owner behavior. Refresh or reject stale actions on permission changes with a localized error; do not rely on UI gating for authorization.

#### 2. Compatibility with parked image work

**Files**: `src/lib/services/item-images.ts`, `supabase/migrations/`, `tests/integration/item-images.test.ts` if the image feature exists on the integration base

**Intent**: Prevent the two changes from producing item controls that promise image editing while storage still rejects collaborators.

**Contract**: If images have landed before integration, extend image upload grants, attach/replace/remove authorization and tests to accepted collaborators while preserving private storage, one-use grants and failure safety. If images have not landed, do not implement them here; the image change must adopt the same role-aware authorization when integrated later.

#### 3. End-to-end regressions

**Files**: relevant list, invitation and access-control tests

**Intent**: Verify the full owner-to-collaborator flow and regressions in existing shared-list behavior.

**Contract**: Test role changes on an existing member, item CRUD, rename, denied access/list deletion, unchanged viewer and anonymous behavior, stale permissions, reservation privacy, keyboard/focus behavior and role-gated controls. Test simultaneous item edits using the existing last-write-wins behavior; deleting a reserved item retains the existing cascade behavior.

### Success Criteria

#### Automated Verification

- Relevant UI/service and integration tests pass for owner, collaborator, viewer and anonymous share scenarios, including permission changes and direct API denials.
- `npm run test`, `npm run lint`, `npx astro check`, and `npm run build` pass with the required server build environment.

#### Manual Verification

- In separate owner, collaborator and viewer sessions, verify invitation, role change, item CRUD and rename; verify forbidden access-management and deletion controls are absent.
- Verify reservation privacy and claims, Polish/English messaging, and keyboard/mobile usability; confirm a demoted collaborator loses mutation access after refresh.

**Implementation Note**: Pause for human confirmation of manual verification before the phase commit.

## Testing Strategy

### Unit Tests

- Validate role schema, defaulting and localized role descriptions; cover owner/collaborator/viewer capability-driven rendering and service error mapping.
- Verify the existing item and list forms still map their inputs correctly.

### Integration Tests

- Exercise migrations and roles using real authenticated clients and direct PostgREST, including forged role changes, ownership transfer, cross-list item moves, pending users and outsiders.
- Verify acceptance, promotion/demotion, permissions on subsequent requests, old invitation defaults and rollback compatibility.
- Re-run invitation, access control, reservation concurrency and share-link tests. Include image authorization tests if images are on the integration base.

### Manual Testing Steps

1. Invite a viewer and a collaborator using different accounts; accept each using the correct confirmed email.
2. As collaborator, create/edit/delete items and rename the list; confirm sharing, invitation management and deleting the list are unavailable.
3. Promote and demote an existing invitee; refresh and verify the resulting capabilities. Confirm the viewer's reservation still works.
4. Open an anonymous share link, verify it remains read-only, and check owner/collaborator views in Polish and English on mobile and desktop.

## Performance Considerations

Role lookup should be scoped to the current user and list, using the existing invitation list/email uniqueness index or an appropriate supporting index; avoid one role lookup per item. The small-family workload does not require caching permission results across requests.

## Migration Notes

- Add a new forward-only migration; do not edit deployed migrations. Deploy database changes before application code that reads the role. Exercise the previous Worker against the migrated database and preserve legacy invitation and sharing contracts.
- Old Workers will not expose collaborator controls after rollback; role grants persist at the database layer until a deliberate, separately reviewed privilege rollback. Do not remove role data destructively.
- Work from a clean branch based on `origin/master`; do not include parked image changes or other unrelated files. Reconcile image authorization as described in Phase 3.

## References

- Change brief: `context/changes/collaboration-mode/change.md`
- Existing model and RLS: `supabase/migrations/20260527125732_initial_wishlist_schema.sql`
- Confirmed invitation acceptance: `supabase/migrations/20260809190233_accept_invitation_rpc.sql`
- Read-only sharing: `supabase/migrations/20261017210751_list_share_links.sql`
- Existing invitation workflow: `src/lib/services/invitations.ts`, `src/components/lists/InviteDialog.tsx`, `src/components/lists/PendingInvitations.tsx`
- Parked image plan: `context/changes/add-image-to-list-items/plan.md`
- Team lessons: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Membership Roles and Database Authorization

#### Automated

- [x] 1.1 Apply migration with viewer defaults and legacy insert compatibility
- [x] 1.2 Pass authorization, role-change, reservation and sharing integration tests

#### Manual

- [x] 1.3 Verify owner-controlled collaborator permissions and restrictions

### Phase 2: Invitation and Role Management

#### Automated

- [ ] 2.1 Pass invitation role, acceptance and localized email tests
- [ ] 2.2 Pass localization parity

#### Manual

- [ ] 2.3 Verify invitation and role-management UX in Polish and English

### Phase 3: Collaborator Controls and End-to-End Regression

#### Automated

- [ ] 3.1 Pass collaborator UI, service and access-control regression tests
- [ ] 3.2 Pass full test suite, lint, type check and production build

#### Manual

- [ ] 3.3 Verify owner, collaborator and viewer permissions in separate sessions
- [ ] 3.4 Verify reservation privacy, localization and keyboard/mobile usability
