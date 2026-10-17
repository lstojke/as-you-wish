# Add Polish (default) + English Implementation Plan

## Overview

Introduce i18n to AsYouWish: Polish becomes the default UI language, English stays available as an opt-in. Every user-visible string — Astro pages, React islands, zod validation messages, action errors, auth errors, the invitation email, and price formatting — is localized. Shipped as one release (feature branch, merged to `master` only when fully translated).

## Current State Analysis

- No i18n exists. `astro.config.mjs` has no `i18n` block; `src/layouts/Layout.astro:17` hardcodes `<html lang="en">`.
- Strings are hardcoded English across ~3.3k lines: pages (`index`, `auth/{signin,signup,confirm-email}`, `dashboard`, `lists/[id]`, `settings`, `share/[...token]`, `invitations/accept`) and components (`AppHeader`, `Welcome`, `ProfileMenu`, `auth/*`, `dashboard/*`, `lists/*`, `settings/*`).
- ~18 zod messages in `src/lib/schemas/wishlist.ts` — schemas are **shared** by client (react-hook-form) and server (Astro Actions input validation).
- ~16 `ActionError` messages in `src/actions/index.ts`, surfaced verbatim in toasts by islands.
- Auth endpoints (`src/pages/api/auth/{signin,signup}.ts`) pass raw Supabase `error.message` through `?error=` to `SignInForm`/`SignUpForm` (`ServerError.tsx`).
- `src/lib/services/email.ts` builds an English-only invitation email.
- `src/lib/format-price.ts` hardcodes `en-US`; used by `ItemsList.tsx:56` and `share/[...token].astro:71`.
- `profiles` table (migration `20261017214127`) exists with self-only RLS for select/update/insert — a natural home for a language preference.
- Islands are mounted per page as separate React roots (`client:only="react"` for RHF/Radix islands; `client:load` for `SignInForm`/`SignUpForm`), so there is no shared React tree to host a global provider.
- `Banner` config messages in `Layout.astro` are already Polish (dev-only misconfig banner).

## Desired End State

- A first-time visitor sees the whole app in Polish. A PL/EN toggle in the header (signed-out) or the profile menu (signed-in) switches language instantly (full page reload) and the choice sticks: via cookie for everyone, and via `profiles.language` for signed-in users across devices.
- `<html lang>` matches the active locale.
- No English leaks into the Polish UI: form validation, toasts, auth errors, empty states, dialogs, share/accept pages all localized.
- Prices render natively (`1 234,50 zł` in PL, `PLN 1,234.50` in EN).
- Invitation emails are bilingual (PL first, then EN).
- Verification: unit tests for dictionary parity, `t()`/plurals, locale resolution, `formatPrice`, auth error mapping; integration test for `profiles.language` RLS; manual browser pass in both locales.

### Key Discoveries:

- `src/middleware.ts:6-17` already resolves `locals.supabase` + `locals.user` per request — the right place to resolve `locals.locale`.
- `src/env.d.ts` declares `App.Locals` — extend with `locale`.
- `src/lib/services/profiles.ts` — `getDefaultCurrency`/`updateDefaultCurrency` pattern to mirror for language.
- `src/pages/api/auth/signin.ts:5-9` — `safeReturnPath` open-redirect guard pattern to reuse for the locale endpoint's redirect target.
- `src/actions/index.ts` handlers receive `context` → `context.locals.locale` is available for server-side translation of `ActionError` messages.
- Lessons: "throw on unexpected failures and map at the boundary" (services); keep URL refine rules in schemas untouched.

## What We're NOT Doing

- No URL locale prefixes / Astro i18n routing (`/en/...`). Locale is cookie-driven.
- No `Accept-Language` detection — first visit is always Polish.
- No i18n library (i18next, paraglide); hand-rolled typed dictionaries.
- No translation of Supabase-hosted auth emails (confirmation/reset templates live in the Supabase dashboard).
- No translation of user content (list/item titles) or the dev-only misconfig `Banner` text.
- No new languages beyond `pl` and `en` (but the design must make adding one a dictionary + enum change).
- No changes to `per-user-default-currency` behavior.

## Implementation Approach

1. **Single source of truth**: `src/lib/i18n/` holds `LOCALES = ["pl", "en"] as const`, `DEFAULT_LOCALE = "pl"`, `LOCALE_COOKIE = "lang"`, the Polish dictionary (canonical shape), and an English dictionary typed against it so a missing EN key fails `astro check`.
2. **Resolution in middleware**: cookie → (signed-in & no cookie) `profiles.language`, then write the cookie → `DEFAULT_LOCALE`. Result on `locals.locale`.
3. **Switching** via a plain form `POST /api/locale` (works without JS, usable from `.astro` header and from the React profile menu): sets cookie, updates `profiles.language` when signed in, redirects back to a same-origin path.
4. **Astro pages** call `t(locale, key, params?)` with `Astro.locals.locale`.
5. **React islands** receive a `locale` prop at each mount point and wrap their tree in `<I18nProvider locale>`; descendants use `useT()`.
6. **Zod messages become dictionary keys** (shared schemas can't know the locale); the UI translates them when rendering field errors. Server-thrown `ActionError` messages are translated server-side from `context.locals.locale`.
7. **Auth errors**: endpoints redirect with `?error=<code>` (mapped from Supabase `error.code`), pages translate the code; unknown codes → generic message. Raw provider text no longer reaches the URL.

## Critical Implementation Details

- **Release gating**: `master` pushes auto-deploy to production. Implement all phases on a feature branch (e.g. `feat/i18n-pl`); merge to `master` only after Phase 4 manual verification. The Phase 1 migration is additive (`language` column with default) and backward-compatible, so `npx supabase db push` can run before the merge.
- **Polish plurals**: Polish needs `one` / `few` / `many` forms (1 lista, 2 listy, 5 list). Use `Intl.PluralRules(locale).select(n)` to pick the form; plural dictionary entries are objects keyed by plural category, with `other` as mandatory fallback.
- **Zod key convention**: schema messages must be dictionary keys (e.g. `"validation.titleRequired"`). The renderer translates a message only if it is a known key and otherwise shows it as-is, so third-party/default zod messages never crash the UI. Max-length messages need the limit as a param — keep separate keys per limit (e.g. `validation.titleMax200`, `validation.titleMax500`) rather than parsing.
- **Cookie**: `lang`, `Path=/`, `SameSite=Lax`, `Max-Age` 1 year, not `HttpOnly` (harmless; allows future client reads), `Secure` in production. Validate the cookie value against `LOCALES`; invalid → treat as absent.
- **Hydration for `client:load` islands** (`SignInForm`, `SignUpForm`): SSR and client must render the same locale — pass `locale` as a prop (serialized), never read `document`/cookies inside the component.

## Phase 1: i18n Foundation

### Overview

Infrastructure only: data model, dictionaries, locale resolution, switch endpoint, `<html lang>`, locale-aware `formatPrice`. UI strings still English (dictionaries seeded with the keys needed by Phase 2-4 progressively — Phase 1 only needs a minimal seed plus the plural example).

### Changes Required:

#### 1. Migration — language preference

**File**: `supabase/migrations/<timestamp>_add_profiles_language.sql`

**Intent**: Persist the signed-in user's language across devices.

**Contract**: `alter table public.profiles add column language text not null default 'pl' check (language in ('pl','en'))`. Existing self-only RLS policies already cover select/update; no new policy needed. `handle_new_user()` unchanged (column default applies). Hand-insert `language: string` into the `profiles` Row/Insert/Update blocks of `src/db/database.types.ts` (do not regenerate the whole file — see per-user-default-currency notes).

#### 2. i18n core

**Files**: `src/lib/i18n/index.ts`, `src/lib/i18n/pl.ts`, `src/lib/i18n/en.ts`

**Intent**: Typed dictionaries and translation helpers usable in SSR, actions, and islands (edge-safe, no Node APIs).

**Contract**:

- `export const LOCALES = ["pl", "en"] as const; export type Locale; DEFAULT_LOCALE = "pl"; LOCALE_COOKIE = "lang"; isLocale(v: unknown): v is Locale; localeSchema` (zod enum).
- `pl.ts` exports `pl` (nested object, `as const`) — canonical; `export type Dictionary` derived with string leaves widened (so EN can differ in text but not shape). `en.ts` exports `en: Dictionary`.
- `t(locale, key, params?)` — `key` typed as dot-path union of leaf keys; `{name}` interpolation; plural entries `{ one, few?, many?, other }` selected via `Intl.PluralRules` when `params.count` is a number.
- `translateMessage(locale, msg)` — returns `t()` if `msg` is a known key else `msg` unchanged (for zod/action messages).
- `intlLocale(locale)` → `"pl-PL" | "en-US"`.

#### 3. Locale resolution

**Files**: `src/env.d.ts`, `src/middleware.ts`, `src/lib/services/profiles.ts`

**Intent**: Every request has `locals.locale`.

**Contract**: `App.Locals.locale: Locale`. Middleware order: after user resolution → cookie (`isLocale`) → if signed in and no valid cookie, `getLanguage(client)` from profiles and set the cookie → else `DEFAULT_LOCALE`. Profile lookup failure falls back to default (never blocks the request). Add `getLanguage(client)` and `updateLanguage(client, locale)` to `profiles.ts` following the currency functions' pattern.

#### 4. Switch endpoint

**File**: `src/pages/api/locale.ts`

**Intent**: One no-JS switch path for header toggle and profile menu.

**Contract**: `export const prerender = false; export const POST`. Form fields `locale` (zod `localeSchema`) and `return` (same-origin path; must start with `/` and not `//`, else `/`). Sets cookie (see Critical Details), calls `updateLanguage` when `locals.user` (failure logged, not fatal), `303` redirect to `return`. Invalid locale → redirect without change.

#### 5. Document language + price formatting

**Files**: `src/layouts/Layout.astro`, `src/lib/format-price.ts`, callers `src/components/lists/ItemsList.tsx`, `src/pages/share/[...token].astro`

**Intent**: Correct `<html lang>` and native price format.

**Contract**: `<html lang={Astro.locals.locale}>`. `formatPrice(priceCents, currency, locale: Locale)` uses `intlLocale(locale)`; fallback string unchanged. `ItemsList` gets locale from its island props for now (wired fully in Phase 3); share page passes `Astro.locals.locale`.

#### 6. Tests

**Files**: `src/lib/i18n/i18n.test.ts`, `src/lib/format-price.test.ts`, `tests/integration/profiles.test.ts`

**Intent**: Lock the contracts cheaply.

**Contract**: key-parity test (flatten `pl` and `en`, same key set, no empty strings); `t()` interpolation, missing-key behavior, PL plurals for 1/2/5/22/25, EN plurals 1/2; `translateMessage` pass-through; `isLocale`; `formatPrice` for `pl` and `en`. Integration: user can read/update own `language`, cannot update another user's, check constraint rejects `'de'`, new users default to `'pl'`.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db reset`
- Unit tests pass: `npm run test:unit`
- Integration tests pass: `npm run test:integration`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- `curl -i -X POST -d 'locale=en&return=/' localhost:4321/api/locale` returns 303 with `Set-Cookie: lang=en`; `return=//evil.com` redirects to `/`
- Page source shows `<html lang="pl">` without cookie and `lang="en"` with `lang=en` cookie

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Astro Pages, Header Switchers, Auth Errors

### Overview

Translate all server-rendered `.astro` content, add the language switchers, and localize auth errors.

### Changes Required:

#### 1. Translate Astro pages and components

**Files**: `src/pages/index.astro`, `src/components/Welcome.astro`, `src/components/AppHeader.astro`, `src/pages/auth/{signin,signup,confirm-email}.astro`, `src/pages/dashboard.astro`, `src/pages/lists/[id].astro`, `src/pages/settings.astro`, `src/pages/share/[...token].astro`, `src/pages/invitations/accept.astro`, `src/layouts/Layout.astro` (default `title`)

**Intent**: All static text and `<title>`s come from the dictionary via `t(Astro.locals.locale, …)`.

**Contract**: Add keys under per-area namespaces (`common`, `header`, `home`, `auth`, `dashboard`, `list`, `settings`, `share`, `invitation`). Brand "AsYouWish" stays untranslated.

#### 2. Language switchers

**Files**: `src/components/LanguageSwitcher.astro` (new), `src/components/AppHeader.astro`, `src/components/ProfileMenu.tsx`

**Intent**: Signed-out visitors get a compact PL/EN toggle in the header; signed-in users get a language section in the profile menu.

**Contract**: `LanguageSwitcher.astro` renders a `<form method="post" action="/api/locale">` with hidden `return` = current path+search and two submit buttons (`name="locale" value="pl|en"`), active one marked `aria-current`/`aria-pressed`. `ProfileMenu` gets `locale` prop and adds two menu items submitting a hidden form to `/api/locale` (same pattern as its existing hidden sign-out form). Use `cn()` for classes.

#### 3. Auth error codes

**Files**: `src/lib/i18n/auth-errors.ts` (new), `src/pages/api/auth/{signin,signup}.ts`, `src/pages/auth/{signin,signup}.astro`, `src/components/auth/{SignInForm,SignUpForm,ServerError}.tsx`

**Intent**: Stop leaking raw Supabase English; show localized messages.

**Contract**: `authErrorCode(error: { code?: string } | null): AuthErrorCode` maps known Supabase codes (`invalid_credentials`, `email_not_confirmed`, `user_already_exists`, `weak_password`, `over_email_send_rate_limit`, `over_request_rate_limit`, `signup_disabled`, plus `not_configured`) else `"unknown"`. Endpoints redirect `?error=<code>`. Pages translate via `auth.errors.<code>` (unrecognized → `auth.errors.unknown`) and pass the translated string to the form's `serverError`. Unit test the mapper.

### Success Criteria:

#### Automated Verification:

- Unit tests pass (incl. auth error mapping): `npm run test:unit`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Signed-out home, sign-in, sign-up, share, accept pages render in Polish by default; header toggle switches to English and back, staying on the same page
- Signed-in: profile menu language switch persists after sign-out/sign-in in a different browser (profile-backed)
- Wrong password shows a Polish message (no raw Supabase English, URL contains only a code)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: React Islands, Validation & Action Messages

### Overview

Localize all interactive UI, form validation, and toasts.

### Changes Required:

#### 1. Island i18n plumbing

**Files**: `src/components/hooks/useT.ts` (new) + `src/lib/i18n/I18nProvider.tsx` (new), island roots `DashboardLists`, `ListDetail`, `CurrencySettingsForm`, `ProfileMenu`, `SignInForm`, `SignUpForm`, and their mount points in `.astro` pages

**Intent**: Each island root receives `locale` and provides it to descendants.

**Contract**: `<I18nProvider locale>`; `useT()` returns `{ t, locale }` with `t(key, params?)` bound to the locale and a `tm(message)` wrapper over `translateMessage`. Every `.astro` mount passes `locale={Astro.locals.locale}`. `ItemsList` takes locale from context for `formatPrice`.

#### 2. Translate components

**Files**: everything under `src/components/{auth,dashboard,lists,settings}/` plus `ProfileMenu.tsx`

**Intent**: Labels, placeholders, buttons, dialogs, empty/error states, `aria-label`s, toasts.

**Contract**: No hardcoded user-visible English left in these files. Counts (items, reservations, invitations) use plural keys.

#### 3. Zod messages → keys

**Files**: `src/lib/schemas/wishlist.ts`, `src/lib/currency.ts` (if it carries messages), `src/components/auth/FormField.tsx`, `src/components/ui/form.tsx` usage (`FormMessage`), any component rendering `fieldErrors`

**Intent**: Shared schemas stay locale-agnostic; renderers translate.

**Contract**: Every custom message string becomes a `validation.*` key. Field-error renderers pass messages through `tm()`. Update `src/lib/schemas/wishlist.test.ts` assertions to keys. Server-side Astro Action input errors surface the same keys and are translated by the same renderers.

#### 4. ActionError messages server-side

**File**: `src/actions/index.ts`

**Intent**: Toasts show messages in the user's language.

**Contract**: Each `ActionError` message becomes `t(context.locals.locale, "errors.<name>")`, including `requireUser` ("must be signed in") and invite/accept/reserve mappings. Client toasts keep displaying `error.message`; client-only fallbacks (network failure, unexpected) use `t("errors.generic")`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- Integration tests pass: `npm run test:integration`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- No obvious leftovers: grep of `src/components` for common English UI words (`"Cancel"`, `"Save"`, `"Delete"`, `"Could not"`, `"required"`) returns only dictionary files

#### Manual Verification:

- Dashboard: create/rename/delete list dialogs, toasts and empty states in Polish; same in English after switching
- List detail: add/edit/delete item, reservation, invite dialog, share link dialog — field validation errors and toasts localized
- Prices render as `1 234,50 zł` (PL) and `PLN 1,234.50` (EN)
- Sign-in/sign-up forms hydrate without console hydration warnings in both locales

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Bilingual Email & Final Sweep

### Overview

Localize the invitation email and verify nothing English remains in the Polish UI.

### Changes Required:

#### 1. Bilingual invitation email

**File**: `src/lib/services/email.ts`

**Intent**: Invitees can read the email regardless of their language.

**Contract**: Subject combines both (`"… zaprasza Cię do listy życzeń / … invited you to a wishlist — AsYouWish"`). Text and HTML bodies: Polish block, separator, English block — both built from `t("pl", …)` / `t("en", …)` keys under `email.invitation.*`. Keep `escapeHtml` on all interpolated values. `sendInvitationEmail` signature unchanged. Add a unit test for the pure body builder (extract `buildInvitationEmail(input)` if needed) asserting both languages and escaping.

#### 2. Final sweep

**Files**: repo-wide under `src/`

**Intent**: Catch stragglers (titles, `aria-label`s, `alt`, `confirm()` texts, `console`-free user strings).

**Contract**: Sweep with grep for English words in `.astro`/`.tsx` outside `src/lib/i18n/`; fix findings. Update `README.md`/`AGENTS.md` with a short "i18n" convention note (where dictionaries live, add keys to `pl.ts` first, use `t`/`useT`, zod messages are keys).

### Success Criteria:

#### Automated Verification:

- Unit tests pass (incl. email builder): `npm run test:unit`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Sending an invitation delivers a bilingual email with a working accept link
- Full click-through in Polish (signed-out → sign-up → dashboard → list → invite → share page → accept) shows no English UI text
- Same click-through in English shows no Polish UI text
- After merge to `master`: `npx supabase db push` has been run and production renders Polish by default

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before merging the feature branch to `master`.

---

## Testing Strategy

### Unit Tests:

- Dictionary key parity (PL ↔ EN), no empty strings
- `t()` interpolation, PL plural categories (1, 2, 5, 22, 25), EN plurals, `translateMessage` pass-through for unknown strings
- `isLocale` / cookie validation
- `formatPrice` per locale + fallback
- `authErrorCode` mapping incl. unknown
- Invitation email builder: both languages present, HTML escaped
- Existing schema tests updated to key-based messages

### Integration Tests:

- `profiles.language`: default `pl`, self read/update, cross-user update denied, check constraint rejects unsupported values

### Manual Testing Steps:

1. Clear cookies → open `/` → Polish; `<html lang="pl">`
2. Toggle EN in header → same page in English; reload persists
3. Sign in → profile menu → switch to PL; sign in from another browser → Polish without cookie
4. Trigger validation errors and failing actions in both locales
5. Send an invitation → bilingual email; open share link signed-out → follows visitor's cookie locale

## Performance Considerations

Middleware adds one `profiles` select only for signed-in requests without a `lang` cookie (then cached in the cookie). Dictionaries are small TS modules; both locales are bundled into islands (~few KB) — acceptable, no lazy loading needed.

## Migration Notes

Additive column with default; backward-compatible with the currently deployed Worker. Run `npx supabase db push` (also still pending for `20261017214127_add_profiles_default_currency.sql`) before merging to `master`. Rollback: `npx wrangler rollback` is safe; the column can stay.

## References

- Change: `context/changes/add-language-extension/change.md`
- Profile service pattern: `src/lib/services/profiles.ts`
- Open-redirect guard pattern: `src/pages/api/auth/signin.ts:5-9`
- Island mount conventions: `src/pages/dashboard.astro:38-40`, `src/components/AppHeader.astro:18-19`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: i18n Foundation

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db reset` — 1dcc49f
- [x] 1.2 Unit tests pass: `npm run test:unit` — 1dcc49f
- [x] 1.3 Integration tests pass: `npm run test:integration` — 1dcc49f
- [x] 1.4 Type checking passes: `npx astro check` — 1dcc49f
- [x] 1.5 Linting passes: `npm run lint` — 1dcc49f

#### Manual

- [x] 1.6 `/api/locale` sets cookie and rejects off-site return paths — 1dcc49f
- [x] 1.7 `<html lang>` follows the cookie (default `pl`) — 1dcc49f

### Phase 2: Astro Pages, Header Switchers, Auth Errors

#### Automated

- [x] 2.1 Unit tests pass (incl. auth error mapping): `npm run test:unit` — 3e9ba2d
- [x] 2.2 Type checking passes: `npx astro check` — 3e9ba2d
- [x] 2.3 Linting passes: `npm run lint` — 3e9ba2d

#### Manual

- [x] 2.4 Signed-out pages render Polish by default; header toggle switches and stays on page — 3e9ba2d
- [ ] 2.5 Profile-menu language persists across browsers via profile
- [x] 2.6 Wrong password shows Polish message; URL carries only a code — 3e9ba2d

### Phase 3: React Islands, Validation & Action Messages

#### Automated

- [x] 3.1 Unit tests pass: `npm run test:unit`
- [x] 3.2 Integration tests pass: `npm run test:integration`
- [x] 3.3 Type checking passes: `npx astro check`
- [x] 3.4 Linting passes: `npm run lint`
- [x] 3.5 No English leftovers in `src/components` per grep

#### Manual

- [ ] 3.6 Dashboard dialogs, toasts, empty states localized in both locales
- [ ] 3.7 List detail flows (items, reservations, invites, share) localized incl. validation
- [ ] 3.8 Prices render natively per locale
- [ ] 3.9 Auth forms hydrate without warnings in both locales

### Phase 4: Bilingual Email & Final Sweep

#### Automated

- [ ] 4.1 Unit tests pass (incl. email builder): `npm run test:unit`
- [ ] 4.2 Type checking passes: `npx astro check`
- [ ] 4.3 Linting passes: `npm run lint`
- [ ] 4.4 Build passes: `npm run build`

#### Manual

- [ ] 4.5 Bilingual invitation email delivered with working link
- [ ] 4.6 Full Polish click-through shows no English
- [ ] 4.7 Full English click-through shows no Polish
- [ ] 4.8 Remote migration pushed and production defaults to Polish after merge
