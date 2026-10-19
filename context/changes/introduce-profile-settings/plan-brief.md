# Profile Settings and Important Dates - Plan Brief

> Full plan: [plan.md](./plan.md)  
> Research: [research.md](./research.md)

## What & Why

Turn the existing settings screen into useful private account settings: optional first/last names, currency/language preferences, and important dates. The original required-username idea was explicitly withdrawn because email already handles account identification and invitations.

## Starting Point

Settings currently edits currency; language already exists in profiles and the header menu. Profiles are provisioned automatically with self-only access, but names and important dates do not exist.

## Desired End State

Owners see read-only email, edit optional names, and save preferences in distinct sections. Names personalize the header on the next navigation, falling back to email when absent.

Owners independently add/edit/delete important dates with optional descriptions and Off/Weekly/Monthly/Yearly repeat frequency, defaulting to Yearly. Recurrence is stored/displayed here; reminders are a separate future feature.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Usernames | None; preserve email/password signup | No current handle-based feature needs them | Plan: user revision |
| Names/email | Optional names, read-only Auth email | Personalize without changing authentication | Plan: user |
| Surface | Extend `/settings`, personalize owner header | Reuse existing navigation and account surface | Research + Plan |
| Privacy | Owner-only profiles/dates | Preserve current self-only access | Plan: user |
| Dates | Original full calendar date; required heading, optional description | Useful records with minimal entry friction | Plan: user |
| Limits | Names/heading 100 characters, description 1000 | Bound individual inputs without forcing optional content | Plan: user |
| Repetition | Off/Weekly/Monthly/Yearly; Yearly default | Support the requested recurrence control | Plan: user |
| Missing day | Last valid day of intended month, original anchor retained | January 31 can fall back without drifting March | Plan: user |
| Reminders | Deferred to `notifications-introduction` | Scheduling/delivery is a separate feature | Plan: user |
| Saving | Independent profile/preferences and date CRUD | Avoid collection-wide transactions and partial saves | Plan: user |
| Language | Atomic preference write, then cookie and conditional reload | Cookie-first SSR requires synchronized state | Research + Plan |
| Draft safety | Block preference Save while another form is dirty | Prevent reload from discarding edits | Plan: user |

## Scope

**In scope:**
- Additive name/date storage, granular RLS, schemas, types, services, and actions.
- Names, language/currency, accessible date CRUD, repeat help, and heading suggestions.
- One coordinated settings island; hide redundant header language controls there.
- PL/EN localization, ownership/validation regression tests, and manual UI acceptance.

**Out of scope:**
- Usernames, signup redesign, email editing, public/shared profiles or dates.
- Reminder delivery, scheduling, next-occurrence calculation, and notification consent.
- New routes, global client stores, E2E tooling, or unrelated repairs.

## Architecture / Approach

Add nullable names to profiles and a separate owner-scoped date table. Reuse Zod, authenticated Astro actions, Supabase RLS, and shadcn forms/dialogs. One client-only settings root coordinates separate forms; successful preference persistence precedes cookie changes/navigation, and other dirty forms block that save.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Private storage and validation | Additive schema, types, validation, ownership tests | RLS and old-Worker compatibility |
| 2. Profile and preferences | Name editing/header and synchronized language/currency saves | Draft loss or cookie/profile divergence |
| 3. Important dates and verification | Date CRUD, repeat help, localization, final checks | Misleading recurrence claims or stale dialog state |

**Prerequisites:** Local Supabase/Docker and test credentials for integration checks; documented build environment; human manual confirmation between phases.  
**Estimated effort:** Approximately 3 implementation sessions plus manual acceptance, depending on local runtime readiness.

## Open Risks & Assumptions

- Existing locale controls outside settings retain their current best-effort persistence; this change does not silently redesign them.
- Recurrence settings do not send reminders yet. Future notification work must retain original anchors and clamp missing days.
- Schema deployment precedes the new Worker; Worker rollback leaves additive schema/data intact.
- No browser-test framework is added; cookie/navigation, draft safety, and accessibility require explicit manual checks.

## Success Criteria (Summary)

- Owners can save/clear names and preferences without losing unrelated edits; header and PL/EN page state reflect successful saves.
- Private dates persist through independent CRUD with Yearly defaults, optional descriptions, and clear fallback messaging.
- Ownership tests, existing currency behavior, targeted unit tests, lint/type/build checks, and manual acceptance pass.
