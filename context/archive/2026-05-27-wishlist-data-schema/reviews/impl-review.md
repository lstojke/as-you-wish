<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: F-01 Wishlist Data Schema

- **Plan**: context/changes/wishlist-data-schema/plan.md
- **Scope**: All phases (1–3, complete)
- **Date**: 2026-05-28
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical · 2 warnings · 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Invitation acceptance not gated on email confirmation

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause before deciding
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260527125732_initial_wishlist_schema.sql:238,248
- **Detail**: invitations_select and invitations_update gate on `lower(trim(auth.jwt()->>'email')) = invitations.email`. If the production project allows unconfirmed signup, an attacker can register `victim@example.com` and accept invitations addressed to that email. Policy never checks `email_confirmed_at`. Most relevant when S-03 ships; defense in depth says fix in policy, not in project config.
- **Fix A ⭐ Recommended**: Add email-confirmed check inside the policies.
  - Strength: Closes the class regardless of project auth settings. Travels with the schema.
  - Tradeoff: Two policies to update; tiny migration.
  - Confidence: HIGH — JWT claim is standard Supabase auth.
  - Blind spot: Confirm the exact JWT claim name (`email_verified` vs `email_confirmed_at`).
- **Decision**: FIXED via Fix A — follow-up migration `20260528095257_gate_invitations_on_confirmed_email.sql`

### F2 — SECURITY DEFINER helpers replace inline EXISTS without plan amendment

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; doc fix
- **Dimension**: Plan Adherence
- **Location**: supabase/migrations/20260527125732_initial_wishlist_schema.sql:114–187
- **Detail**: Plan specified inline EXISTS predicates. Implementation introduced 5 SECURITY DEFINER STABLE helpers to break cross-table RLS infinite recursion found in Phase 2. Justified, correctly scoped, but plan.md was not amended. Future reader may "re-simplify" and reintroduce recursion.
- **Decision**: FIXED — plan.md amended with helper-functions note in "Critical Implementation Details"

### F3 — supabase/config.toml realtime disabled, undocumented

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Scope Discipline
- **Location**: supabase/config.toml:82
- **Detail**: `[realtime] enabled = false` committed in Phase 2 to dodge a local docker image bug. Prod (hosted) ignores. S-05 will need it re-enabled locally.
- **Decision**: FIXED — note added to smoke-notes.md with S-05 watch flag

### F4 — is_item_reserved callable for arbitrary UUIDs

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260527125732_initial_wishlist_schema.sql:165–187
- **Detail**: Helper returns boolean only; UUIDs unguessable. Defense in depth would wrap with `is_item_list_member`. Acceptable as-is.
- **Decision**: FIXED — is_item_reserved now wraps result in is_item_list_member check (in same follow-up migration)

### F5 — smoke.sql is EXTRA (not planned)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Scope Discipline
- **Location**: context/changes/wishlist-data-schema/smoke.sql
- **Fix**: None required.
- **Decision**: SKIPPED — codifying the probe is benign; no action needed.

### F6 — CASCADE on reservations.claimer_id contradicts "history preserved" framing

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Adherence
- **Location**: supabase/migrations/20260527125732_initial_wishlist_schema.sql:51,283
- **Fix**: None required.
- **Decision**: SKIPPED — CASCADE matches plan intent; nit only.
