# Cloudflare Integration & Deployment Plan

## Context

`context/foundation/infrastructure.md` recommended Cloudflare Workers; the scaffold already wires `@astrojs/cloudflare` v13.5, `wrangler` 4.90, observability, and `nodejs_compat`. What's missing for a green deploy: (a) named **preview** + **production** environments in `wrangler.jsonc`, (b) Cloudflare Workers Builds (CF's hosted CI) connected to GitHub for auto-deploy on `master`, and (c) the operational guard-rails listed in the Risk Register (Supabase env duplication, workerd auth smoke test, Pages-era config audit).

User decisions: scope = wrangler envs + auto-deploy on master via **Cloudflare Workers Builds** (not a GitHub Actions deploy job). Logs/observability and custom domain mapping are out of scope for this pass.

---

## Critical files

- `wrangler.jsonc` — add `env.preview` / `env.production` blocks, audit for Pages remnants.
- `astro.config.mjs` — confirm `output: "server"`, `adapter: cloudflare()`, no Pages-era options.
- `.github/workflows/ci.yml` — no deploy job added; Workers Builds owns deploy. CI continues to lint + build for PRs.
- `.dev.vars` (gitignored) — keep in sync with `.env` for local Node tooling.
- `package.json` — no script changes required; Workers Builds runs `npm run build` then `npx wrangler deploy`.

Reuse existing: `astro:env/server` schema in `astro.config.mjs:17-22`, middleware auth gate at `src/middleware.ts`, Supabase SSR client at `src/lib/supabase.ts`.

---

## Phase 0 — CLI & Supabase setup (prerequisites)  ✅

One-time human-driven setup before any deploy work. All commands assume the repo root as cwd and Node 22.14 (see `.nvmrc`).

### 0.1 Wrangler CLI

Wrangler is already pinned at `^4.90.0` in `package.json` devDependencies — **do not install globally**. Always invoke via `npx wrangler ...` so the project version is used.

- [x] `npx wrangler --version` — confirms install (>= 4.90.x).
- [x] `npx wrangler login` — one-time interactive browser auth. Subsequent agent operations are non-interactive and reuse the OAuth token in `~/.config/.wrangler/`.
- [x] `npx wrangler whoami` — verify the right Cloudflare account is selected. If multiple accounts, set `CLOUDFLARE_ACCOUNT_ID` in `.dev.vars` (gitignored) or your shell rc — wrangler does **not** prompt mid-deploy when ambiguous, it fails.

**Edge case — corporate SSO Cloudflare account:** `wrangler login` opens the browser to `dash.cloudflare.com`. If SSO redirects loop, run `npx wrangler login --browser=false` and paste the URL into a profile already signed in.

**Edge case — token-only CI (not Workers Builds):** for non-Workers-Builds automation, generate a scoped API token at `dash.cloudflare.com → My Profile → API Tokens → Edit Cloudflare Workers` template. Export as `CLOUDFLARE_API_TOKEN`. Not needed for our Workers Builds path.

### 0.2 Supabase CLI

`supabase` is already pinned at `^2.23.4` in devDependencies. Same rule: `npx supabase ...`, no globals.

- [x] Docker Desktop installed and running (required for `supabase start` local stack).
- [x] `npx supabase --version` — confirms install.
- [x] `npx supabase login` — opens browser, generates a personal access token.
- [x] `npx supabase link --project-ref <ref>` — `<ref>` is the 20-char slug from the Supabase dashboard URL (`https://supabase.com/dashboard/project/<ref>`). For this repo's existing project, ref is `cczokqzymnuxguweizxe` (parsed from `.dev.vars` `SUPABASE_URL`). Stores link state in `supabase/.temp/` (gitignored).
- [x] Verify link: `npx supabase projects list` — linked project should show a checkmark.

**Edge case — `supabase link` prompts for DB password:** the password is the Postgres password set when the Supabase project was created, **not** the dashboard login. Reset under Dashboard → Project Settings → Database → Reset database password if lost. After reset, all existing connections re-handshake; coordinate with active sessions.

**Edge case — Docker not running:** `npx supabase start` fails opaquely. Start Docker Desktop first; `docker info` should return without error.

### 0.3 Local Supabase stack (optional but recommended)

For migrations work and feature dev against a disposable DB.

- [x] `npx supabase start` — boots Postgres + Auth + Storage + Studio at `127.0.0.1:54321-54324`. First run pulls ~2 GB of images.
- [x] Copy the printed `anon key` and `API URL` into `.env` as `SUPABASE_URL=http://127.0.0.1:54321` and `SUPABASE_KEY=<anon>`. **Keep `.dev.vars` pointed at the remote project** if you want `wrangler dev` to hit prod-shaped data; or mirror local URLs there too if testing migrations end-to-end.
- [x] `npx supabase stop` when done — frees ports and ~1 GB RAM.

### 0.4 Supabase remote project — secrets & migrations

- [x] Confirm remote project exists. Current project ref: `cczokqzymnuxguweizxe` (from `.dev.vars`). If creating a **separate preview project** (recommended in Phase 4), repeat: Dashboard → New Project → copy the new URL + anon key.
- [x] Pull the remote schema into local migrations on first sync: `npx supabase db pull` — generates a `supabase/migrations/<timestamp>_remote_schema.sql`.
- [x] Schema changes workflow:
  1. Author SQL in `supabase/migrations/YYYYMMDDHHmmss_short_description.sql` (`AGENTS.md:38`).
  2. Test locally: `npx supabase db reset` (rebuilds local DB from migrations).
  3. Apply to remote — **human-only** per `infrastructure.md:80`: `npx supabase db push --linked`.
  4. Migrations must be **backward compatible** with the currently-deployed Worker (Risk Register: "Schema migration applied but Worker deploy fails mid-rollout").
- [x] RLS — every new table needs `alter table ... enable row level security;` plus granular per-role policies (`AGENTS.md:39`). `supabase db push` does **not** warn if RLS is missing; checked manually in the migration review.

**Edge case — `supabase db push` divergence:** if a migration was applied directly via SQL editor in the dashboard, `db push` refuses with "remote migration history doesn't match local". Run `npx supabase migration repair --status applied <version>` to reconcile, then push.

**Edge case — anon vs service_role key:** the `SUPABASE_KEY` we wire is the **anon** key — RLS enforces per-user access. Never put the `service_role` key in `.dev.vars` or Workers Builds env without a deliberate decision; service_role bypasses RLS entirely.

### 0.5 Sanity check

- [x] `npm run dev` — homepage loads at `http://localhost:4321/`, signed-out state.
- [x] Signup via UI → check Supabase Dashboard → Authentication → Users — new row present.
- [x] `npx wrangler dev` (separate terminal) — same flow under workerd, port 8787. Compare cookie `Secure` / `SameSite` attrs to `astro dev` (workerd may differ).

---

## Phase 1 — Pre-flight audit  ✅

- [x] Confirm `astro.config.mjs` has `output: "server"` and no `pages_build_output_dir` / `_routes.json` / `_headers` / `[functions]` leftovers.
- [x] Confirm `wrangler.jsonc` has `compatibility_date >= 2024-09-23`, `compatibility_flags: ["nodejs_compat"]`, `observability.enabled: true` (already present).
- [x] `package.json` `name` and `wrangler.jsonc` top-level `name` agree (both `10x-astro-starter`). Per-env Worker names (`as-you-wish`, `as-you-wish-preview`) are set under `env.*.name` and override the top-level name on deploy.
- [x] `.dev.vars` populated locally with `SUPABASE_URL`, `SUPABASE_KEY`; `.env` matches.

**Edge case — Pages-era revival:** if AI-suggested edits ever add `pages_build_output_dir` or `compatibility_flags: ["pages_compat"]`, the deploy will silently degrade. Treat any such addition as a regression.

---

## Phase 2 — Define wrangler environments  ✅

Edit `wrangler.jsonc` to add named environments. Cloudflare Workers Builds does **not** auto-pick `[env.*]` — each environment becomes its own Worker (`as-you-wish-preview`, `as-you-wish`) connected to the repo separately.

- [x] Add `env.preview` block — Worker name `as-you-wish-preview`, inherits `compatibility_date`, `compatibility_flags`, `assets`, `observability`.
- [x] Add `env.production` block — Worker name `as-you-wish`.
- [x] Locally verify with `npx wrangler deploy --env preview --dry-run` and `--env production --dry-run` (read-only; no auth required for dry run with `--outdir`).
- [x] One-time human step (out of agent scope): `npx wrangler login` so subsequent local deploys are non-interactive.

**Edge case — env var > 5 KB:** never put long secrets in `vars`. Always use `wrangler secret put` (or the dashboard Variables & Secrets UI). Documented at `infrastructure.md:96`.

---

## Phase 3 — Cloudflare Workers Builds wiring (production)  ✅

Done in the Cloudflare dashboard once; subsequent deploys are agent-driven via git push.

- [x] Dashboard → **Workers & Pages → Create application → Import a repository**. Requires GitHub Owner or GitHub Apps Manager role on the org to install the "Cloudflare Workers and Pages" GitHub App.
- [x] Select repo, name the Worker exactly `as-you-wish` (must match `wrangler.jsonc` `env.production.name`).
- [x] **Build configuration**:
  - Build command: `npm run build`
  - Deploy command: `npx wrangler deploy --env production`
  - Root directory: `/`
  - Branch: `master`
- [x] **Settings → Build → Build variables and secrets** — add `SUPABASE_URL` and `SUPABASE_KEY` (these are visible to `astro build` only).
- [x] **Settings → Variables & Secrets** — add `SUPABASE_URL` and `SUPABASE_KEY` again (runtime bindings consumed via `astro:env/server`). **Both UIs are required** — this is the most common Workers Builds footgun.
- [x] Trigger first build by pushing to `master` or "Retry deployment" in dashboard. Verify the `*.workers.dev` URL serves the signed-out homepage. — Live at `https://as-you-wish.as-you-wish.workers.dev/` (HTTP 200).

**Edge case — first build fails on secret lookup:** check both env-var UIs (build vs runtime) — values added only under "Variables & Secrets" are not available during `astro build`, and Astro's `envField` with `access: "secret"` will fail-fast at build time.

**Edge case — GitHub App install denied:** if the user lacks org-admin rights, ask the org owner to install the Cloudflare Workers and Pages app on this repo only; do not request org-wide install.

---

## Phase 4 — Preview environment + PR builds  ☐

Workers Builds previews are **off by default**.

- [ ] Repeat Phase 3 steps for a second Worker named `as-you-wish-preview`, deploy command `npx wrangler deploy --env preview`, branch filter = "all non-production branches".
- [ ] **Settings → Build → Branch control → Builds for non-production branches: ON.** This emits a stable preview URL per branch and posts a PR comment via the GitHub App.
- [ ] Mirror the same `SUPABASE_URL`/`SUPABASE_KEY` into both build and runtime UIs on the preview Worker. **Use a separate Supabase project (or at minimum, a non-prod schema/RLS-isolated dataset)** — preview deploys will run against whatever DB you wire here.

**Edge case — fork PRs:** Workers Builds does not pass secrets to fork PR builds (same constraint as GitHub Actions). Accept for the family-circle MVP per `infrastructure.md:77`.

**Edge case — preview branch storm:** every branch deploy consumes a Workers Builds minute quota (3000 min/mo free). For a 3-week MVP this is fine; revisit if branch count explodes.

---

## Phase 5 — External integrations cross-check  ✅

- [x] **Supabase auth under workerd**: ran `wrangler dev` and walked signup → signin → refresh → signout. Cookies: `SameSite=Lax`, `Path=/` confirmed. `Secure` and `HttpOnly` are off — `@supabase/ssr` default (no `Secure` over HTTP localhost, no `HttpOnly` because the browser-side client reads `document.cookie`). On HTTPS production, `Secure` is also off because the cookie handler in `src/lib/supabase.ts:17-20` does not set it. **Acceptable for MVP** since `*.workers.dev` is HTTPS-only; follow-up to merge `secure: import.meta.env.PROD` into cookie options.
- [x] **Supabase migrations**: human-only, documented in `AGENTS.md` ("Commands" → wrangler rollback note) and `infrastructure.md:80`. Workers Builds does not run migrations.
- [x] **AI gift suggestions (FR-016)**: deferred — workerd spike required before importing any official AI SDK.
- [x] **`.env` vs `.dev.vars` drift**: documented in `AGENTS.md:42`. Optional sync-check script deferred.

## Phase 6 — Rollback & ops  ✅

- [x] Rollback command documented in `AGENTS.md` ("Commands" + "Deploy & rollback" sections): `npx wrangler rollback --env production --message "<reason>"`. Migrations are **not** reverted.
- [x] Agent unattended scope documented in `AGENTS.md` "Deploy & rollback": preview deploy + `wrangler tail` OK; production deploy requires human confirmation (Workers Builds master gate is the default path).
- [ ] **Optional manual prod gate** (deferred): `wrangler versions upload` + manual promote — not enabled, auto-deploy on master is the chosen path.

---

## Verification

End-to-end smoke after Phase 3:

1. `git push origin master` → Workers Builds dashboard shows green build + deploy.
2. `curl -I https://as-you-wish.<account>.workers.dev/` returns 200; signed-out homepage renders.
3. Signup → email confirm → signin → protected page loads → signout. Each step verified against Supabase Auth dashboard (user row appears).
4. `npx wrangler tail --env production` streams a request log when you hit the URL.
5. PR a no-op change → preview Worker emits a `*.workers.dev` URL in the PR comment; that URL also renders the homepage.
6. `npx wrangler rollback --env production --dry-run` lists prior versions (proves rollback is wired).

Cloudflare MCP cross-check (read-only, agent-friendly):
- `https://docs.mcp.cloudflare.com/mcp` — adapter / config questions.
- `https://observability.mcp.cloudflare.com/mcp` — post-deploy log + analytics queries.

---

## Out of scope (deferred)

Per `infrastructure.md:108-115` and user scope answers:
- Workers Logs / Logpush to R2 retention setup.
- Custom domain mapping (`*.workers.dev` is sufficient for MVP).
- Cloudflare Access policies for fork-PR previews.
- GitHub Actions deploy job (replaced by Workers Builds).
