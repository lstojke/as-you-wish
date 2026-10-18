# Add-item popup implementation plan

## Overview

Replace the inline add-item form below the list with an icon-only plus button after Invite in the owner toolbar. The button opens a responsive dialog containing the existing form; successful creation closes it and returns the owner to the updated list.

## Current State Analysis

- `src/components/lists/ListDetail.tsx:38-51` owns item and dialog state and derives owner visibility.
- The owner-only toolbar contains Share, Invite, and the list actions menu (`ListDetail.tsx:110-145`).
- `AddItemForm` currently appears below `ItemsList` (`ListDetail.tsx:147-172`).
- `src/components/lists/AddItemForm.tsx:12-18` accepts list ID, default currency, and optimistic add/replace/remove callbacks.
- Submission maps existing schema values, adds a placeholder, calls `actions.items.create`, rolls back errors, and replaces the placeholder on success (`AddItemForm.tsx:32-67`).
- `src/components/lists/InviteDialog.tsx:28-43` establishes a controlled-dialog contract and reset-on-open/close pattern.
- Shared dialog primitives already provide overlay, focus handling, and close controls (`src/components/ui/dialog.tsx:20-57`).
- The list detail remains a React-only island because of existing form hydration constraints (`src/pages/lists/[id].astro:62-74`).
- Existing tests cover wishlist schemas; there are no existing list/dialog component tests. This change does not introduce a frontend testing framework.

## Desired End State

An owner sees Share, Invite, an icon-only plus button, and the existing actions menu. The plus button has the accessible name and tooltip “Add item” and opens a titled dialog. The old inline form is absent, including on empty lists.

The dialog retains all existing fields, default currency, validation, creation action, optimistic list behavior, and notifications. Successful creation closes and resets it. Failed creation removes the optimistic placeholder but keeps entered values and visible errors for retry. Closing without submitting discards the draft. Reopening always starts clean.

Non-owners see neither the plus button nor the creation dialog. The popup works with keyboard navigation and on narrow or short screens.

### Key Discoveries

- `ListDetail.tsx:85-95` already provides the complete optimistic add/replace/remove contract; no backend change is needed.
- Existing controlled dialogs can be reused rather than introducing another modal system.
- `context/foundation/lessons.md`, “Modal form dialogs must reset on both open and close,” requires predictable reset transitions; use explicit empty values plus `defaultCurrency`.
- `ShareLinkDialog.tsx:15-21` provides a local precedent for controlled dialog ownership; its busy-state protection is relevant to submission dismissal.

## What We're NOT Doing

- Changing item fields, validation rules, HTTP(S) URL restrictions, action/service contracts, authorization, or database schema.
- Changing item editing, reservations, invitations, or sharing behavior.
- Retaining drafts, adding discard confirmation, or supporting repeated additions without reopening.
- Adding a mobile bottom sheet, global modal manager, dependencies, or frontend test framework.
- Changing the React island hydration strategy or redesigning the whole toolbar.

## Implementation Approach

Keep dialog ownership in `ListDetail`, alongside existing Share and Invite state. Extend `AddItemForm` with controlled `open` and `onOpenChange` props and compose the existing shadcn dialog primitives around its current form. Preserve its component name and existing creation callback contract; a separate wrapper is unnecessary for this single-use form.

Add the plus trigger after Invite and before the actions menu, within the existing owner-only toolbar. Replace the inline form placement with the controlled dialog in the owner-only dialog group. Reuse existing spacing, button, form, and dialog conventions.

## Critical Implementation Details

### Timing & lifecycle

Ignore all dismissal attempts while submission is pending, including Escape, overlay clicks, close icon, and Cancel. Use the actual submission lifecycle, not optimistic list presence, to gate dismissal; keep success-driven closure possible after the action resolves.

### State sequencing

On success, replace the optimistic placeholder before requesting closure. On failure, remove only that submission's placeholder and leave form values/errors intact. Reset explicitly to empty title, price, and link plus `defaultCurrency` on open and close; do not reset merely because a failed request settled.

### User experience spec

Use a visible dialog title and appropriate description. Because the toolbar trigger and dialog are composed in different places, verify focus returns to the plus button on every dismissal; do not assume a controlled `open` prop alone establishes a Radix trigger relationship. Bound dialog height to the viewport and allow content scrolling without making fields or actions unreachable.

## Phase 1: Move item creation into an owner-toolbar dialog

### Overview

Deliver the complete placement change and modal lifecycle in one small, independently reviewable UI change.

### Changes Required

#### 1. Owner toolbar and dialog wiring

**File**: `src/components/lists/ListDetail.tsx`

**Intent**: Make creation available next to Share and Invite, removing the inline form without changing list updates or owner permissions.

**Contract**: Add controlled add-dialog state; render an accessible icon-only plus button after Invite; supply `open`/`onOpenChange` to `AddItemForm` and retain `listId`, `defaultCurrency`, and all three optimistic callbacks. Both trigger and dialog remain owner-only. Existing Share, Invite, list menu, and item rendering keep their behavior.

#### 2. Dialog form lifecycle

**File**: `src/components/lists/AddItemForm.tsx`

**Intent**: Present the existing form inside the standard dialog, with reliable reset, dismissal, retry, and successful-close behavior.

**Contract**: Extend props with `open: boolean` and `onOpenChange: (open: boolean) => void`. Reuse `ItemFormFields`, existing schema/mapping, action, notifications, and optimistic callbacks. Reset on both transitions, reject pending dismissal through every control, close only on success, and preserve input/error state after failures. Include a Cancel action, accessible title/description, pending submit state, focus restoration, and viewport-safe scrolling.

#### 3. Regression coverage

**Files**: Existing wishlist schema tests and the two changed components

**Intent**: Confirm the existing data contract stays intact and verify the new interaction using the repository's current tooling.

**Contract**: Run existing schema tests without modifying them unless a genuinely changed contract requires it (none is planned). Exercise modal behavior manually because the repository has no component-test harness. Do not claim schema tests cover modal lifecycle or access visibility.

### Success Criteria

#### Automated Verification

- Wishlist schema tests pass: `npm run test:unit -- src/lib/schemas/wishlist.test.ts`.
- Lint passes for changed components: `npx eslint src/components/lists/ListDetail.tsx src/components/lists/AddItemForm.tsx`.
- Astro sync and type checking pass: `npx astro sync && npx astro check`.
- Production build passes with the existing required environment configuration: `npm run build`.

#### Manual Verification

- Owner sees an accessible plus button after Invite; inline creation is absent on both empty and populated lists; non-owner sees no creation controls.
- Opening focuses the dialog appropriately; Tab stays inside it; Escape, overlay, close icon, and Cancel dismiss when idle and restore focus to the plus button.
- Closing a dirty or invalid form and reopening clears all values and errors while restoring the configured default currency.
- Successful creation shows one real item, closes the dialog, preserves the success notification, and reopens with clean defaults.
- Failed creation removes its placeholder, retains the entered values and relevant errors/notification, stays open, and allows a successful retry.
- During a delayed submission, repeat submit and every dismissal path are blocked; after settlement the form is usable or closed as appropriate.
- At 320px width and in a short viewport or with a mobile keyboard, toolbar controls, dialog fields, validation errors, and actions remain reachable without horizontal overflow.
- Share, Invite, list menu, editing, and reservation interactions still behave as before.

**Implementation Note**: After automated verification, pause for human confirmation of the manual checklist before treating this phase as complete.

## Testing Strategy

### Automated

Use the targeted schema suite for unchanged validation, focused ESLint for the edited files, Astro checking for component/prop compatibility, and the production build for Cloudflare integration. Required build environment values must come from existing local configuration, not committed fixtures or production-side changes.

### Manual

Use owner and non-owner sessions and both empty/populated lists. Cover every Phase 1 manual criterion; use browser network throttling to observe pending behavior and a controlled failed request to verify rollback/retry without altering production data. Check keyboard-only operation and narrow/short viewport scrolling separately.

## Performance Considerations

Reuse existing dialog and form dependencies. Opening must not create additional data requests, remount the entire list, or change existing item-fetch behavior. Preserve the current optimistic responsiveness.

## Migration Notes

No database, data, environment, or API migration is needed. Reverting the UI change restores inline placement without data conversion. No deployment is part of this planning task.

## References

- Intent: `context/changes/refactor-adding-item/change.md`
- List composition and owner toolbar: `src/components/lists/ListDetail.tsx:38-51,85-95,110-172`
- Creation flow: `src/components/lists/AddItemForm.tsx:12-67`
- Form dialog precedent: `src/components/lists/InviteDialog.tsx:28-43,69-71`
- Shared dialog primitives: `src/components/ui/dialog.tsx:20-57`
- Island constraint: `src/pages/lists/[id].astro:62-74`
- Existing schema tests: `src/lib/schemas/wishlist.test.ts`
- Modal reset and URL rules: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Move item creation into an owner-toolbar dialog

#### Automated

- [x] 1.1 Wishlist schema tests pass: `npm run test:unit -- src/lib/schemas/wishlist.test.ts`. — 59ce6d7
- [x] 1.2 Lint passes for changed components: `npx eslint src/components/lists/ListDetail.tsx src/components/lists/AddItemForm.tsx`. — 59ce6d7
- [x] 1.3 Astro sync and type checking pass: `npx astro sync && npx astro check`. — 59ce6d7
- [x] 1.4 Production build passes with the existing required environment configuration: `npm run build`. — 59ce6d7

#### Manual

- [x] 1.5 Owner sees an accessible plus button after Invite; inline creation is absent on both empty and populated lists; non-owner sees no creation controls. — 59ce6d7
- [x] 1.6 Opening focuses the dialog appropriately; Tab stays inside it; Escape, overlay, close icon, and Cancel dismiss when idle and restore focus to the plus button. — 59ce6d7
- [x] 1.7 Closing a dirty or invalid form and reopening clears all values and errors while restoring the configured default currency. — 59ce6d7
- [x] 1.8 Successful creation shows one real item, closes the dialog, preserves the success notification, and reopens with clean defaults. — 59ce6d7
- [x] 1.9 Failed creation removes its placeholder, retains the entered values and relevant errors/notification, stays open, and allows a successful retry. — 59ce6d7
- [x] 1.10 During a delayed submission, repeat submit and every dismissal path are blocked; after settlement the form is usable or closed as appropriate. — 59ce6d7
- [x] 1.11 At 320px width and in a short viewport or with a mobile keyboard, toolbar controls, dialog fields, validation errors, and actions remain reachable without horizontal overflow. — 59ce6d7
- [x] 1.12 Share, Invite, list menu, editing, and reservation interactions still behave as before. — 59ce6d7
