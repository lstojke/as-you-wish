---
starter_id: 10x-astro-starter
package_manager: npm
project_name: as-you-wish
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
---

## Why this stack

AsYouWish is a 3-week, after-hours, solo MVP for a private family gift-coordination web app. The load-bearing requirements are email/password auth (FR-001–003), email invitations to share lists (FR-008), an exclusive-claim concurrency rule on reservations (FR-013), and a nice-to-have AI gift suggestions feature (FR-016). 10x-astro-starter covers all of these: Supabase provides auth, Postgres for the reservation rule (enforceable as a unique partial index), and transactional email for invitations. The AI suggestions feature (FR-016) slots in as a Supabase Edge Function calling an LLM API — no stack change required. Astro + React + TypeScript gives a typed, convention-driven surface well-suited to agent-assisted iteration; Cloudflare Pages deployment matches the small target scale without container overhead. Mobile is a deliberate future track: a React Native / Expo client can be added later as a sibling app sharing the same Supabase project (auth, Postgres, RLS policies, TypeScript types) — no backend rewrite required.
