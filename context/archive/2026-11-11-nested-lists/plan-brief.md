# Personal list groups — Plan Brief

> Full plan: `context/changes/nested-lists/plan.md`

## What & Why

Organize existing wish lists under personal topics, such as Christmas, so a user can find lists for one occasion together.

## Starting Point

The dashboard shows owned and shared lists; each list already has independent access rules.

## Desired End State

Users can open a personal group to see its accessible lists, add the same list to multiple groups, and see group labels on list cards. Removing or deleting a group does not delete lists or change sharing.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Membership | Multiple groups per list | Topics behave like tags. |
| Visibility | Personal groups only | Organizing does not share content. |
| Presentation | Openable groups with labels on list cards | Supports browsing and at-a-glance context. |
| Legacy | Preserve list permissions, items and reservations | Grouping is independent of existing behavior. |

## Scope

**In scope:** Group CRUD, adding/removing accessible lists, dashboard labels, group view, localization and authorization tests.

**Out of scope:** Shared groups, nested groups, changes to invitations, reservations, items or public links.

## Architecture / Approach

Private groups and many-to-many associations are enforced by database policies; existing list RLS remains authoritative even if access is revoked later.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data and authorization | Private groups and list associations | Access or metadata leakage |
| 2. Dashboard and group views | Personal organization and navigation | Confusing controls or deleting lists accidentally |

**Prerequisites:** Local Supabase and test configuration for integration tests.

## Open Risks & Assumptions

- A group is independent of list sharing; a revoked shared list must disappear from the group.
- Deleting a group removes associations only, never the underlying lists.

## Success Criteria

- A user can organize and open owned and shared lists by topic.
- Group visibility is personal and never changes list access.
- Existing list and reservation flows continue to work.
