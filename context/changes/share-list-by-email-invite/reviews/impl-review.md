<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Share List by Email Invite (S-03)

- **Plan**: context/changes/share-list-by-email-invite/plan.md
- **Scope**: Phases 1–4 of 4 (full plan)
- **Date**: 2026-09-13
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Invitations service uses a result-union while siblings throw

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/invitations.ts:8, :17
- **Detail**: createInvitation returns a discriminated union (`{ ok: false, reason: "already_invited" }`) instead of throwing, while sibling services (lists.ts, items.ts) throw and let the action wrap into ActionError. This was explicitly specified in the plan (Phase 1 §3), so it's intentional — but it creates two error-handling conventions in src/lib/services/.
- **Fix**: Add a one-line comment at the top of invitations.ts documenting the deliberate "typed-result (not throw)" convention so the next editor doesn't normalize it to match lists/items.
  - Strength: Removes the only cross-file ambiguity; zero behavior change.
  - Tradeoff: None significant.
  - Confidence: HIGH — matches how the plan already justified the choice.
  - Blind spot: None significant.
- **Decision**: FIXED — added a convention note comment at src/lib/services/invitations.ts:9.

### F2 — Undocumented escapeHtml helper in email.ts

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/services/email.ts (escapeHtml)
- **Detail**: An escapeHtml helper (not named in the plan) escapes inviterEmail / listTitle / acceptUrl before HTML interpolation. Positive, security-hardening addition within the phase's intent. No action needed — noted for scope-tracking only.
- **Decision**: SKIPPED — benign security-positive addition, kept as-is.

### F3 — Dialog form-reset strategy differs from CreateListDialog

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/lists/InviteDialog.tsx:35
- **Detail**: InviteDialog resets on both open and close; CreateListDialog resets on close only. The "reset on BOTH" lesson targets prefilled dialogs — InviteDialog isn't prefilled, so there's no violation. Purely a cross-dialog stylistic note. No action needed.
- **Decision**: SKIPPED — no violation (lesson targets prefilled dialogs); kept as-is.
