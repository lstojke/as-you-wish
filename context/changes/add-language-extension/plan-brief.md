# Add Polish (default) + English — Plan Brief

> Full plan: `context/changes/add-language-extension/plan.md`

## What & Why

Make Polish the default UI language of AsYouWish while keeping English as a selectable option. The target audience is Polish; today every string is hardcoded English.

## Starting Point

No i18n at all: `<html lang="en">`, English strings in ~20 pages/components, English zod and action error messages, raw Supabase auth errors in the URL, an English invitation email, and `formatPrice` fixed to `en-US`. A `profiles` table with self-only RLS already exists.

## Desired End State

New visitors see Polish everywhere. A PL/EN toggle (header when signed out, profile menu when signed in) switches language; the choice persists via cookie and, for signed-in users, in their profile across devices. Validation, toasts, auth errors, prices, and the (bilingual) invitation email all match.

## Key Decisions Made

| Decision           | Choice                                                                         | Why                                                           |
| ------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| URL structure      | No prefix; locale from `lang` cookie                                           | Zero route/middleware churn; SEO irrelevant for private lists |
| Persistence        | Cookie + `profiles.language`                                                   | Works for anonymous visitors; follows signed-in users         |
| First visit        | Always Polish                                                                  | "Polish is the default" taken literally                       |
| Switcher           | Header toggle (signed-out) + profile menu                                      | Reachable on every page incl. auth/share                      |
| Mechanism          | Typed TS dictionaries in `src/lib/i18n`                                        | No dependency, edge-safe, missing EN key = type error         |
| Validation/actions | Translate all; zod messages = keys, actions server-side                        | No English leaking into Polish UI                             |
| Auth errors        | Map Supabase codes → `?error=<code>` → translated                              | Clean UX, no raw provider text in URL                         |
| Invitation email   | Bilingual (PL then EN)                                                         | Invitee's language is unknown                                 |
| Formatting         | `pl-PL` / `en-US` per locale                                                   | Native price display                                          |
| Rollout            | Feature branch, single merge after Phase 4                                     | `master` auto-deploys; avoid half-Polish production           |
| Testing            | Unit (parity, plurals, mapping, format, email) + profiles integration + manual | Cheap guard against missing keys                              |

## Scope

**In scope:** all app UI text, `<html lang>`, zod + ActionError messages, auth error mapping, bilingual invite email, locale-aware prices, switchers, `profiles.language`, docs note.

**Out of scope:** URL locale prefixes, Accept-Language detection, i18n libraries, Supabase-hosted auth email templates, user content, dev-only config banner, languages beyond PL/EN.

## Architecture / Approach

`src/lib/i18n` (PL canonical dict, EN typed against it, `t()` with `Intl.PluralRules`) → middleware sets `locals.locale` (cookie → profile → `pl`) → `.astro` pages call `t(locals.locale, …)`; each island root gets a `locale` prop and `<I18nProvider>` + `useT()`. `POST /api/locale` (no-JS form) sets the cookie, updates the profile, and redirects back with an open-redirect guard.

## Phases at a Glance

| Phase                                  | What it delivers                                                           | Key risk                                       |
| -------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------- |
| 1. i18n Foundation                     | Migration, dictionaries, locale resolution, switch endpoint, `formatPrice` | Getting the typed-key/plural API right         |
| 2. Astro pages, switchers, auth errors | Server-rendered pages localized, PL/EN toggles, auth codes                 | Missed strings in less-visited pages           |
| 3. Islands, validation, actions        | All React UI, zod keys, localized toasts                                   | Hydration mismatch on `client:load` auth forms |
| 4. Email + final sweep                 | Bilingual invite email, leftover-string sweep, docs                        | Stragglers (aria-labels, titles)               |

**Prerequisites:** local Supabase running; work on a feature branch; remote `npx supabase db push` (both currency and language migrations) before merging.
**Estimated effort:** ~3–4 sessions across 4 phases (Phase 3 is the largest).

## Open Risks & Assumptions

- Polish copy quality: translations written by the implementer; user should proofread during manual passes.
- Supabase error codes may vary by version; unmapped codes fall back to a generic message.
- Uncommitted per-item currency work from the previous change should be committed first to keep diffs clean.

## Success Criteria (Summary)

- Fresh visitor sees a fully Polish app; switching to English is one click and persists.
- No mixed-language UI in either locale (forms, toasts, auth errors, prices, email).
- Missing translation keys are caught by `astro check` and unit tests.
