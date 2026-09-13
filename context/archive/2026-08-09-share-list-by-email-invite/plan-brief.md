# Share List by Email Invite (S-03) — Plan Brief

> Full plan: `context/changes/share-list-by-email-invite/plan.md`

## What & Why

A list owner can share a list by emailing an invitation to a specific person (PRD FR-008). The invitee clicks the link, signs up/in with that address, accepts, and the list appears in their "Shared with me" section. This is the first half of the sharing-and-claim loop (Stream B) that leads to the reservation flow.

## Starting Point

The `invitations` table and all owner/invitee RLS already exist from F-01. What's missing is every piece of application behavior: creating invitations, sending email, revoking, and — critically — accepting them. A list only surfaces as "shared" once accepted (`is_list_invitee` checks `accepted_by_user_id`).

## Desired End State

An owner opens a list, clicks **Invite**, enters an email, and sends. The invitee gets a Resend email, clicks the link, authenticates with that address, accepts, and lands on the shared list — which now also shows under "Shared with me" on their dashboard. The owner sees invited addresses in a **Pending invitations** list and can revoke them.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Email transport | Resend REST via `fetch` | Edge-native, repo-owned template, our own accept link, no privileged edge secret — best fit for the accept-link flow. | Plan |
| Acceptance mechanism | Explicit accept link in the email | Clear consent moment; the emailed link is the durable entry point. | Plan |
| `email_verified` gotcha | `SECURITY DEFINER accept_invitation` RPC | Reads `auth.users.email_confirmed_at` directly, so acceptance doesn't depend on the often-absent JWT claim (`lessons.md`). | Plan |
| Owner UX | Invite dialog + pending list with revoke | Owner can see/undo invites; reuses existing dialog + RLS-delete patterns. | Plan |
| Edge guards | Reject self-invite; dedupe / already-member gracefully | Backed by the existing `unique(list_id,email)` constraint; friendly messages. | Plan |
| Send-failure behavior | Persist row, warn owner | Row is the source of truth so acceptance still works; matches FR-008's "delivery is v2". | Plan |
| Accept link target | `/invitations/accept?invite=<uuid>` + auth bounce | Works for new and existing users; security is the RPC's session-email check, not link secrecy. | Plan |
| Scope | Handshake only; item-viewing is S-04 | Keeps the slice to the sharing handshake. | Plan |

## Scope

**In scope:** single-address invite, pending list + revoke, one Resend email with accept link, RPC-based acceptance, signed-out auth bounce.

**Out of scope:** viewing shared list items (S-04), resend button, bulk/multi invite, in-app notifications, invite expiry/tokens, changing who can invite.

## Architecture / Approach

Bottom-up, four independently verifiable phases. The `invitations` row is created **before** the email is sent, so acceptance works even if delivery fails. Flow: owner action inserts a row + sends a Resend email whose link points to a public `/invitations/accept` route → the route (signed-in, confirmed) calls the `accept_invitation` RPC → the list becomes visible via existing `lists_select` RLS. No new table columns; the only DB change is one additive function.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Invitation backend | Accept RPC, schemas, service, actions (no email/UI) | RPC correctness vs. the `email_verified` gotcha |
| 2. Email delivery | Resend send wired into create action | Sender-domain DNS / deliverability setup |
| 3. Owner invite UI | Invite dialog + pending list w/ revoke | Consistency with existing dialog patterns |
| 4. Accept flow | Public accept route + auth bounce | New-user path across the email-confirm gap |

**Prerequisites:** S-01 (done); a Resend account + verified sender domain for real delivery (Phase 2+).
**Estimated effort:** ~3-4 focused sessions, one per phase.

## Open Risks & Assumptions

- The `email_verified` JWT claim is unreliable — mitigated by the RPC reading `email_confirmed_at` directly; if this assumption were wrong the whole acceptance path fails, so it's verified first (Phase 1).
- Brand-new signups aren't threaded through the email-confirmation gap; they re-click the emailed link after confirming (accepted UX, not a bug).
- Real email delivery depends on Resend domain verification (SPF/DKIM); with the key unset the app degrades gracefully (`emailSent: false`).

## Success Criteria (Summary)

- An owner can invite someone by email and see/revoke pending invitations.
- The invitee, after authenticating with the invited address, accepts and sees the shared list on their dashboard.
- Acceptance succeeds for confirmed users regardless of the `email_verified` claim, and a failed email send never loses the invitation.
