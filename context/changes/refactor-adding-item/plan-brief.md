# Add-item popup — Plan brief

> Full plan: `context/changes/refactor-adding-item/plan.md`

## What & Why

Move item creation out of the inline section below the list into a popup.
An icon-only plus button beside Share and Invite makes creation available in the owner toolbar without keeping the full form on the page.

## Starting Point

`ListDetail` currently renders `AddItemForm` below the items.
The form already handles validation, optimistic additions, rollback, server replacement, and notifications; existing dialogs provide the presentation pattern.

## Desired End State

Owners open a responsive dialog using the plus button after Invite.
Successful creation closes the popup and leaves the new item in the list.
Non-owners have no creation controls, and the old inline placement is removed.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Entry point | Icon-only plus after Invite, before list menu | Compact placement alongside existing toolbar actions |
| Success | Close and reset | Return directly to the updated list |
| Idle dismissal | Discard draft without confirmation | Simple, predictable reopening |
| Pending submission | Block all dismissal and repeat submits | Avoid confusing in-flight lifecycle changes |
| Failure | Keep popup and inputs; roll back placeholder | Preserve the existing retry and error experience |
| Mobile | Same responsive dialog with scrolling | Reuse established presentation instead of adding a sheet |
| Structure | Extend existing form with controlled dialog props | Avoid a wrapper abstraction for a single-use form |
| Coverage | Existing automated tools plus manual UI checks | No existing component-test harness |

## Scope

**In scope:** Toolbar trigger, removal of inline placement, dialog lifecycle,
clean default currency, keyboard/focus behavior, responsive scrolling,
and preservation of existing creation behavior.

**Out of scope:** Backend/schema changes, new fields, draft persistence,
batch-entry mode, mobile bottom sheet, new dependencies, and unrelated UI redesign.

## Architecture / Approach

`ListDetail` owns dialog visibility and retains its existing optimistic callbacks.
`AddItemForm` gains controlled open/change props and uses shared dialog primitives
around the existing fields and submission logic. Owner-only mounting is preserved.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Owner-toolbar creation dialog | Complete placement and lifecycle change | Pending dismissal, reset timing, and trigger focus restoration |

**Prerequisites:** Existing dependencies and local build environment; owner/non-owner sessions for manual verification.
**Estimated effort:** One small implementation session plus manual acceptance.

## Open Risks & Assumptions

- Browser checks are needed for focus restoration and mobile keyboard/scroll behavior.
- Current action, validation, authorization, and optimistic contracts remain unchanged.
- Pending dismissal protection must include Escape, overlay, close icon, and Cancel.

## Success Criteria (Summary)

- Owners can add an item from the plus button; no inline form or non-owner creation controls remain.
- Success closes cleanly; failures preserve inputs; reopening restores empty fields and default currency.
- Keyboard/mobile interaction works, and sharing, invitations, and item actions remain unchanged.
