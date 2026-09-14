---
change_id: unify-app-visual-theme
title: Rework landing page copy and extend its colorway app-wide
status: implementing
created: 2026-09-13
updated: 2026-09-14
archived_at: null
---

## Notes

Two related problems raised by the user:

1. **Landing page is out of app context.** `src/components/Welcome.astro` (rendered by `src/pages/index.astro`) still carries the generic `10x-astro-starter` template copy ("10x Astro Starter", "Authentication Ready", "Modern Stack", "Developer Experience" feature cards) — none of it mentions AsYouWish, wish lists, or the reservation flow. `Topbar.astro` (shared header used only on the landing page today) is otherwise fine but should reflect the same rewrite.
2. **Colorway is landing-page-only.** The cosmic dark theme (starfield background via `bg-cosmic` utility in `src/styles/global.css`, purple/blue gradient orbs, `text-blue-100/70`, `text-purple-300` accents) is hand-rolled inline in `Welcome.astro`/`Topbar.astro` and never fed into the shadcn/Tailwind design tokens (`--background`, `--primary`, `--accent`, etc. in `src/styles/global.css`). Every other page (`dashboard.astro`, `auth/*.astro`, `lists/*`) uses the default neutral-gray shadcn theme, so the app looks like two different products.

**Rough surface for `/10x-plan` to size:**

- Rewrite landing copy to describe AsYouWish's actual value prop (private family wish lists, exclusive reservations, hidden reserver identity) instead of starter boilerplate.
- Decide dark-only vs. light+dark: current shadcn tokens support both via `.dark` class but there's no theme toggle wired up (`next-themes` is a dependency already).
- Promote the cosmic palette into the CSS custom properties (`:root`/`.dark` blocks) so `bg-background`, `bg-primary`, etc. resolve to it everywhere, rather than pages hand-coding `purple-600`/`blue-100` utility classes.
- Audit contrast/accessibility once the palette moves to buttons, form inputs, and shadcn `ui/` primitives (currently neutral-gray) — this is a cross-cutting visual change touching every page, so regressions are easy to miss without a checklist.
- `Topbar.astro` is landing-only; decide whether it merges with or replaces the dashboard/lists header patterns once the palette is shared.
