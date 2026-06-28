<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Wishlist Data Schema Implementation Plan

- **Plan**: context/changes/wishlist-data-schema/plan.md
- **Mode**: Deep
- **Date**: 2026-05-27
- **Verdict**: REVISE
- **Findings**: 2 critical | 2 warnings | 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | FAIL |
| Plan Completeness | WARNING |

## Grounding
4/4 paths ✓ (`supabase/migrations/` absent matches plan; `src/lib/supabase.ts`, `src/middleware.ts` present; no contract-surfaces.md, no lessons.md), plan vs filesystem ✓, brief↔plan ✓.

## Findings

### F1 — View security model self-contradicts; default bypasses RLS

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; load-bearing privacy invariant
- **Dimension**: Plan Completeness (internal contradiction)
- **Location**: Critical Implementation Details (line 49) vs Phase 1 §1 (line 81)
- **Detail**: Line 49 says the view is "marked `security_invoker = false` or implemented as `security definer`". Line 81 says `security_invoker = true`. plan-brief.md confirms `security_invoker = true`. These are opposite. Postgres default (`security_invoker = false`) runs the view as its owner, bypassing the caller's RLS on `items` — defeating the gating the plan relies on. The "fallback path" sentence in §1 is also wrong: policies on underlying tables don't filter rows for a security-definer-style view.
- **Fix**: Drop the line-49 wording. Commit unconditionally to `WITH (security_invoker = true)` (Supabase is PG15+). Remove the "fallback" half-sentence in Phase 1 §1.
- **Decision**: FIXED — Fix applied (security_invoker = true unconditionally)

### F2 — Invitations UPDATE policy doesn't restrict mutable columns

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — privilege escalation if implemented as written
- **Dimension**: Blind Spots
- **Location**: Phase 1 §2, `invitations.update` policy (line 110)
- **Detail**: Plan claims column-level immutability is enforced by `with check`. Postgres RLS WITH CHECK cannot reference OLD and does not restrict columns. As written, an invitee can `UPDATE invitations SET list_id = '<other list>', accepted_by_user_id = auth.uid() WHERE email = me` and join a list they were never invited to.
- **Fix A ⭐ Recommended**: Column-level GRANT
  - Approach: `REVOKE UPDATE ON invitations FROM authenticated; GRANT UPDATE (accepted_at, accepted_by_user_id) ON invitations TO authenticated;`
  - Strength: Postgres-native, declarative; standard pattern Supabase docs recommend.
  - Tradeoff: One extra GRANT statement.
  - Confidence: HIGH — standard Postgres column ACL.
  - Blind spot: Confirm Supabase's default grants on `authenticated` don't override (`\dp invitations` after migration).
- **Fix B**: BEFORE UPDATE trigger that rejects writes to `list_id`/`email`
  - Approach: Trigger compares OLD/NEW and raises on disallowed column writes.
  - Strength: Co-located, explicit allowlist.
  - Tradeoff: Another object to maintain.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A (column-level GRANT)

### F3 — Reservations UPDATE allows claimer to rewrite `item_id`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real integrity hole; same fix shape as F2
- **Dimension**: Blind Spots
- **Location**: Phase 1 §2, `reservations.update` policy (line 114)
- **Detail**: `update using (claimer_id = auth.uid())` with no column restriction lets the claimer change `item_id` on their reservation row, sidestepping the INSERT policy's authorization check (which validates ownership/invitation membership). Plan's intent is only release-via-`released_at`.
- **Fix**: Restrict updatable columns: `REVOKE UPDATE ON reservations FROM authenticated; GRANT UPDATE (released_at) ON reservations TO authenticated;`. Keep the existing USING predicate. Add optional WITH CHECK `(claimer_id = auth.uid())` for explicitness.
  - Strength: Mirrors F2 fix; consistent column-ACL pattern across the migration.
  - Tradeoff: Locks out future field-edits; add grants if needed later.
  - Confidence: HIGH.
  - Blind spot: None significant — release-then-reclaim uses a new row per the partial-unique-index design.
- **Decision**: FIXED — column-level GRANT applied (UPDATE (released_at) only)

### F4 — Progress section missing checkbox for one Phase 3 SC bullet

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness (mechanical Progress↔Phase contract)
- **Location**: Phase 3 Automated SC (lines 210–212) vs Progress §Phase 3 (lines 297–299)
- **Detail**: Phase 3 Automated SC has 3 bullets; Progress has only 3.1 (migration list) and 3.2 (curl). The "Cloudflare Worker deploy unaffected" bullet has no matching `- [ ] 3.x` entry. `/10x-implement`'s strict parser will not tick that box.
- **Fix**: Add a Progress entry for the Cloudflare-unaffected check (and renumber `curl`), or delete the SC bullet if redundant with the curl check.
- **Decision**: FIXED — Progress 3.2 entry added, curl renumbered
