# AGENTS.md

Guidance for AI coding agents working in this repo. For deeper context, see [README.md](./README.md) and [CLAUDE.md](./CLAUDE.md).

## Stack at a glance

Astro 6 (SSR, `output: "server"`) + React 19 islands + Tailwind 4 + Supabase (`@supabase/ssr`) + shadcn/ui ("new-york"). Deployed to Cloudflare Workers via `@astrojs/cloudflare`. Node 22.14 (see `.nvmrc`).

## Commands

Project scripts: see `scripts` and `lint-staged` in @package.json. The `dev` script runs Astro on the Cloudflare workerd runtime (not plain Node).

Not in `scripts` (run via `npx`):

- `npx supabase start` — local Supabase stack (needs Docker)
- `npx wrangler deploy` — deploy to Cloudflare (Workers Builds auto-deploys on `master` push; manual use only for hotfix)
- `npx wrangler rollback --env production --message "<reason>"` — revert to the prior deployment in seconds. Does **not** roll back Supabase migrations — write migrations backward-compatible with the previous Worker.

## Deploy & rollback

- Auto-deploy: pushes to `master` trigger Cloudflare Workers Builds, which runs `npm run build` then `npx wrangler deploy --env production`. The `master` merge itself is the human gate.
- Preview Worker (`as-you-wish-preview`) is wired separately and deploys non-`master` branches; it must point at a non-prod Supabase project before use.
- Agent unattended scope: preview deploys and `npx wrangler tail` are OK without confirmation. Direct production deploys (`wrangler deploy --env production`) require human confirmation — prefer `git push` + Workers Builds.

## Conventions agents must follow

- **Path alias**: import via `@/*` → `src/*`.
- **Astro vs React**: use `.astro` for static/layout content; only reach for React when interactivity is needed. No Next.js directives (`"use client"`, etc.).
- **API routes** (`src/pages/api/**`): export uppercase `GET`/`POST`; **must** set `export const prerender = false;` (the whole app is SSR but be explicit on endpoints); validate input with `zod`.
- **Tailwind**: merge classes with `cn()` from `@/lib/utils` (clsx + tailwind-merge). Never concatenate class strings.
- **shadcn/ui**: components live in `src/components/ui/`. Add new ones via `npx shadcn@latest add <name>` — don't hand-roll equivalents.
- **Hooks**: extract React hooks to `src/components/hooks/`.
- **Services/business logic**: `src/lib/` (or `src/lib/services/`).
- **Shared types/DTOs/entities**: `src/types.ts`.
- **Env vars**: server-only, declared in `astro.config.mjs` under `env.schema`. Access via `astro:env/server` — never `import.meta.env` for `SUPABASE_*` secrets. Local Node uses `.env`; Cloudflare local dev uses `.dev.vars` (gitignored).
- **Supabase migrations**: place in `supabase/migrations/` as `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables and write granular per-operation, per-role policies.

## Auth flow (do not duplicate)

- SSR client: `src/lib/supabase.ts` (cookie-based session via `@supabase/ssr`).
- `src/middleware.ts` resolves the user, sets `context.locals.user`, and gates `PROTECTED_ROUTES`. Add new protected paths to that array — don't reimplement guards in pages.
- Endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`. UI: `src/pages/auth/*.astro`.

## Pitfalls

- Cloudflare runtime ≠ Node. Avoid Node-only APIs (`fs`, `path`, native `process`) in code that runs at the edge.
- The build step requires `SUPABASE_URL` and `SUPABASE_KEY` — see @.github/workflows/ci.yml for the CI build env (same secrets need to be set in the GitHub repo).
- `output: "server"` means every page hits the server; don't assume static behavior.
- Two env files: `.env` (Node tooling) and `.dev.vars` (workerd via `wrangler`). Keep them in sync locally.
