---
date: 2026-10-19T20:29:04+02:00
researcher: Copilot
git_commit: 8835624f78b8906b2cdb1d5fbfc7e899ae78787f
branch: master
repository: lstojke/as-you-wish
topic: "Profile settings, required registration usernames, and important dates"
tags: [research, codebase, profiles, auth, settings, i18n, important-dates]
status: complete
last_updated: 2026-10-19
last_updated_by: Copilot
---

# Research: Profile settings, required registration usernames, and important dates

**Date**: 2026-10-19T20:29:04+02:00  
**Researcher**: Copilot  
**Git Commit**: 8835624f78b8906b2cdb1d5fbfc7e899ae78787f  
**Branch**: master  
**Repository**: lstojke/as-you-wish

## Research Question

Research the existing implementation and integration points for this intent:

> To profile placeholder add actual content. During registration process require username. In the settings apart from currency add language preference selection, name, surname and important dates (suggest for example birthday or anniveraries) - important date entity should contain date, heading and description. username and email address are the only compulsory fields.

Source: [change identity and intent](./change.md).

## Summary

- The existing account surface is the header profile menu plus `/settings`, not a separate profile page. Settings already implements currency editing; the menu shows email and a language switch.
- `profiles` already stores currency and language, but no username, first name, surname, or important dates. Email belongs to Supabase Auth.
- Registration currently collects email, password, and password confirmation. The server forwards only email/password to Supabase. A database trigger creates the profile using only the Auth user ID.
- Required usernames therefore touch both registration boundaries and profile provisioning, including existing-user backfill and administrative test-user creation. Uniqueness, normalization, editability, and legacy-account handling are not yet specified.
- Language switching is already implemented. The effective locale is cookie first, then profile, then Polish. A database-only language update would not change a browser with a valid existing cookie.
- Important dates have no existing model, UI, validation, or tests. Recurrence/year semantics, privacy, and validation of each entry need decisions before implementation.
- Existing currency form, action, service, localization, and ownership-testing patterns provide reusable foundations. No application implementation was changed during this research.

## Evidence and Scope

Two parallel read-only research threads examined profile/registration/storage and settings/localization/UI. Findings describe executable code and migration files in this checkout, not verified production database state.

The checkout was on `master` at the commit above. Unrelated local modifications were present and left untouched. Source references below use commit-pinned GitHub links; local change documents remain relative links.

Tests were inspected, not executed. This is codebase research, not a runtime, security-audit, or deployment-verification result.

## Detailed Findings

### 1. Profile storage, provisioning, and ownership

The original [profile migration](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/supabase/migrations/20261017214127_add_profiles_default_currency.sql#L4) defines:

| Field | Existing contract |
| --- | --- |
| `id` | UUID primary key referencing `auth.users(id)`, cascading on user deletion |
| `default_currency` | Required `char(3)`, defaults to PLN, checks three uppercase letters |
| `created_at`, `updated_at` | Required timestamps, default to `now()` |
| `language` | Added subsequently; required text, defaults to `pl`, restricted to `pl`/`en` |

Language is defined in the [language migration](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/supabase/migrations/20261018000000_add_profiles_language.sql#L4). There are no current profile columns for email, username, name, or surname, and no important-date table.

The [provisioning trigger and backfill](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/supabase/migrations/20261017214127_add_profiles_default_currency.sql#L33) work as follows:

1. An Auth account is inserted.
2. `on_auth_user_created` invokes `public.handle_new_user()`.
3. The function inserts only the ID into `profiles`; column defaults supply currency and language.
4. The original migration also backfills profiles for existing Auth users.

The function is `SECURITY DEFINER`, fixes its search path, and revokes direct execution from public/application roles. Profile timestamp updates reuse the existing [timestamp trigger function](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/supabase/migrations/20260527125732_initial_wishlist_schema.sql#L73).

[Profile RLS](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/supabase/migrations/20261017214127_add_profiles_default_currency.sql#L15) permits authenticated users to select, insert, and update only their own row. Updates check ownership of both existing and resulting rows. No anonymous or delete policy is defined there.

Integration implications:

- New columns inherit the existing self-only row policies, not field-specific edit restrictions.
- Public username/name display cannot assume arbitrary cross-user profile reads are allowed.
- A new important-date table needs its own granular ownership policies; profile policies do not propagate to another table.
- Required username provisioning must account for both historical users and every account-creation path, not just the visible signup form.

The [generated profile type](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/db/database.types.ts#L148) exposes the five current fields. Insert requires only ID; update fields are optional. Currency/language are generated as strings, so application schemas supply narrower types.

### 2. Registration and identity boundaries

The [signup page](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/pages/auth/signup.astro#L7) translates safe error codes and hydrates `SignUpForm` with locale and server error.

The [signup form](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/components/auth/SignUpForm.tsx#L20) currently uses manual component-local validation, not a shared signup Zod schema:

- Nonblank email checked with an email regex.
- Required password of at least six characters.
- Required password confirmation matching the password.
- Native form validation disabled with `noValidate`.

The shared [auth field component](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/components/auth/FormField.tsx#L8) derives a form field name from its name/ID and currently does not expose required, maximum-length, or autocomplete props.

The [signup endpoint](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/pages/api/auth/signup.ts#L5) reads form data, casts email/password, calls `auth.signUp({ email, password })`, then redirects to the error flow or confirmation page.

Currently it:

- Does not collect or forward a username.
- Does not pass Auth `options.data` metadata.
- Does not perform application-server Zod validation or confirmation comparison.
- Relies on the database trigger for profile creation.
- Lacks the repository-required explicit `prerender = false`.

These are existing boundary characteristics to consider when adding username validation, not evidence that the new requirement is already implemented.

[Signin](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/pages/api/auth/signin.ts#L12) remains email/password. A required username does not inherently request username-based authentication.

[Auth error translation](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/lib/i18n/auth-errors.ts#L4) allowlists URL error codes, normalizes duplicate-email errors, and maps unknown codes safely. Username validation/conflict messages do not exist yet.

Local [Auth configuration](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/supabase/config.toml#L168) enables signup, disables anonymous signin, and uses a minimum six-character password. Local email confirmation is disabled in the [email configuration](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/supabase/config.toml#L203). Production settings were not checked.

### 3. Profile surface and existing currency settings

The [header](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/components/AppHeader.astro#L16) passes email, locale, and return path to the React profile menu. The [menu](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/components/ProfileMenu.tsx#L14) derives its avatar initial from email and displays email, Settings, language selection, and Sign out.

There is no separate profile page in the researched routes. The existing [settings page](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/pages/settings.astro#L8) loads currency and renders `CurrencySettingsForm`. Its island uses `client:only="react"`, with an existing comment documenting the React/Radix requirement.

The [middleware protected-route list](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/middleware.ts#L8) already includes `/settings`. A new route would require explicit integration with that guard.

Currency saves follow an established path:

```text
CurrencySettingsForm
  -> shared profileUpdateSchema
  -> actions.profile.updateCurrency
  -> authenticated profile service
  -> update current user's row, returning the saved row
  -> reset form baseline and show localized success toast
```

- [Currency schema](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/lib/currency.ts#L3): PLN/EUR/USD/GBP, PLN fallback; `profileUpdateSchema` currently validates only `defaultCurrency`.
- [Form](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/components/settings/CurrencySettingsForm.tsx#L19): React Hook Form and Zod resolver, disabled Save when clean/submitting, edits retained on failure, baseline reset on success.
- [Action](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/actions/index.ts#L67): shared validation, authentication guard, logged service failures, localized action errors.
- [Profile service](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/lib/services/profiles.ts#L10): reads currency with fallback for unauthenticated/missing profiles; query errors propagate. Writes target the authenticated user and use `.select().single()`, so a missing row is not silently treated as saved.

Currency affects item creation/editing, not just settings. [Item actions](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/actions/index.ts#L147) resolve the profile default during writes. The [item service](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/lib/services/items.ts#L56) preserves stored currency unless changed explicitly and uses the default when adding a price to an unpriced item. These behaviors must remain intact.

### 4. Language preferences already span cookie, database, and SSR

[Locale configuration](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/lib/i18n/config.ts#L3) defines PL/EN, Polish default, and a one-year `lang` cookie.

[Middleware](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/middleware.ts#L12) resolves:

```text
valid lang cookie -> signed-in profile language -> pl
```

It queries profile language only if the cookie is invalid/missing, caches a profile-derived locale into the cookie, and logs lookup failures before falling back. A valid cookie can therefore override a profile preference changed on another device.

The existing [locale endpoint](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/pages/api/locale.ts#L9):

1. Parses the requested locale and sanitizes the return path.
2. Sets the cookie.
3. Best-effort updates the authenticated profile.
4. Redirects with HTTP 303.

Invalid locale values redirect without changing the preference. Profile persistence failure is logged but does not undo the cookie or notify the user. The [language update service](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/lib/services/profiles.ts#L42) does not assert that an updated row was returned, unlike currency writes.

The [React i18n provider](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/components/I18nProvider.tsx#L4) is prop-backed, not a mutable cross-island locale store. The [layout](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/layouts/Layout.astro#L20) also sets document language from SSR locals. Existing switches perform full navigation.

Consequently, adding language to settings must define cookie synchronization, navigation/refresh, persisted-versus-effective initial value, and explicit save-failure semantics. Simply updating the database is insufficient.

### 5. Important dates and reusable UI

No existing important-date persistence, user-entered date UI, date-picker/calendar component, or general date-display helper was found. Existing timestamp handling is not an established contract for user calendar dates.

Reusable foundations:

- [Input](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/components/ui/input.tsx#L5) forwards native input props, including date input type.
- [Form primitives](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/components/ui/form.tsx#L81) associate labels/errors with fields and expose invalid state. `FormMessage` translates schema message keys.
- Existing UI includes cards, tabs, selects, dialogs, alert dialogs, buttons, and toast infrastructure. No local calendar, popover, date-picker, or textarea component was found; repository guidance requires adding needed shadcn components through its CLI.
- [Rename dialog](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/components/dashboard/RenameListDialog.tsx#L23) demonstrates schema-derived forms, action field-error mapping, and localized feedback.
- [Delete dialog](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/components/lists/DeleteItemDialog.tsx#L28) demonstrates submission state and preserving the dialog on failure.
- [Locale mapping](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/lib/i18n/config.ts#L19) supplies `pl-PL`/`en-US` for Intl formatting, but does not decide date-only, timezone, or recurrence semantics.

[Polish dictionary](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/lib/i18n/pl.ts#L1) is canonical; English is typed against it. Current settings keys cover currency, not the new profile/date fields. Suggested birthday/anniversary labels and validation/feedback need both languages. User-written headings/descriptions are content, not translation keys.

### 6. Identity consumers and boundaries to preserve

No existing username/display-name consumers were found. Current authorization uses Auth UUIDs and invitation addressing uses email, not display identity.

- [Lists/reservations/invitations schema](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/supabase/migrations/20260527125732_initial_wishlist_schema.sql#L20): owner/claimer UUIDs and normalized invitation email.
- [Invitation actions](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/actions/index.ts#L208): self-invite checks and inviter identity use Auth email.
- [Locals](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/env.d.ts#L1): user, Supabase client, and locale; no preloaded full profile.
- [Shared types](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/types.ts#L1): sharing DTOs, no profile/date DTOs.

Showing username in the header would require supplying it to that island. It does not require changing invitation delivery, signin identifiers, or authorization. Email changes, if requested, belong to Supabase Auth rather than an ordinary profile update.

### 7. Test coverage and verification seams

[Profile integration tests](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/tests/integration/profiles.test.ts#L19) cover:

- Trigger-provisioned PLN currency.
- Own-row read/update and cross-user isolation.
- Rejection of another user's profile insertion.
- Polish default, language changes, cross-user filtering, and invalid-language constraint rejection.
- Currency inheritance and preservation in item edits.

The [central test-user helper](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/tests/helpers/supabaseTestClients.ts#L28) creates confirmed users administratively with email/password only, without username metadata. If provisioning starts requiring metadata, that helper and its fixture consumers need compatible account creation:

- [Reservation fixtures](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/tests/helpers/reservationFixtures.ts#L28).
- [Invitation fixtures](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/tests/helpers/invitationFixtures.ts#L47).
- [Share tests](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/tests/integration/list-shares.test.ts#L31).

Current fixtures use unique emails and delete Auth users during cleanup; profile deletion cascades. A dates model should preserve independent setup and cleanup.

[Vitest configuration](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/vitest.config.ts#L6) has Node unit/integration projects, without the Astro Vite plugin; ordinary tests cannot assume `astro:*` virtual modules resolve. [Integration setup](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/tests/setup/integration.ts#L4) requires local Supabase and gitignored test credentials.

No existing coverage was found for signup boundary validation, username contracts/backfill, settings component/action interactions, date persistence, or browser cookie/profile locale synchronization. No Playwright/E2E configuration was found in the researched test setup.

Existing [i18n tests](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/lib/i18n/i18n.test.ts#L19) enforce dictionary parity and Polish plural forms. [Auth error tests](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/lib/i18n/auth-errors.test.ts#L4) cover safe error-code translation.

## Code References

| Reference | Relevance |
| --- | --- |
| [Profile migration:4](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/supabase/migrations/20261017214127_add_profiles_default_currency.sql#L4) | Profile schema, RLS, provisioning, backfill |
| [Signup form:20](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/components/auth/SignUpForm.tsx#L20) | Registration state and client validation |
| [Signup endpoint:5](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/pages/api/auth/signup.ts#L5) | Server registration boundary |
| [Settings page:8](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/pages/settings.astro#L8) | Existing protected account-settings surface |
| [Profile service:10](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/lib/services/profiles.ts#L10) | Currency and language reads/writes |
| [Middleware:12](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/middleware.ts#L12) | Effective locale resolution |
| [Locale endpoint:9](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/src/pages/api/locale.ts#L9) | Cookie/profile update and redirect |
| [Profile tests:19](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/tests/integration/profiles.test.ts#L19) | Existing ownership and preference tests |

## Architecture Insights

1. **Separate account identity from profile presentation.** Auth owns email/password and UUID; profiles currently extend preferences. Username/name display does not automatically change Auth or invitation contracts.
2. **Provisioning is database-driven.** Form-only changes cannot satisfy required stored usernames. Trigger, metadata handling, historical accounts, and administrative creation form one compatibility boundary.
3. **Locale is distributed state.** Database, cookie, SSR locals, document language, and island props must agree after a settings change. Existing full-navigation behavior matters.
4. **Reuse the established settings stack.** Shared validation, authenticated actions, profile services, accessible form primitives, and translated feedback already exist.
5. **Ownership is explicit.** New date storage requires separate RLS and cross-user tests; exposing profile data to invitees would be a separate privacy/design decision.
6. **Preferences already have defaults.** Currency/language are required internally but do not require users to enter values. "Only username/email compulsory" does not itself imply nullable preference storage or passwordless signup.
7. **Apply known repository lessons.** New service failures should propagate to a logging/notification boundary; prefilled dialogs should reset on open and close. These lessons do not imply silently changing unrelated existing behavior.

## Historical Context (from prior changes)

- [Currency brief](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/context/changes/per-user-default-currency/plan-brief.md#L24) reserved settings for expansion while intentionally keeping that change currency-only. Its descriptions of no profile store/hardcoded currency are historical, not current.
- [Currency plan](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/context/changes/per-user-default-currency/plan.md#L39) documented provisioning and backfill now represented in executable migrations.
- [Language brief](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/context/changes/add-language-extension/plan-brief.md#L21) established PL/EN, cookie/profile persistence, Polish defaults, no URL prefixes, and no translation of user content.
- [Language plan](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/context/changes/add-language-extension/plan.md#L74) described additive profile language and cookie-first resolution. Live service signatures, not historical proposed signatures, are authoritative.
- [PRD](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/context/foundation/prd.md#L56) specifies email/password signup. Its requirements do not settle username or important-date contracts.
- [Archived invitation brief](https://github.com/lstojke/as-you-wish/blob/8835624f78b8906b2cdb1d5fbfc7e899ae78787f/context/archive/2026-08-09-share-list-by-email-invite/plan-brief.md#L55) accepted re-clicking an invitation after signup/confirmation rather than threading registration return state. Required usernames should not silently alter that flow.

## Related Research

The closely related currency and language planning artifacts above provide historical context. This research did not establish a separate related research document as authoritative evidence.

## Open Questions

Resolve these during planning; no product decisions are implied by the findings:

1. **Username contract:** unique handle or display label? Case sensitivity, normalization, allowed characters, lengths, reserved names, and editability?
2. **Existing accounts:** generated usernames or completion flow? How are collisions, privacy, and compatibility with the previous Worker handled?
3. **Enforcement boundary:** must all Auth creation paths provide username, or only new application registrations? Administrative tests and potential future OAuth need an explicit contract.
4. **Compulsory fields:** does "only username/email" mean profile fields while retaining required signup password/confirmation? Current authentication is password-based.
5. **Profile UX:** extend existing settings/menu or create another route? Should email/username be editable or read-only, and should the header show username/name?
6. **Date meaning:** full calendar dates or annual recurring occasions? Is year optional? What happens for leap days, past dates, ordering, duplicates, and timezones?
7. **Entry validation:** which subfields are mandatory for a saved date, what are their length/count limits, and how are empty optional values cleared?
8. **Suggestions:** are birthday/anniversary example headings, predefined types, or optional pre-created entries? Reminders are not requested or implemented.
9. **Privacy:** are names/dates self-only, or visible to invited users? Current profile RLS supports self-only access.
10. **Saving:** one combined form/transaction or independent sections/date CRUD? What should happen on partial failure?
11. **Language UX:** initialize from effective cookie locale or persisted profile preference? Apply immediately or on Save, and how should successful navigation and persistence failure behave?
12. **Signup locale:** should the visitor's current language seed their profile? Existing provisioning defaults to Polish even when the registration page uses an English cookie.
