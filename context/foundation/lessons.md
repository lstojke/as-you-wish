# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Restrict user-supplied URLs to http(s) at the schema boundary

- **Context**: src/lib/schemas/wishlist.ts (and any future zod schema with a URL field)
- **Problem**: `z.url()` accepts `javascript:` and `data:` URIs. When such a URL is later rendered into `<a href={...}>`, a user can plant a stored-XSS payload visible to everyone with read access to the row.
- **Rule**: Every zod URL field validated for storage must add `.refine((u) => /^https?:\/\//i.test(u))`. Use `z.url()` raw only for transient client-side inputs that are never persisted or rendered as href.
- **Applies to**: Every `src/lib/schemas/**/*.ts` file with a URL field that will be persisted or rendered as a link.

## Shared-list queries must rely on lists_select RLS, not an invitations join

- **Context**: src/lib/services/lists.ts — sharedQuery in `listOwnedAndShared`
- **Problem**: Querying lists shared with the current user via an `invitations!inner` join fails silently. The `invitations_select` RLS policy requires an `email_verified = 'true'` JWT claim; even for email-confirmed users this claim is often absent, so the RLS hides invitation rows and the `!inner` join drops the parent list rows. The resulting query returns zero shared lists with no error — the bug is invisible without a second test user.
- **Rule**: Use `.neq('owner_id', user.id)` and let `lists_select` RLS + `is_list_invitee()` (SECURITY DEFINER) filter visibility. Comment the query block naming the RLS dependency so future devs don't add joins or service-role clients that bypass it.
- **Applies to**: Every service or query that reads lists not owned by the current user.

## Modal form dialogs must reset on both open and close

- **Context**: src/components/lists/EditItemForm.tsx, src/components/dashboard/RenameListDialog.tsx — react-hook-form dialogs that prefill from a row.
- **Problem**: EditItemForm resets the form only on open (`open && item`), while RenameListDialog resets on both open and close. The open-only variant works because the next open re-seeds from the freshest row, but the asymmetry across sibling dialogs is a latent inconsistency: a dialog that resets only on open can briefly show the previous target's values during the close animation, and it makes the reset contract non-obvious to the next editor.
- **Rule**: A prefilled modal form dialog should reset its form state on BOTH transitions — seed from the target row on open, and clear back to empty defaults on close. Keep the reset effect symmetric across all dialogs in the same family so the pattern is predictable.
- **Applies to**: Every react-hook-form dialog under src/components/** that prefills from a selected row (rename/edit-style modals).

## Pick one error-handling convention per service function family

- **Context**: src/lib/services/ — reservations.ts (pure error-mapper `reserveErrorPayload`), invitations.ts (result-union return types), items.ts / lists.ts (throw directly)
- **Problem**: The service layer carries three different error-handling strategies. Each new service function forces a re-decision about how errors surface (mapper vs result-union vs throw), and a reader must learn all three to work across the layer. The divergence is pre-existing and grows silently with each addition.
- **Rule**: For a new service function, throw on unexpected failures and let the action/endpoint boundary map them; add a pure, unit-testable error-mapper (like `reserveErrorPayload`) ONLY when a specific DB error must become a distinct user-facing code (e.g. 23505 → CONFLICT). Reserve result-union return types for flows with multiple expected non-error outcomes. Don't introduce a fourth style.
- **Applies to**: Every new function under src/lib/services/**.
