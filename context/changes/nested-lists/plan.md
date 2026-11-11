# Personal list groups Implementation Plan

## Overview

Organize existing owned and shared wish lists into personal topic groups such as Christmas. A list can appear in multiple groups; opening a group shows its accessible lists. Existing list, item, sharing, and reservation behavior remains unchanged.

## Current State Analysis

The dashboard combines owned and shared lists, with shared visibility enforced by list RLS (`src/lib/services/lists.ts`). List ownership, invitations, and reservations are independent of personal organization. There are no group entities today.

## Desired End State

Signed-in users can create, rename, and delete their own groups, add and remove accessible lists, open a group, and see group labels on dashboard lists. Deleting a group never deletes lists or claims. Group membership is private and grants no list access; if access is revoked, the list must no longer appear in the group. Empty groups remain visible.

## What We're NOT Doing

Shared groups, nested groups, changes to list membership, item grouping, recipient identities, reservation changes, or public link changes.

## Implementation Approach

Add private user-owned groups and many-to-many group/list associations with database-enforced ownership and accessible-list checks. Reuse the dashboard list presentation and localized actions. List access is always checked independently at read time, including after an invitation is revoked. Migration is additive and backward-compatible with the previous Worker.

## Phase 1: Data and authorization

### Changes Required:

- Add a migration for user-owned groups and associations, with granular RLS and indexes. Disallow associating an inaccessible list and leaking associations after access is revoked. Deleting a group deletes associations only.
- Add typed schemas, services, actions and real-database tests for owner isolation, accessible shared lists, revoked access, invalid IDs and non-destructive deletion.

### Success Criteria:

#### Automated Verification:

- Run focused unit and integration tests against local Supabase.
- Run lint and type checking.

#### Manual Verification:

- Verify personal groups do not grant other users access to lists.

## Phase 2: Dashboard and group views

### Changes Required:

- Display openable groups and group labels beside list names; retain existing dashboard list behavior.
- Provide create, rename, delete, add and remove controls and an empty-group state, using localized Polish and English strings.
- Ensure both owned and accessible shared lists can be organized, without destructive list operations.

### Success Criteria:

#### Automated Verification:

- Run unit tests, lint, type checking and production build.

#### Manual Verification:

- Create Christmas and another group, add an owned and a shared list, open both groups, remove a list and delete a group without deleting either list.
- Verify another account sees only its own groups and a revoked list is absent.

## Testing Strategy

Use focused unit tests for input validation and real Supabase integration tests for RLS and authorization. Follow `context/foundation/test-plan.md`. Run manual UX checks in both locales.

## Migration Notes

The migration adds only new tables and policies. Existing lists require no migration. A Worker rollback hides groups but leaves their data intact; it does not revert the migration.

## References

- `context/changes/nested-lists/change.md`
- `src/pages/dashboard.astro`
- `src/components/dashboard/DashboardLists.tsx`
- `src/lib/services/lists.ts`
- `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Data and authorization

#### Automated

- [x] 1.1 Run focused unit and integration tests against local Supabase.
- [x] 1.2 Run lint and type checking.

#### Manual

- [x] 1.3 Verify personal groups do not grant other users access to lists.

### Phase 2: Dashboard and group views

#### Automated

- [x] 2.1 Run unit tests, lint, type checking and production build.

#### Manual

- [x] 2.2 Create Christmas and another group, add an owned and a shared list, open both groups, remove a list and delete a group without deleting either list.
- [x] 2.3 Verify another account sees only its own groups and a revoked list is absent.
