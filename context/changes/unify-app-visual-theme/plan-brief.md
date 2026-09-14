# Unify App Visual Theme — Plan Brief

> Full plan: `context/changes/unify-app-visual-theme/plan.md`

## What & Why

The app currently reads as three different products: a cosmic dark landing page, half-cosmic auth pages, and a neutral-gray dashboard/lists area. We're promoting the landing page's "cosmic" colorway into the app's single, dark-only design-token theme and rewriting the landing page to describe AsYouWish (private family wish lists with exclusive, identity-hidden reservations) instead of the `10x-astro-starter` boilerplate — so every page looks and reads as one coherent product.

## Starting Point

The cosmic palette lives entirely in hand-rolled utility classes and a standalone `bg-cosmic` CSS utility; it never touches the shadcn design tokens, which are stock neutral gray. Dark mode is dormant (no `ThemeProvider`, no `dark` class — the app always renders the light `:root` tokens), and the landing page still shows generic starter copy. Header markup is triplicated (landing `Topbar`, an inline dashboard header, and no header on the lists page).

## Desired End State

A signed-out visitor sees a real AsYouWish landing page (hero → how-it-works → value props → CTA) in the cosmic palette; signing in and moving through the dashboard and list pages shows that same dark cosmic look on every button, input, card, and badge, under one shared header. Every reused text/background token pair meets WCAG AA.

## Key Decisions Made

| Decision               | Choice                                                                                                  | Why (1 sentence)                                                                                                         | Source |
| ---------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------ |
| Light vs. dark         | Dark-only, cosmic as default `:root`                                                                    | Landing is already dark; avoids ThemeProvider/toggle/persistence work and instantly re-themes every token-driven surface | Plan   |
| Palette values         | Refine cosmic hues into an accessible scale                                                             | Keep the cosmic identity but tune lightness so reused token pairs pass contrast                                          | Plan   |
| Where tokens live      | Set values in `:root` (not `.dark`)                                                                     | Dark mode never activates today, so `:root` is the only path that actually renders                                       | Plan   |
| Landing content        | Restructure: hero + how-it-works + value props + CTA                                                    | Boilerplate copy has no product story; a real structure sells the reservation flow                                       | Plan   |
| Utility refactor depth | Migrate hand-rolled utilities to tokens where it removes duplication; keep orb/starfield effects inline | One source of truth for color without losing the distinctive landing character                                           | Plan   |
| Headers                | Unify into one shared `AppHeader` across all pages                                                      | Removes three divergent header patterns and the missing lists-page nav                                                   | Plan   |
| Accessibility bar      | WCAG 2.1 AA on all reused tokens                                                                        | Catches the `text-blue-100/60`-on-glass contrast risk when values move onto real UI                                      | Plan   |
| Priority               | Both palette unification and landing rewrite ship together                                              | User wants a single coherent drop                                                                                        | Plan   |

## Scope

**In scope:**

- Cosmic, AA-tuned design tokens set in `:root` (dark-only).
- One shared `AppHeader` on landing, dashboard, and list pages (replaces `Topbar` + inline dashboard header).
- Landing page restructure with AsYouWish copy.
- Migrating auth-page (and stray) hand-rolled color utilities to tokens + a full contrast sweep.

**Out of scope:**

- Light theme, theme toggle, or `ThemeProvider` wiring.
- Any data model, service, API, RLS, or business-logic change.
- Dashboard/list layout redesign beyond header + inherited tokens.
- Removing the decorative landing orb/starfield effects.

## Architecture / Approach

Re-theme at the token layer first so the biggest surface flips with one file's worth of value changes and zero per-component edits (shadcn `Button`/`Card`/`Input`/`Badge` all read `--primary`, `--background`, etc.). Then unify the header, restructure the landing content, and finish with a utility-migration + accessibility sweep. Because dark mode is dormant, the palette goes directly in `:root` — no `dark` class, no toggle. `@theme inline` already maps semantic tokens to Tailwind utilities, so only raw `:root` values change.

## Phases at a Glance

| Phase                           | What it delivers                                                                   | Key risk                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1. Accessible cosmic tokens     | Whole app (dashboard/lists/auth controls) flips to cosmic via `:root` token values | Choosing palette lightness steps that pass AA without dulling the look             |
| 2. Unified header               | One `AppHeader` on landing/dashboard/list; `Topbar` deleted                        | Reconciling signed-in vs signed-out states and the lists page's header-less layout |
| 3. Landing restructure          | AsYouWish hero + how-it-works + value props + CTA                                  | Copy/layout quality; keeping decorative effects legible                            |
| 4. Token migration + a11y sweep | Auth + stray utilities tokenized; AA verified everywhere                           | Missing a mismatched surface or a failing contrast pair                            |

**Prerequisites:** None — presentation-only; no schema, service, or infra dependency. Local dev + Supabase already run.
**Estimated effort:** ~2–3 focused sessions across the four phases; Phase 1 carries the most iteration (palette + contrast).

## Open Risks & Assumptions

- **Contrast vs. character tension:** the current decorative values (translucent glass, light blue text) may need to change to pass AA on real controls; assumes toning those down is acceptable.
- **`.dark` block left dormant:** we set `:root`; if someone later adds a `dark` class/`ThemeProvider`, the `.dark` values must be aligned (Phase 1 addresses this with matched values or a comment).
- Assumes no unit/integration test harness exists (confirmed) — verification is build/`astro check`/lint plus manual visual + contrast checks.

## Success Criteria (Summary)

- Every page (`/`, auth, dashboard, list detail) shares one dark cosmic palette and one header, with no neutral-gray shadcn controls left.
- The landing page clearly explains AsYouWish (no `10x-astro-starter` boilerplate remains).
- All reused foreground/background pairs meet WCAG AA, verified by a contrast check and a full end-to-end walkthrough.
