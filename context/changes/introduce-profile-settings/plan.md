# Profile Settings and Important Dates Implementation Plan

## Overview

Extend the existing protected settings page with optional private first/last names, a language preference alongside currency, and important-date management. Keep email/password signup unchanged: the user explicitly withdrew the original username requirement during planning.

Source of truth for requirements: [change and planning decisions](./change.md). Codebase baseline: [research](./research.md), commit `8835624f78b8906b2cdb1d5fbfc7e899ae78787f`. The research's open questions are superseded by the decisions below.

## Current State Analysis

- [Settings](../../../src/pages/settings.astro) renders only [CurrencySettingsForm](../../../src/components/settings/CurrencySettingsForm.tsx), using a client-only React island.
- [Profile services](../../../src/lib/services/profiles.ts) read/write currency and language. [Profile actions](../../../src/actions/index.ts) validate currency writes and surface localized errors.
- [Profiles migration](../../../supabase/migrations/20261017214127_add_profiles_default_currency.sql) provisions rows via an Auth trigger and applies self-only RLS. Names and important dates do not exist.
- [Middleware](../../../src/middleware.ts) resolves valid locale cookie before stored language, then Polish. [Locale endpoint](../../../src/pages/api/locale.ts) sets the cookie and best-effort persists language.
- [Header](../../../src/components/AppHeader.astro) and [profile menu](../../../src/components/ProfileMenu.tsx) use email for identity; the menu already includes language controls.
- [Profile integration tests](../../../tests/integration/profiles.test.ts) cover provisioning, preference ownership, and currency behavior. [Vitest](../../../vitest.config.ts) provides Node unit/integration projects, not browser component tests.
- Repository lessons require explicit service failure propagation and symmetric modal resets. Existing profile rows and Auth fixtures need no identity backfill after removal of usernames.

## Desired End State

### Profile

- `/settings` remains the only account-settings route and uses the existing middleware guard.
- Read-only email comes from the authenticated Auth user, never a duplicated profile column.
- Optional first/last names accept Unicode, trim surrounding whitespace, allow up to 100 characters each, and clear to null when blank. Either field may be supplied alone.
- The header identifies the owner using the available trimmed name parts, falling back to email when both are empty; avatar initial follows that identity. Email remains available in the menu as account identification.
- Names saved in settings appear in the header on the next SSR navigation; no forced reload is required for profile saves.

### Preferences

- Currency options remain PLN/EUR/USD/GBP; existing defaults and item-currency behavior remain unchanged.
- Language options remain PL/EN. Initialize settings language from the effective request locale, so its selected value matches the page currently displayed.
- A separate preference Save persists currency and language together in one profile update. Only after persistence succeeds does it update the locale cookie; a changed language triggers a full navigation to `/settings`.
- An unchanged effective language does not require navigation. A successful save still synchronizes its stored value and cookie.
- Preference save is blocked, with an explicit localized explanation, while the profile form or an add/edit-date form is dirty. In-flight operations also prevent conflicting saves.
- Hide the header's language controls on `/settings`; retain the existing controls/endpoint behavior on other pages. This avoids a second language-change path bypassing the settings dirty-state guard.

### Important dates

- All entries are private to the account owner. The collection can be empty.
- Every entry stores an ID, owner, original full calendar date, heading, optional description, repeat frequency, and timestamps.
- Heading: required, trimmed, 1-100 characters. Description: optional, trimmed, up to 1000 characters, blank becomes null.
- Date: required valid `YYYY-MM-DD` calendar date, including year, without a time or timezone. Support four-digit positive years; reject impossible dates rather than normalizing them. Past/future dates and duplicate entries are allowed.
- Frequencies: `none`, `weekly`, `monthly`, `yearly`; render `none` as Off. New entries default to Yearly in both validation/UI and database.
- Repetition is metadata in this change. Store/display the original date and frequency, not a computed next occurrence.
- The documented future occurrence contract is anchored to the original date: monthly/yearly missing days use the last day of the intended month. January 31 becomes February 28/29 and then March 31; February 29 becomes February 28 in non-leap years and returns to February 29 in leap years.
- Show localized help explaining that fallback. Do not shift the stored original date when frequency changes.
- Provide independent add/edit/delete, with confirmation for deletion, meaningful empty state, and birthday/anniversary heading suggestions. Suggestions are optional shortcuts for heading text, not pre-created records or special date types.
- Display entries by original date ascending, then ID for stable ties; do not describe that ordering as upcoming occurrences.
- No arbitrary product-level collection cap is introduced; existing server payload limits still apply.

### Key Discoveries

- [Profile provisioning:33](../../../supabase/migrations/20261017214127_add_profiles_default_currency.sql#L33) inserts only ID: nullable name columns preserve old signup/Worker compatibility without trigger changes.
- [Profile service:24](../../../src/lib/services/profiles.ts#L24) uses returned-row checks for currency writes; new writes should retain explicit missing-row detection.
- [Locale endpoint:9](../../../src/pages/api/locale.ts#L9) currently uses cookie-first/best-effort persistence. Settings requires a distinct strict save boundary; do not silently redefine the existing endpoint.
- [Settings island:27](../../../src/pages/settings.astro#L27) already uses client-only hydration for React/Radix. A single settings island can coordinate dirty state without a global store.
- [Profile tests:103](../../../tests/integration/profiles.test.ts#L103) cover item currency preservation and must remain green.

## What We're NOT Doing

- Usernames, unique handles, username signin, generated account labels, or completion/backfill flows.
- Passwordless authentication, signup redesign, email editing, or password-management changes.
- Public profiles, exposing names/dates to invitees, or changes to invitation addressing/authorization.
- Reminders, notification consent, scheduling, email delivery, timezone preferences, or occurrence execution. These belong to the separate future feature `notifications-introduction`; do not create that feature's change folder or infrastructure here.
- Next-occurrence calculation, upcoming-event sorting, age calculation, deduplication, predefined date categories, or automatically inserted birthday records.
- A new route, global client state store, React test framework, E2E tooling, calendar library, or custom date-picker framework.
- Unrelated repairs to the legacy locale endpoint, signup validation, documentation, or archived artifacts.

## Implementation Approach

Use additive database changes, shared Zod schemas, authenticated services, and Astro actions following current conventions. Keep profile edits and preferences separate; use a single preference update for currency/language, and independent date operations.

Replace the currency-only island with one settings root containing distinct forms. Its local state coordinates dirty/submitting flags and prevents reload-driven data loss. Preserve client-only hydration and one root i18n provider.

Reuse shadcn form/input/select/dialog/alert-dialog primitives. Use a native date input unless the existing stack reveals an accessibility requirement it cannot meet; add textarea through the shadcn CLI, not a hand-written equivalent.

Do not implement recurrence scheduling solely to test a future notification feature. Verify stored frequency/defaults, original-date preservation, and precise fallback help text now.

## Critical Implementation Details

### State sequencing

Preference persistence must succeed before setting the cookie or navigating. Reset the saved form baseline before successful navigation, and recheck other forms' dirty state at submission, not only through a disabled button. Serialize settings mutations or disable competing edits while saving so a dirty-state check cannot race a new edit before reload.

### Timing and lifecycle

Keep name saves in-place; the header reflects them on the next SSR request. Hiding its language controls only on settings prevents the existing independent POST form from discarding settings drafts.

### Calendar-date representation

Keep the original date as a calendar string throughout storage and transport. Localized display must not convert it through a timezone-sensitive instant that moves the day. Missing-day fallback is a documented future scheduling contract, not a reason to mutate the saved anchor.

## Phase 1: Private Storage and Validation Contracts

### Overview

Add compatible profile fields and owner-scoped important dates, with shared validation/types and database-level ownership coverage.

### Changes Required

#### 1. Additive schema migration

**Files**: New timestamped SQL migration under [migrations](../../../supabase/migrations/).

**Intent**: Store optional names and important-date records without affecting existing accounts, signup, currency, or language defaults.

**Contract**: Add nullable `first_name`/`last_name` to profiles with length/nonblank-if-present checks. Add `profile_important_dates` with UUID primary key/default, `profile_id` referencing profiles with delete cascade, SQL `date`, heading, nullable description, checked text `repeat_frequency` defaulting to `yearly`, and created/updated timestamps. Enforce field lengths/nonblank stored text and the supported date range; reuse the timestamp trigger. Index owner/date/ID for the settings query. Enable RLS with separate authenticated select/insert/update/delete policies; use ownership in both update predicates and checks. Do not permit anonymous access or ownership transfer to another user.

#### 2. Shared input schemas and types

**Files**: New [schemas](../../../src/lib/schemas/) `profile.ts`, `important-dates.ts`, and adjacent `.test.ts` files; [shared types](../../../src/types.ts); [generated types](../../../src/db/database.types.ts).

**Intent**: Make normalized fields, valid calendar dates, and repeat defaults consistent at the client/server boundary.

**Contract**: Define distinct profile-details, preference, create-date, update-date, and delete-date schemas. Compose existing currency/locale definitions rather than duplicating allowed values. Mutation inputs never accept owner ID. Validate row IDs, lengths, real dates, and repeat values; use translation-key messages. Shared DTOs live in the shared types file and database types are regenerated after local migration. Preserve the existing currency-only schema/API for current callers.

#### 3. Database integration coverage

**Files**: [Profile tests](../../../tests/integration/profiles.test.ts); new `tests/integration/profile-important-dates.test.ts`.

**Intent**: Prove new private data remains self-only and additive storage preserves current behavior.

**Contract**: Test nullable names/defaults, owner CRUD, cross-user and anonymous denial for every date operation, forbidden owner reassignment, invalid fields/frequencies/dates, duplicate allowance, Yearly database default, and cascade cleanup. Keep existing fixture creation without username metadata. Use independent users and deterministic cleanup per test.

### Success Criteria

#### Automated Verification

- Local migration applies without resetting data: `npx supabase migration up --local`.
- Schema tests pass: `npx vitest run --project unit src/lib/schemas/profile.test.ts src/lib/schemas/important-dates.test.ts`.
- Storage ownership/default/regression tests pass: `npx vitest run --project integration tests/integration/profiles.test.ts tests/integration/profile-important-dates.test.ts`.

#### Manual Verification

- On a disposable local stack with a pre-migration account, names are initially empty, currency/language remain unchanged, and existing signup provisions a usable profile without extra inputs.

**Implementation gate**: After automated checks pass, pause for human confirmation of the manual criterion before Phase 2. Canonical checkbox state is in Progress below.

## Phase 2: Profile and Preference Settings

### Overview

Deliver private name editing, strict preference saving, and header personalization without losing unsaved drafts.

### Changes Required

#### 1. Services and actions

**Files**: [Profile services](../../../src/lib/services/profiles.ts), [actions](../../../src/actions/index.ts), and focused service tests.

**Intent**: Read current profile data and provide separate, authenticated details/preferences saves.

**Contract**: Add own-profile read, details update, and atomic preferences update; derive identity from authenticated context, not client input. Return saved values and fail explicitly on missing rows. Add `profile.updateDetails` and `profile.updatePreferences` actions using the new schemas. After preferences persistence, call existing [cookie helper](../../../src/lib/i18n/cookie.ts); return enough typed information for deliberate reload behavior. Retain `updateCurrency`, currency services, and existing language endpoint semantics for other callers. Log operation failures without names, email, descriptions, or raw request bodies; surface localized errors.

#### 2. Coordinated settings island

**Files**: [Settings page](../../../src/pages/settings.astro); new `src/components/settings/ProfileSettings.tsx`, `ProfileDetailsForm.tsx`, `PreferencesSettingsForm.tsx`; [currency form](../../../src/components/settings/CurrencySettingsForm.tsx).

**Intent**: Replace the rendered currency-only form with coherent account sections, keeping reusable existing conventions.

**Contract**: SSR loads own profile and Auth email, then mounts one client-only root. Separate details/preferences forms expose dirty/submitting state to the root; only successful saves reset their baselines. Explicit Discard restores saved values. Root coordinates mutation locking and blocks preference save when other sections are dirty. Failed requests retain edits and never trigger success feedback/navigation. Language begins at effective SSR locale. Changed language reloads only after successful save/cookie synchronization; unchanged language saves in place. Existing currency form must not remain as a duplicate live preferences control.

#### 3. Header identity and language control

**Files**: [Header](../../../src/components/AppHeader.astro), [profile menu](../../../src/components/ProfileMenu.tsx); optional small pure name-formatting helper and tests under [lib](../../../src/lib/).

**Intent**: Display the signed-in owner's chosen name and prevent a duplicate language control bypassing settings safeguards.

**Contract**: Load only the authenticated owner's necessary name fields, derive display label/initial with email fallback for legitimately empty names, and retain email identification. An actual profile query failure must be logged/surfaced rather than disguised as an empty profile. Allow the settings page to hide menu language controls while preserving default behavior elsewhere; do not remove signout/settings navigation.

#### 4. Localization and regression tests

**Files**: [PL](../../../src/lib/i18n/pl.ts), [EN](../../../src/lib/i18n/en.ts), [profile integration tests](../../../tests/integration/profiles.test.ts), profile service tests.

**Intent**: Cover strict writes and provide localized labels, validation, save/discard, blocked-save explanation, and feedback.

**Contract**: Test details normalization/clearing, unchanged currency compatibility, strict one-row preference update, atomic currency/language persistence, and write failures. Extract testable business logic where needed without introducing another service error convention. Node unit tests must not depend on unresolved Astro virtual modules.

### Success Criteria

#### Automated Verification

- Profile schema/service/display-name and dictionary unit tests pass using one targeted Vitest unit invocation.
- Profile integration tests, including atomic preference saves and existing item-currency behavior, pass: `npx vitest run --project integration tests/integration/profiles.test.ts`.
- Types and targeted lint pass: `npx astro sync`, `npx astro check`, and ESLint on changed TypeScript/TSX/Astro files.

#### Manual Verification

- Save Unicode first/last names separately, clear them, and navigate: the header shows the available names or email; account email remains read-only.
- Change currency/language and save: persisted values survive reload, PL/EN content and document language agree, and current item-currency defaults/preservation remain correct.
- Dirty profile edits block preference save with an explanation; save/discard releases the block. An induced save failure preserves edits and the existing cookie/locale.

**Implementation gate**: After automated checks pass, pause for human confirmation of the manual criteria before Phase 3.

## Phase 3: Important-Date Experience and Final Verification

### Overview

Complete independently saved date management, precise repeat messaging, and end-to-end manual acceptance of the combined settings experience.

### Changes Required

#### 1. Date services and actions

**Files**: New `src/lib/services/important-dates.ts`; [actions](../../../src/actions/index.ts); focused service tests.

**Intent**: Expose owner-scoped list/create/update/delete operations with explicit failure reporting.

**Contract**: Derive owner server-side, retain RLS, order by original date then ID, and require returned affected rows for mutations. Nonexistent/inaccessible update/delete targets must not appear successful. Return typed saved data to reconcile the UI without reloading other dirty sections. Use validated recurrence defaults and preserve original date unless the user edits it. No service-role bypass or new recurrence scheduler.

#### 2. Date section, forms, and confirmation

**Files**: New `src/components/settings/ImportantDatesSection.tsx`, `ImportantDateDialog.tsx`, `DeleteImportantDateDialog.tsx`; settings root/page; needed shadcn UI installed via CLI.

**Intent**: Let owners manage optional date entries while understanding recurrence and retaining unsaved work.

**Contract**: Render empty/list states, accessible native date input, heading/description fields, repeat select defaulting Yearly, optional birthday/anniversary heading shortcuts, and localized anchor/fallback help. Render original dates without timezone shift; label frequency, not a fictitious next event. Add/edit dialogs seed on open and clear on close; use deliberate Cancel/Discard to drop edits, and prevent implicit closing of a dirty dialog without confirmation. Delete requires confirmation; failed operations retain the dialog and show an error. Coordinate dirty/in-flight state with the root preference guard. Reconcile successful operations from returned rows and stable ordering, preserving other section drafts.

#### 3. Localization, tests, and feature handoff

**Files**: Dictionaries; date schema/service tests; [profile/date integration tests](../../../tests/integration/); directly related [README](../../../README.md) sections.

**Intent**: Verify persistence, privacy, defaults, and error handling, and make the absence of reminders explicit.

**Contract**: Document the new settings fields and recurrence metadata. State that scheduled reminders are deferred to `notifications-introduction`, whose contract must retain the immutable anchor and last-valid-day fallback. Do not add notification infrastructure or a next-occurrence engine here. Cover create/edit/delete, optional/cleared description, every repeat choice, Yearly default, original-date preservation across repeat changes, duplicate allowance, and explicit inaccessible-target failures.

### Success Criteria

#### Automated Verification

- Targeted profile/date schema, service, display, and dictionary unit tests pass in one Vitest unit invocation.
- Related integration tests pass: `npx vitest run --project integration tests/integration/profiles.test.ts tests/integration/profile-important-dates.test.ts`.
- Final lint/type/build checks pass: `npm run lint`, `npx astro sync`, `npx astro check`, `npm run build` with the documented local build environment.

#### Manual Verification

- Add birthday/anniversary examples and custom dates, omit/clear descriptions, change all repeat choices, edit, cancel/discard, delete, and reload; saved records remain correct and duplicate dates/headings are allowed.
- January 31 and February 29 retain their original stored dates, default to Yearly, and show precise last-valid-day fallback help; no reminders or computed upcoming dates are claimed.
- Unsaved add/edit-date drafts block preference save; cancellation clears the block, successful/failed mutations do not erase unrelated profile edits, and re-opened dialogs contain the correct defaults/target.
- In PL and EN on mobile/desktop, keyboard navigation, labels, validation, empty state, confirmation, loading state, and error feedback remain usable; a second user cannot view or mutate another user's dates.

**Implementation gate**: After automated checks pass, pause for human acceptance. Do not mark manual rows complete based solely on automated tests.

## Testing Strategy

### Unit tests

Use the existing Node Vitest project for pure schemas, service adapters with typed client mocks, name/date display helpers, and i18n keys. Test blank normalization, boundary lengths, invalid input types, valid leap-day versus February 30, all repeat choices/default, no date drift in formatting, and error propagation.

Do not introduce browser test tooling for this change. Astro action/cookie integration and the actual dirty-state/navigation UI require the manual checks unless the implementer can use existing runtime-aware facilities without adding a new framework. Never present service tests as proof of browser behavior.

### Integration tests

Use local Supabase with real authenticated/anonymous clients. Prove every CRUD ownership boundary, ownership-transfer rejection, SQL constraints/defaults/cascade, atomic preference updates, and existing currency compatibility. Service update/delete tests must distinguish a filtered zero-row operation from a saved mutation.

Test users remain independent and are cleaned up by Auth deletion. Never reset a shared database to run these tests; apply migrations to a disposable local stack. Use a pre-migration fixture on a disposable instance for backward-compatibility checks.

### Manual testing sequence

1. Open `/settings` authenticated and anonymous; verify existing protection.
2. Save/clear names and navigate to verify header identity.
3. Dirty one section, attempt preference save, resolve via Save/Discard, then change language and inspect actual cookie, document language, and stored preferences.
4. Exercise independent dates CRUD with optional descriptions and all frequencies.
5. Check January 31/February 29 anchors and fallback messaging, without implying scheduling exists.
6. Induce a failed save, confirm no success/navigation, and verify drafts survive.
7. Repeat key flows in both locales, keyboard-only and narrow viewport; repeat ownership checks with two accounts.

## Performance Considerations

Load the owner's profile/date collection only for settings; do not attach the date collection to middleware or every page. Header reads only name fields, never dates. Use the owner/date/ID index for the settings query and avoid duplicate profile reads within the settings request where a loaded value can be passed.

No cross-request secret/profile cache or recurrence expansion is needed. A single root coordinates local forms without a global store. This plan does not promise a latency/collection-size threshold unsupported by measurements.

## Migration Notes

Use a new additive timestamped migration, not edits to applied migrations. Existing profile rows receive null names; no username backfill or Auth trigger change is required.

Apply to the disposable local stack before generating database types and running integration checks. Production migration must precede deployment of code selecting new columns. Never apply remote migrations or deploy production without the required human approval.

Previous Worker versions remain compatible with added nullable columns and the new table. Rolling back the Worker does not roll back data or schema; leave additions in place. Existing currency/language APIs remain callable, including the previous locale endpoint.

## References

- [Change and user decisions](./change.md)
- [Codebase research and permanent source references](./research.md)
- [Profile provisioning and RLS](../../../supabase/migrations/20261017214127_add_profiles_default_currency.sql)
- [Existing settings form](../../../src/components/settings/CurrencySettingsForm.tsx)
- [Actions and error boundary](../../../src/actions/index.ts)
- [Locale cookie helper](../../../src/lib/i18n/cookie.ts)
- [Profile integration tests](../../../tests/integration/profiles.test.ts)
- [Repository lessons](../../foundation/lessons.md)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append a closing commit SHA when a step lands. Do not rename step titles.

### Phase 1: Private Storage and Validation Contracts

#### Automated

- [x] 1.1 Local migration applies without resetting data. — 574d738
- [x] 1.2 Schema tests pass. — 574d738
- [x] 1.3 Storage ownership/default/regression tests pass. — 574d738

#### Manual

- [x] 1.4 Pre-migration account preferences and existing signup remain compatible. — 574d738

### Phase 2: Profile and Preference Settings

#### Automated

- [x] 2.1 Profile schema/service/display-name and dictionary unit tests pass.
- [x] 2.2 Profile integration tests including atomic preferences and item-currency behavior pass.
- [x] 2.3 Types and targeted lint pass.

#### Manual

- [x] 2.4 Name save/clear and header fallback work with read-only email.
- [x] 2.5 Currency/language saves synchronize persisted preferences and page locale.
- [x] 2.6 Dirty-profile guard and failed preference saves preserve edits and locale.

### Phase 3: Important-Date Experience and Final Verification

#### Automated

- [x] 3.1 Targeted profile/date schema, service, display, and dictionary unit tests pass.
- [x] 3.2 Related profile/date integration tests pass.
- [x] 3.3 Final lint/type/build checks pass.

#### Manual

- [x] 3.4 Date CRUD, optional descriptions, repeat choices, duplicates, and reload persistence work.
- [x] 3.5 Original calendar anchors and fallback help remain accurate without reminder claims.
- [x] 3.6 Dirty-date guard, dialog resets, and unrelated drafts remain correct.
- [x] 3.7 PL/EN accessibility, responsive UX, errors, and cross-user privacy are accepted.
