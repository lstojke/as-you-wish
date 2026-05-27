---
project: AsYouWish
researched_at: 2026-05-25
recommended_platform: Cloudflare Workers
runner_up: Netlify
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 (SSR) + React 19
  runtime: Cloudflare Workers (workerd) via @astrojs/cloudflare
---

## Recommendation

**Deploy on Cloudflare Workers.**

The 10x-astro-starter scaffold already wires `@astrojs/cloudflare`, `wrangler`, and `.dev.vars` — the platform decision is essentially "keep the rails you're on" with full justification. Workers' 100k-request/day free tier covers a 3-week, after-hours, single-region family-MVP at ~$0; Supabase already handles auth/DB/email externally, neutralizing the usual co-location argument; and Cloudflare ships the broadest agent surface of any candidate (12+ remote MCP servers GA, official `llms.txt`, `wrangler` covers deploy/rollback/tail/secrets non-interactively).

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Verdict |
|---|---|---|---|---|---|---|
| **Cloudflare Workers** | Pass — `wrangler` covers full lifecycle | Pass — fully serverless, no OS surface | Pass — `developers.cloudflare.com/llms.txt` GA, per-product `llms.txt` | Pass — `wrangler deploy` / `wrangler rollback` GA | Pass — Docs, Observability, Workers Bindings + 9 more MCP servers GA | **Recommended** |
| **Netlify** | Pass — `netlify-cli` GA | Pass — Functions (Lambda) + Edge (Deno) | Pass — `llms.txt` + `llms-full.txt` published | Pass — `netlify deploy --prod` GA | Pass — `@netlify/mcp` GA | Runner-up |
| **Vercel** | Pass — `vercel` CLI GA (`api`/`curl` beta) | Pass — Functions + Edge unified | Partial — MDX docs, no public `llms.txt` advertised | Pass — `vercel --prod` / `vercel rollback` GA | Pass — `mcp.vercel.com` GA, OAuth | Third pick |
| Fly.io | Pass — `flyctl` GA + `flyctl mcp server` | Partial — managed VMs, Docker required | Pass — markdown source in `superfly/docs` | Pass — `fly deploy` / `fly releases rollback` GA | Pass — official MCP GA | Dropped — Docker friction, no free tier (~$3–10/mo) |
| Railway | Pass — `railway` CLI GA | Pass — long-running containers | Pass — `llms-full.txt` GA | Partial — no first-class `rollback`, redeploy-prior pattern | Pass — official MCP GA | Dropped — $5/mo floor, no scale-to-zero, cost-sensitivity penalty |
| Render | Pass — Render CLI v2.18 GA | Pass — Web Services | Fail — no `llms.txt`, no markdown source | Pass — deploy hooks + CLI GA | Pass — Render MCP GA | Dropped — free tier ~1-min cold starts hurt UX; Starter is $7/mo |

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

- `@astrojs/cloudflare` adapter is already installed; `wrangler.jsonc`/`wrangler.toml` + `.dev.vars` are already part of the dev loop documented in `AGENTS.md`.
- 100,000 requests/day free tier covers MVP scale for a private family circle by an order of magnitude. If we exceed it, the paid step is a flat $5/mo with 10M requests/mo and 30s CPU.
- Cloudflare's MCP suite is the broadest in the comparison: Docs MCP for adapter questions, Observability MCP for log/analytics access, Workers Bindings MCP for binding edits — structured tool calls instead of CLI parsing.
- `llms.txt` is GA and well-indexed; the agent can fetch Workers-specific guidance directly.
- Cost score wins on the "minimize cost" interview preference; familiarity gap is irrelevant because the scaffold already configures the platform.

#### 2. Netlify

- Cleanest Astro Node-ish adapter outside Cloudflare; `output: "server"` works without workerd quirks (SSR pages run on Node Lambda, middleware on Deno Edge — switchable via `middlewareMode`).
- `llms.txt` + `llms-full.txt` and `@netlify/mcp` GA give it a strong agent story tied with Cloudflare.
- Free tier (300 credits/month) covers the MVP, but credits are shared across bandwidth/requests/builds — less predictable than Cloudflare's "100k req/day" line.
- Real reason it's runner-up, not winner: switching means tearing out the bootstrapper's Cloudflare adapter, `wrangler`, and the `.dev.vars` workflow — pure cost with no offsetting benefit at MVP scale.

#### 3. Vercel

- Best Astro SSR DX outside the Astro-native Cloudflare path; `@astrojs/vercel` is GA and battle-tested; MCP at `mcp.vercel.com` is GA with OAuth.
- Hobby tier is **non-commercial only** — for a private family gift app this is arguably fine, but the TOS ambiguity is a real liability if AsYouWish ever takes a donation, runs an affiliate link, or grows beyond family. Upgrade to Pro is $20/mo per seat.
- Docs are MDX but no public `llms.txt` advertised — slight agent-docs gap vs. Cloudflare and Netlify.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **10 ms CPU on free tier is tight.** SSR pages that run a Supabase auth check + RLS-gated query + Astro render can easily exceed 10 ms once they hit the family circle. The "free tier" framing may collapse into "$5/mo paid required" earlier than expected.
2. **workerd ≠ Node.** Any future library that touches `fs`, `path`, or Node `Buffer` quirks (image processors, OAuth helpers, AI SDK chunks for FR-016) breaks at deploy — not in local Node tooling. The AI gift-suggestions feature is the highest-risk surface.
3. **Two env files.** `.env` (Node tooling) and `.dev.vars` (workerd) must stay in sync — flagged in `AGENTS.md` already, but every Supabase key rotation re-exposes the foot-gun.
4. **Adapter churn.** `@astrojs/cloudflare` dropped Pages support in late 2024 / early 2025. Tutorials, blog posts, and AI suggestions still reference `pages_build_output_dir` and Pages-only routing.
5. **Supabase auth under workerd.** `@supabase/ssr` cookie examples mostly assume Node SSR; subtle cookie-domain or secure-flag bugs are more likely than on Netlify/Vercel/Fly.

### Pre-Mortem — How This Could Fail

Six months after launch (Nov 2026), AsYouWish on Cloudflare Workers became a quiet disaster. Once family invitations went out, the SSR list page (Supabase auth + RLS query + Astro render) clocked 15–25 ms — past the 10 ms free CPU cap. The team upgraded to the $5/mo plan, which solved that. A month later they shipped AI gift suggestions (FR-016) via an OpenAI streaming call from a Worker; chunks of the AI SDK relied on Node APIs not covered by `nodejs_compat`, and they refactored to a hand-rolled fetch-streamer to avoid the SDK entirely. They considered moving to a Node-based PaaS, but by then they had wired `astro:env/server`, Workers Secrets, and a Cron Trigger for invitation-reminder emails — re-platforming meant rewriting deployment, secrets, and cron. Worst of all, a relative tried contributing a CSV-export feature from a fork PR, but preview deploys from forks require extra Cloudflare Access plumbing they had not set up, and the contribution died. Every Astro tutorial they read assumed Node, and they spent more time bridging the gap than building features.

### Unknown Unknowns

- Cloudflare requires a **payment method on file** even for the $0 Workers free tier — card verification gates "free."
- **Env vars cap at 5 KB each** — long PEM keys, multi-line JWT secrets, or large Supabase service-role tokens need a Workers Secret (which has higher limits) or a workaround.
- `wrangler tail` is **live-only**; persistent log retention needs Logpush (paid) or the Workers Logs feature. Without setup, post-incident debugging is limited to whatever was tailed in the moment.
- Astro supports `prerenderEnvironment: 'node'` for selectively prerendering pages off-workerd, but mixed-mode setups are sparsely documented — easy to misconfigure during AI suggestions or image work.
- The bootstrapped Cloudflare adapter config may still carry Pages-era options. AI-suggested edits may revive deprecated flags. Audit `astro.config.mjs` and `wrangler.*` against the **current** `@astrojs/cloudflare` v13.x docs before the first non-trivial deploy.

## Operational Story

- **Preview deploys**: GitHub Action workflow runs `wrangler deploy --env preview` on PR; each PR gets a stable `*.workers.dev` URL. Fork PRs do not receive preview URLs by default (secrets are not exposed to forks) — accept this for a family-circle MVP, do not bolt on Cloudflare Access until needed.
- **Secrets**: stored as Workers Secrets via `npx wrangler secret put SUPABASE_KEY` (per environment). Local dev reads from `.dev.vars` (gitignored). GitHub Actions reads from repo secrets (`SUPABASE_URL`, `SUPABASE_KEY`) for the CI build step per `.github/workflows/ci.yml`. Rotate by re-running `wrangler secret put` and updating the GitHub secret in the same session.
- **Rollback**: `npx wrangler rollback [--message "..."]` reverts to the prior deployment in seconds. **Caveat**: Supabase schema migrations applied via `supabase db push` do not roll back — coordinate schema changes with a backward-compatible window before rolling deploys.
- **Approval**: agent may run `wrangler deploy` against preview / non-production environments and `wrangler tail` unattended. Production deploy (`wrangler deploy --env production`) and Supabase migration apply (`supabase db push --linked`) require human confirmation. Rotating the primary `SUPABASE_KEY` requires human confirmation.
- **Logs**: `npx wrangler tail` for live logs; Cloudflare Docs MCP at `https://docs.mcp.cloudflare.com/mcp` for runtime questions; Cloudflare Observability MCP at `https://observability.mcp.cloudflare.com/mcp` for analytics/log queries — both read-only from the agent's perspective.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| SSR page exceeds 10 ms free CPU once Supabase + RLS round-trips compound | Devil's advocate / Pre-mortem | M | M | Plan for the $5/mo paid plan from day one; budget it. Measure CPU time with `wrangler tail` during dev. |
| AI gift suggestions (FR-016) SDK incompatible with workerd | Devil's advocate / Pre-mortem | M | M | Use the AI provider's REST/streaming API with `fetch` directly, not the official Node SDK. Validate with a spike before committing FR-016 to the workerd path. |
| `.env` and `.dev.vars` drift on every secret rotation | Devil's advocate / Known gotcha | H | L | Add a `scripts/sync-env.sh` (or document it in `AGENTS.md`) that diffs the two files; CI step that fails if `SUPABASE_*` differ between them. |
| Stale Pages-era adapter config still in repo or revived by AI suggestions | Unknown unknown | M | L | Audit `astro.config.mjs` and `wrangler.*` against current `@astrojs/cloudflare` docs in the first deploy attempt; pin the adapter version. |
| Supabase auth cookies behave subtly under workerd | Devil's advocate | M | M | Test the full signin / refresh / signout flow with `wrangler dev` (not just `astro dev`) before the first preview deploy; verify cookie `Secure` and `SameSite` attributes match production. |
| Persistent log retention requires Logpush or Workers Logs setup | Unknown unknown | M | L | Enable Workers Logs (lower-cost option) or set up a Logpush destination to R2 before the first user-facing deploy; without it, post-incident debugging is blind. |
| Schema migration applied but Worker deploy fails mid-rollout | Operational | L | H | Land migrations as backward-compatible additive steps before the matching Worker deploy; never combine a `DROP COLUMN` with the same deploy that stops reading it. |
| Family contributor fork PR cannot get a preview URL | Pre-mortem | L | L | Accept for MVP. If contributor flow becomes real, configure Cloudflare Access on the preview environment and document fork-PR contributor onboarding. |
| Env var > 5 KB (e.g., a future PEM key, multi-line JWT) | Unknown unknown | L | L | Default to `wrangler secret put` for any value beyond a short string; never use `vars` in `wrangler.jsonc` for credentials. |

## Getting Started

These commands are validated against the **current** project setup (Astro 6 + `@astrojs/cloudflare` + `wrangler` already wired by 10x-astro-starter). Do **not** copy generic Cloudflare tutorials verbatim — they may still reference Pages.

1. **Local dev — keep using the existing `dev` script.** `package.json` already runs Astro against workerd via `@astrojs/cloudflare`'s platform proxy. Astro's dev server is the canonical local-fidelity loop for this stack; a separate `wrangler dev` step is no longer required to validate workerd behavior in routine work. Reach for `wrangler dev` only when investigating a workerd-specific deploy issue.
2. **Populate `.dev.vars`** with `SUPABASE_URL` and `SUPABASE_KEY` for local. Keep `.env` in sync for any Node-only tooling (e.g., `supabase` CLI).
3. **Authenticate wrangler once** for the project: `npx wrangler login` (one-time interactive browser step; subsequent agent operations are non-interactive).
4. **Set production secrets**: `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY` for each environment (preview, production) defined in `wrangler.*`.
5. **First deploy**: `npx wrangler deploy` — confirm the returned `*.workers.dev` URL serves the signed-out homepage; smoke-test signup/signin before adding domain mapping.
6. **Wire CI**: `.github/workflows/ci.yml` already runs the build with `SUPABASE_URL` / `SUPABASE_KEY` from repo secrets. Add a deploy job that runs `npx wrangler deploy` on push to `master` once the manual deploy is green.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration (not needed for Workers).
- CI/CD pipeline setup beyond the existing `.github/workflows/ci.yml`.
- Production-scale architecture (multi-region, HA, DR) — out of scope for a 3-week MVP.
- Custom domain mapping and Cloudflare Access policies for fork-PR preview deploys.
- Logpush / Workers Logs cost optimization — flagged in the risk register; design when needed.
