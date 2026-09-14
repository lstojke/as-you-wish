# Unify App Visual Theme Implementation Plan

## Overview

Promote the landing page's "cosmic" colorway into the application's single, dark-only design-token theme and rework the landing page so its content describes AsYouWish instead of the `10x-astro-starter` boilerplate. Today the product reads as three different apps (cosmic landing, half-cosmic auth, neutral-gray dashboard/lists); after this change every page draws from one accessible token set and shares one header.

## Current State Analysis

The app currently has three inconsistent visual zones, and the cosmic palette lives entirely outside the design-token system:

- **Landing** ([src/components/Welcome.astro](src/components/Welcome.astro) + [src/components/Topbar.astro](src/components/Topbar.astro)): fully cosmic, built from hand-rolled utility classes (`bg-cosmic`, `bg-purple-500/20` orbs, an inline starfield gradient, `text-blue-100/70`, `text-purple-300`). Copy is generic starter boilerplate ("10x Astro Starter", "Authentication Ready", "Modern Stack", "Developer Experience").
- **Auth pages** ([signin.astro](src/pages/auth/signin.astro), [signup.astro](src/pages/auth/signup.astro), [confirm-email.astro](src/pages/auth/confirm-email.astro)): wrap themselves in a cosmic glass card (`bg-cosmic`, `bg-white/10`, purple/blue gradient headings) **but** the form controls inside them (`SignInForm`/`SignUpForm` → shadcn `Input`, `Button`, `FormField`) resolve to the neutral-gray tokens — so even these pages are already half-mismatched.
- **Dashboard + lists** ([dashboard.astro](src/pages/dashboard.astro), [lists/[id].astro](src/pages/lists/[id].astro) and their React islands): pure neutral-gray shadcn. All color comes from `--primary`, `--background`, `--card`, `--accent`, etc.

Key mechanics discovered during research:

- **The design tokens are stock neutral gray.** [src/styles/global.css](src/styles/global.css) `:root` and `.dark` blocks are the default shadcn "new-york" neutral scale (`--background: oklch(1 0 0)` light / `oklch(0.145 0 0)` dark, all chroma 0). `bg-cosmic` is defined separately as an `@utility` (a navy gradient) and never feeds a token. This split is the root cause: shadcn `Button`/`Card`/`Input`/`Badge` read tokens, so they never see the cosmic palette.
- **Dark mode is dormant.** The `.dark` token block exists and shadcn primitives are `dark:`-variant aware, but nothing applies the `dark` class — no `ThemeProvider` is mounted, `<body>` has no `dark`, and `next-themes` is consumed only by the Sonner toaster ([src/components/ui/sonner.tsx](src/components/ui/sonner.tsx) `useTheme`). So today the app always renders the light `:root` tokens.
- **`@theme inline` maps semantic tokens to Tailwind color utilities** in [src/styles/global.css](src/styles/global.css) (`--color-background: var(--background)` …). This is what makes `bg-background`, `text-foreground`, `bg-primary` resolve — it stays unchanged; only the raw `:root` values change.
- **Header patterns are triplicated.** [Topbar.astro](src/components/Topbar.astro) (landing-only, signed-in/out states), the inline sign-out header in [dashboard.astro](src/pages/dashboard.astro), and the lists page which has no header at all.

## Desired End State

A signed-out visitor lands on a page that clearly explains AsYouWish (private family wish lists with exclusive, identity-hidden reservations) via a hero → how-it-works → value-props → CTA structure, styled in the cosmic palette. Signing in and moving through the dashboard and a list detail page shows the **same** dark cosmic palette on every surface — buttons, inputs, cards, badges, menus — with a single shared header across all pages. Every reused text/background token pair meets WCAG 2.1 AA contrast.

Verification: with the dev server running, visit `/`, `/auth/signin`, `/auth/signup`, `/dashboard`, and a `/lists/<id>` page — all share one dark cosmic look, one header, and no neutral-gray shadcn controls remain. `npm run build`, `npm run lint`, and `npx astro check` pass.

### Key Discoveries:

- Design tokens are stock neutral gray and disconnected from `bg-cosmic` — [src/styles/global.css](src/styles/global.css) lines 6–74.
- `@theme inline` (lines 76–111) already wires semantic tokens to utilities; re-theming = editing `:root` values only.
- Dark mode never activates — no `ThemeProvider`, no `dark` class ([src/components/ui/sonner.tsx](src/components/ui/sonner.tsx) is the only `next-themes` consumer).
- Auth pages mix cosmic wrappers with neutral shadcn form controls — [signin.astro](src/pages/auth/signin.astro) lines 10–20.
- Three divergent header patterns: [Topbar.astro](src/components/Topbar.astro), [dashboard.astro](src/pages/dashboard.astro) lines 23–37, and lists (none).

## What We're NOT Doing

- **No light theme and no theme toggle.** Dark-only; the app renders the cosmic palette unconditionally. (`next-themes`/`ThemeProvider` wiring is out of scope; the Sonner `useTheme` consumer stays as-is.)
- Not changing any data model, service, API route, RLS policy, or business logic — this is presentation-only.
- Not restructuring dashboard/lists page **layouts** beyond adopting the shared header and inheriting the new tokens.
- Not removing the bespoke landing effects (orbs, starfield) — they stay as decorative inline utilities.
- Not adding new shadcn `ui/` components unless a phase explicitly needs one (e.g. a header/nav primitive); prefer restyling via tokens.
- Not writing marketing copy beyond the AsYouWish product story already scoped (no pricing, testimonials, etc.).

## Implementation Approach

Re-theme at the token layer first (Phase 1) so the largest surface — dashboard, lists, and auth form controls — flips to cosmic with one file's worth of value changes and zero per-component edits. Then unify the header (Phase 2), restructure the landing content (Phase 3), and finish by migrating the remaining hand-rolled utilities to tokens and running an accessibility sweep (Phase 4). Each phase is independently viewable in the browser, and the risky decisions (exact palette values, contrast) are front-loaded into Phase 1 where they're cheapest to iterate.

Because the app currently renders the **light** `:root` tokens (dark mode is dormant), the cleanest dark-only implementation is to set the cosmic palette **directly in `:root`** rather than relying on the `.dark` class. This avoids introducing a `ThemeProvider` or a `dark` class toggle and keeps the change to token values.

## Critical Implementation Details

- **Set the palette in `:root`, not `.dark`.** Since nothing applies the `dark` class today, editing `.dark` would have no effect. Put the cosmic values in `:root` so they render unconditionally. The `.dark` block can be left aligned to the same values (or left as-is) but is not the active path — call this out so the implementer doesn't "fix" it by adding a `dark` class.
- **Contrast is the gate, not aesthetics.** Several current landing values (`text-blue-100/60` on translucent glass) are decorative and will fail AA when reused as body text on solid buttons/inputs. When choosing token lightness steps, verify each `foreground`/`background` pair against WCAG AA (4.5:1 body text, 3:1 large text and UI component boundaries) before locking values.
- **`--primary` drives the most surfaces.** In shadcn, `--primary`/`--primary-foreground` colors the default `Button`, form focus rings derive from `--ring`, and `--destructive` stays a red. Pick a cosmic purple for `--primary` whose `--primary-foreground` text clears AA on that purple.

## Phase 1: Accessible cosmic design tokens

### Overview

Replace the stock neutral-gray token values in `:root` with a WCAG-AA-tuned cosmic palette (navy surfaces, purple/blue accents), so every shadcn-driven surface (dashboard, lists, auth controls) inherits the cosmic look with no per-component edits.

### Changes Required:

#### 1. Cosmic token values

**File**: [src/styles/global.css](src/styles/global.css)

**Intent**: Redefine the `:root` custom properties as an accessible cosmic dark palette (dark navy `--background`/`--card`/`--popover`, cosmic-purple `--primary`, blue/indigo `--accent`, muted slate `--muted`/`--muted-foreground`, translucent `--border`/`--input`, purple `--ring`), keeping `--destructive` a legible red. Tune each lightness step so foreground/background pairs meet AA.

**Contract**: The set of `--*` variables in the `:root` block (background, foreground, card(+foreground), popover(+foreground), primary(+foreground), secondary(+foreground), muted(+foreground), accent(+foreground), destructive, border, input, ring, and the `--sidebar-*` group). Names and the `@theme inline` mapping are unchanged — only values change. Keep `oklch()` format for consistency with the existing file.

#### 2. Keep decorative cosmic utilities coherent

**File**: [src/styles/global.css](src/styles/global.css)

**Intent**: Ensure the existing `bg-cosmic` `@utility` gradient reads as the same family as the new `--background` token so landing/auth backgrounds and token backgrounds don't clash. Adjust the gradient stops only if needed for coherence.

**Contract**: The `@utility bg-cosmic` block; its gradient endpoints should visually match `--background`.

#### 3. Align dormant `.dark` values (optional coherence)

**File**: [src/styles/global.css](src/styles/global.css)

**Intent**: Since dark mode is dormant, set the `.dark` block to the same cosmic values (or leave a comment noting `:root` is the active dark theme) so a future `dark`-class activation doesn't revert to neutral gray.

**Contract**: The `.dark` block values and/or a one-line comment documenting that `:root` carries the active dark-only theme.

### Success Criteria:

#### Automated Verification:

- Build succeeds: `npm run build`
- Astro type/diagnostics pass: `npx astro check`
- Lint passes: `npm run lint`

#### Manual Verification:

- Dashboard and a list detail page render in the cosmic palette (no neutral-gray buttons, cards, inputs, or badges).
- Auth form controls (inputs, submit button) match the cosmic glass wrapper instead of showing gray.
- Primary buttons, focus rings, destructive (delete) buttons, and disabled states are all legible.
- Every reused foreground/background token pair meets WCAG AA (spot-check primary button text, body text on card, muted text, input placeholder) using browser devtools or a contrast checker.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the palette + contrast look right before proceeding.

---

## Phase 2: Unified themed header

### Overview

Replace the three divergent header patterns with one shared, token-styled header/nav that handles signed-in and signed-out states, and mount it on landing, dashboard, and list pages.

### Changes Required:

#### 1. Shared header component

**File**: `src/components/AppHeader.astro` (new; supersedes [src/components/Topbar.astro](src/components/Topbar.astro))

**Intent**: Create one header that reads `Astro.locals.user`, shows the AsYouWish wordmark/home link, and renders signed-in actions (Dashboard link, sign-out form posting to `/api/auth/signout`) or signed-out actions (Sign in / Sign up). Style with tokens (`bg-card`/`bg-background`, `text-foreground`, `text-primary`) instead of hand-rolled `text-purple-300`/`bg-white/5`.

**Contract**: An Astro component taking no required props (reads `Astro.locals.user`), covering both auth states; sign-out posts `POST /api/auth/signout` (preserve existing endpoint contract).

#### 2. Mount on dashboard

**File**: [src/pages/dashboard.astro](src/pages/dashboard.astro)

**Intent**: Replace the inline sign-out header block with `AppHeader`; keep the "Your wish lists" page heading and the signed-in email line (or move the email into the header, implementer's discretion to avoid duplication).

**Contract**: The `<header>` block in `dashboard.astro` (lines ~23–37) is replaced by `<AppHeader />`; sign-out still works.

#### 3. Mount on list detail

**File**: [src/pages/lists/[id].astro](src/pages/lists/[id].astro)

**Intent**: Add `AppHeader` above the `<main>` so the list page gains consistent navigation it currently lacks.

**Contract**: `<AppHeader />` rendered inside the `Layout`, above `<ListDetail>`.

#### 4. Landing adopts the shared header

**File**: [src/components/Welcome.astro](src/components/Welcome.astro) (and delete [src/components/Topbar.astro](src/components/Topbar.astro))

**Intent**: Swap the `Topbar` import/usage for `AppHeader`; remove the now-unused `Topbar.astro`.

**Contract**: `Welcome.astro` imports and renders `AppHeader` instead of `Topbar`; `Topbar.astro` is deleted and has no remaining references.

### Success Criteria:

#### Automated Verification:

- Build succeeds: `npm run build`
- Astro check passes: `npx astro check`
- Lint passes: `npm run lint`
- No stray references to the old component: `grep -r "Topbar" src` returns nothing.

#### Manual Verification:

- The same header appears on landing, dashboard, and a list page.
- Signed-out header shows Sign in / Sign up; signed-in header shows Dashboard + Sign out.
- Sign-out from the header logs the user out and redirects as before.
- Header colors match the cosmic palette on every page.

**Implementation Note**: After automated verification passes, pause for human confirmation that the shared header looks and behaves correctly on all three page types before proceeding.

---

## Phase 3: Landing page restructure

### Overview

Rewrite [Welcome.astro](src/components/Welcome.astro) content into an AsYouWish product page: hero → how-it-works → value props → footer CTA, styled with tokens plus the retained cosmic effects.

### Changes Required:

#### 1. Hero section

**File**: [src/components/Welcome.astro](src/components/Welcome.astro)

**Intent**: Replace the "10x Astro Starter" headline and generic subhead with AsYouWish messaging — a headline naming the product and its promise (coordinate family gifts without duplicates), a subhead describing private shared wish lists with exclusive reservations, and the existing Sign in / Sign up CTAs.

**Contract**: The hero block; CTA links continue to point at `/auth/signin` and `/auth/signup`.

#### 2. How-it-works section

**File**: [src/components/Welcome.astro](src/components/Welcome.astro)

**Intent**: Replace the three generic feature cards with a three-step flow: **Create** a wish list and add items → **Share** it with your family by email invite → **Reserve** an item so no one double-buys. Each step gets a short label + one line of copy and an icon.

**Contract**: A three-item section mapping to the real flows (create-list, share-by-invite, reserve-item); reuses the existing card/lucide-icon pattern styled via tokens.

#### 3. Value-props section

**File**: [src/components/Welcome.astro](src/components/Welcome.astro)

**Intent**: Add a value-props section highlighting the differentiators: no duplicate gifts, the reserver's identity is hidden from the list owner, and it's a private circle (not a public registry).

**Contract**: A new content section (2–3 value props); copy grounded in the PRD's headline value prop.

#### 4. Footer CTA

**File**: [src/components/Welcome.astro](src/components/Welcome.astro)

**Intent**: Add a closing call-to-action driving sign-up.

**Contract**: A CTA block linking to `/auth/signup` (and/or `/auth/signin`).

#### 5. Token-based styling for new content

**File**: [src/components/Welcome.astro](src/components/Welcome.astro)

**Intent**: Style the new sections with token utilities (`text-foreground`, `text-muted-foreground`, `bg-card`, `border-border`, `text-primary`) rather than hand-coded `text-blue-100`/`purple-600`, keeping the orb/starfield decorative layers as-is.

**Contract**: New sections use token utilities; decorative orb/starfield divs remain.

### Success Criteria:

#### Automated Verification:

- Build succeeds: `npm run build`
- Astro check passes: `npx astro check`
- Lint passes: `npm run lint`
- No leftover boilerplate strings: `grep -ri "10x astro starter\|Authentication Ready\|Modern Stack\|Developer Experience" src` returns nothing.

#### Manual Verification:

- Landing page reads as AsYouWish: hero, how-it-works (create → share → reserve), value props (no duplicates, hidden reserver, private circle), and a closing CTA.
- All CTAs navigate to the correct auth pages.
- Layout is responsive (mobile + desktop) and text is legible against the cosmic background (AA).

**Implementation Note**: After automated verification passes, pause for human confirmation on copy and layout before proceeding.

---

## Phase 4: Token migration + accessibility sweep

### Overview

Replace the remaining hand-rolled color utilities (primarily the auth pages) with token-based classes so nothing bypasses the shared theme, then run a full WCAG AA contrast audit across every page and fix regressions.

### Changes Required:

#### 1. Auth page token migration

**File**: [src/pages/auth/signin.astro](src/pages/auth/signin.astro), [src/pages/auth/signup.astro](src/pages/auth/signup.astro), [src/pages/auth/confirm-email.astro](src/pages/auth/confirm-email.astro)

**Intent**: Replace hand-coded `bg-white/10`, `text-blue-100/60`, `text-purple-300`, gradient headings, and `border-white/10` with token utilities (`bg-card`/`bg-popover`, `text-muted-foreground`, `text-primary`, `border-border`) so the card chrome matches the form controls themed in Phase 1. Keep `bg-cosmic` as the page backdrop.

**Contract**: Auth page wrapper/card/heading/link classes switch to token utilities; `bg-cosmic` backdrop retained; the `SignInForm`/`SignUpForm` islands are untouched (already token-driven).

#### 2. Stragglers sweep

**File**: workspace-wide (`src/**`)

**Intent**: Find and convert any remaining hard-coded color utilities that should be tokens (`text-purple-*`, `text-blue-*`, `bg-white/*`, `border-white/*`) outside the intentional decorative landing effects.

**Contract**: `grep -rE "text-(purple|blue)-[0-9]|bg-white/|border-white/" src` returns only the intentional decorative landing orb/starfield/hero-gradient usages; everything else is tokenized.

#### 3. Accessibility audit + fixes

**File**: [src/styles/global.css](src/styles/global.css) (token tweaks if needed) and any page with a flagged pair

**Intent**: Audit contrast on every page (landing, signin, signup, confirm-email, dashboard, list detail) — body text, muted text, primary/secondary/destructive buttons, input placeholders and borders, badges, focus rings — and adjust token values or specific classes to clear AA.

**Contract**: All reused foreground/background pairs meet WCAG 2.1 AA (4.5:1 body, 3:1 large text / UI boundaries); focus-visible rings remain visible on the cosmic background.

### Success Criteria:

#### Automated Verification:

- Build succeeds: `npm run build`
- Astro check passes: `npx astro check`
- Lint passes: `npm run lint`
- Straggler grep is clean: `grep -rE "text-(purple|blue)-[0-9]|bg-white/|border-white/" src` returns only intentional decorative landing usages.

#### Manual Verification:

- Auth cards, form controls, and links all match the cosmic palette (no white/gray glass mismatch).
- A contrast checker confirms AA on: primary button text, body text on card, muted text, input placeholder/border, badge text, and destructive button text.
- Keyboard focus rings are clearly visible on inputs and buttons across pages.
- Full walkthrough (`/` → sign up → dashboard → open a list → reserve/edit) shows one consistent theme with no visual regressions in dialogs, dropdown menus, toasts, or badges.

**Implementation Note**: After automated verification passes, pause for final human confirmation of the end-to-end visual walkthrough and accessibility spot-checks.

---

## Testing Strategy

### Unit Tests:

- None — the repo has no unit-test harness and this change is presentation-only. Rely on build, `astro check`, lint, and manual verification.

### Integration Tests:

- None automated. The "integration" surface is visual consistency, verified manually per phase.

### Manual Testing Steps:

1. Run `npm run dev` and open `/` — confirm cosmic hero, how-it-works, value props, CTA, and the shared header.
2. Sign up / sign in — confirm auth cards and form controls share the cosmic palette; check keyboard focus rings.
3. On `/dashboard` — confirm cards, buttons, badges, create/rename/delete dialogs, and dropdown menus are all cosmic-themed and legible.
4. Open a list `/lists/<id>` — confirm the shared header, item cards, reserve/edit/delete controls, and toasts are themed.
5. Run a contrast checker on primary button text, body text, muted text, input placeholder, and badge text — confirm AA.
6. Resize to mobile width — confirm landing and inner pages remain legible and unbroken.

## Performance Considerations

Negligible. Changes are CSS token values and markup; no new runtime dependencies, no JavaScript added (dark-only means no `ThemeProvider`/hydration for theming). Deleting `Topbar.astro` and consolidating headers slightly reduces duplication.

## Migration Notes

No data or schema migration. The only structural code change is replacing `Topbar.astro` with `AppHeader.astro`; ensure no dangling imports remain (`grep -r "Topbar" src`). Because dark mode was never active, setting the palette in `:root` is backward-compatible — no toggle or persisted preference to migrate.

## References

- Change identity: [context/changes/unify-app-visual-theme/change.md](context/changes/unify-app-visual-theme/change.md)
- Token system + `bg-cosmic`: [src/styles/global.css](src/styles/global.css)
- Landing + header source: [src/components/Welcome.astro](src/components/Welcome.astro), [src/components/Topbar.astro](src/components/Topbar.astro)
- Auth pages: [src/pages/auth/signin.astro](src/pages/auth/signin.astro), [src/pages/auth/signup.astro](src/pages/auth/signup.astro), [src/pages/auth/confirm-email.astro](src/pages/auth/confirm-email.astro)
- Dashboard/list headers: [src/pages/dashboard.astro](src/pages/dashboard.astro), [src/pages/lists/[id].astro](src/pages/lists/[id].astro)
- shadcn primitives that inherit tokens: [src/components/ui/button.tsx](src/components/ui/button.tsx), [src/components/ui/input.tsx](src/components/ui/input.tsx), [src/components/ui/badge.tsx](src/components/ui/badge.tsx)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Accessible cosmic design tokens

#### Automated

- [x] 1.1 Build succeeds: `npm run build`
- [x] 1.2 Astro type/diagnostics pass: `npx astro check`
- [x] 1.3 Lint passes: `npm run lint`

#### Manual

- [x] 1.4 Dashboard and list detail render cosmic (no neutral-gray controls)
- [x] 1.5 Auth form controls match the cosmic glass wrapper
- [x] 1.6 Primary/destructive/disabled/focus states legible
- [x] 1.7 Reused foreground/background token pairs meet WCAG AA

#### Project identity rename (added scope — 2026-09-14)

- [x] 1.8 Renamed `10x-astro-starter` → `as-you-wish` in package.json, package-lock.json, wrangler.jsonc top-level name, Layout.astro default title, config-status docsUrl, and README title/clone
- [x] 1.9 Fixed pre-existing InviteDialog resolver typing (preprocess-free form schema) so `npx astro check` passes clean; build/lint green, only intentional refs remain (supabase project_id kept, Welcome headline deferred to Phase 3)

### Phase 2: Unified themed header

#### Automated

- [ ] 2.1 Build succeeds: `npm run build`
- [ ] 2.2 Astro check passes: `npx astro check`
- [ ] 2.3 Lint passes: `npm run lint`
- [ ] 2.4 `grep -r "Topbar" src` returns nothing

#### Manual

- [ ] 2.5 Same header on landing, dashboard, and list pages
- [ ] 2.6 Signed-out vs signed-in header states correct
- [ ] 2.7 Header sign-out logs out and redirects as before
- [ ] 2.8 Header colors match the cosmic palette everywhere

### Phase 3: Landing page restructure

#### Automated

- [ ] 3.1 Build succeeds: `npm run build`
- [ ] 3.2 Astro check passes: `npx astro check`
- [ ] 3.3 Lint passes: `npm run lint`
- [ ] 3.4 No boilerplate strings remain (`grep -ri` clean)

#### Manual

- [ ] 3.5 Landing reads as AsYouWish (hero + how-it-works + value props + CTA)
- [ ] 3.6 All CTAs navigate to correct auth pages
- [ ] 3.7 Responsive and legible against cosmic background (AA)

### Phase 4: Token migration + accessibility sweep

#### Automated

- [ ] 4.1 Build succeeds: `npm run build`
- [ ] 4.2 Astro check passes: `npx astro check`
- [ ] 4.3 Lint passes: `npm run lint`
- [ ] 4.4 Straggler grep returns only intentional decorative usages

#### Manual

- [ ] 4.5 Auth cards/controls/links match the cosmic palette
- [ ] 4.6 Contrast checker confirms AA on key text/UI pairs
- [ ] 4.7 Keyboard focus rings visible across pages
- [ ] 4.8 Full walkthrough shows one consistent theme, no dialog/menu/toast/badge regressions
