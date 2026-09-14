---
change_id: testing-invitation-access-control
title: Test invitation acceptance and access-control (IDOR) at the data layer
status: implementing
created: 2026-09-13
updated: 2026-09-14
archived_at: null
---

## Notes

Rollout Phase 2 of context/foundation/test-plan.md: "Invitation & access control".

Risks covered:
- #2: invitation→accept mis-grants access, bypasses the email-confirmation gate, or a replayed accept double-grants.
- #3: IDOR/access — a user reads or reserves items on a list they were never invited to.

Test types planned: integration.

Risk response intent:
- #2: prove only the invited email gains access, accept requires a confirmed email, and a replayed accept is a no-op.
- #3: prove a non-invited user's read and reserve on someone else's list are both denied at the data layer.
