# Collaborative List Editing — Plan Brief

> Full plan: `context/changes/collaboration-mode/plan.md`

## What & Why

Owners can invite trusted people to help maintain a wish list without handing over its ownership or access controls. This extends the current read-and-reserve invitation model with an opt-in collaborator role.

## Starting Point

Accepted invitees can view and reserve items, but only owners can edit items or rename lists. Permissions are enforced by Supabase RLS as well as owner-only UI gates.

## Desired End State

Owners select viewer or collaborator when inviting someone and can change an existing member's role. Collaborators can manage items and rename the list, but cannot invite or remove people, manage share links, or delete the list.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Role storage | Role on existing invitation | Acceptance already establishes membership there. |
| Existing members | Default to viewer; owner can promote or demote | Existing access stays unchanged while current members can become collaborators. |
| Reservation behavior | Preserve each invitee's existing claim/release rights | Avoid silently removing existing capabilities or revealing other claimers. |
| Access control | Owner-only membership and share-link management | Sharing changes who can access the list. |
| Rename | Allow collaborators; prohibit delete and ownership transfer | Matches owner-like editing while preserving explicit restrictions. |
| Images | Coordinate separately if the parked image feature lands | Avoid bundling unfinished work while maintaining consistent permissions. |

These are planning assumptions, not additional user-confirmed decisions.

## Scope

**In scope:** invitation roles and role changes, database authorization, item CRUD, list rename, localized controls and regression tests.

**Out of scope:** multiple owners, new member-removal UI, public editing, reservation redesign, and implementation of parked image work.

## Architecture / Approach

Keep the existing confirmed-email invitation flow and add a role-aware membership predicate. Enforce mutations in Postgres; a narrow rename RPC and owner-only role-change RPC avoid granting broad list or invitation updates. The app reads the current member's capabilities and exposes matching controls.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Membership and authorization | Role migration, capability checks and security tests | Direct database requests escalating privileges |
| 2. Role management | Invite and manage viewer/collaborator roles | Confusing invitation or role changes |
| 3. Collaborator controls | Item CRUD, rename and end-to-end checks | Stale permissions and regressions in reservation privacy |

**Prerequisites:** clean branch from `origin/master`; local Supabase for integration tests.
**Estimated effort:** approximately 2–3 implementation sessions.

## Open Risks & Assumptions

- Collaborators retain their existing reservation rights; this is a conservative compatibility assumption.
- Role changes affect subsequent requests; already-running transactions may complete.
- The parked image work must use the same collaborator permissions if integrated later.
- Rolling back only the Worker does not revoke roles already granted in the database.

## Success Criteria

- An invited collaborator can manage items and rename the list, but cannot manage access or delete it.
- Existing viewers, reservations and anonymous share links retain their prior behavior.
- Permission checks hold for direct database/API requests, not only the UI.
