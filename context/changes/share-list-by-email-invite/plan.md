# Share List by Email Invite (S-03) Implementation Plan

## Overview

A list owner can invite a specific person to one of their lists by email address. The invitee receives an email (sent via Resend) containing an accept link; after they sign up / sign in with that address and accept, the shared list appears in their "Shared with me" section on the dashboard. Acceptance is made reliable through a `SECURITY DEFINER` RPC that verifies the invitee's confirmed email directly against `auth.users`, sidestepping the flaky `email_verified` JWT claim documented in `lessons.md`.

## Current State Analysis

- **Schema is already landed (F-01).** `supabase/migrations/20260527125732_initial_wishlist_schema.sql` defines the `invitations` table (`id, list_id, email, invited_at, accepted_at, accepted_by_user_id`, `unique (list_id, email)`) plus RLS: owners `insert`/`select`/`delete` via `is_list_owner`, and invitees may `update` only `accepted_at` + `accepted_by_user_id`. The follow-up `20260528095257_gate_invitations_on_confirmed_email.sql` gates invitee `select`/`update` on `email_verified = 'true'`.
- **A list only surfaces as "shared" after acceptance.** `is_list_invitee()` (SECURITY DEFINER) checks `accepted_by_user_id = auth.uid()`; `listOwnedAndShared` (`src/lib/services/lists.ts:9`) reads shared lists via `lists_select` RLS. No app code currently creates, sends, revokes, or accepts invitations.
- **Known gotcha (`context/foundation/lessons.md:12`).** The `email_verified` JWT claim the invitee-side RLS depends on is "often absent even for email-confirmed users," so an invitee-session `UPDATE` to accept can silently no-op. This is the load-bearing reliability risk and is neutralized in Phase 1 by the RPC.
- **No email transport exists.** `astro.config.mjs` env schema only declares `SUPABASE_URL`/`SUPABASE_KEY`. Runtime is Cloudflare Workers — no Node mail libs; sending must be `fetch`-based.
- **Established patterns to mirror.** zod schema (`src/lib/schemas/wishlist.ts`) → service (`src/lib/services/*.ts`) → Astro action (`src/actions/index.ts`, `requireSupabase` guard) → shadcn dialog island (`CreateListDialog.tsx`, `client:only="react"`). Owner-only UI gates on `isOwner` in `src/components/lists/ListDetail.tsx`. `/invitations` is **not** in `PROTECTED_ROUTES` (`src/middleware.ts:4`), which is correct — the accept page must handle signed-out visitors itself.

## Desired End State

An owner opens one of their lists, clicks **Invite**, enters an email, and sends. The invitee gets an email; clicking its link (after signing up/in with that address and confirming their email) accepts the invite and lands them on the shared list, which now also appears under "Shared with me" on their dashboard. The owner sees the invite in a **Pending invitations** list on the list page and can revoke it. Verify by: two-user manual run (owner invites, invitee accepts, list appears); `accept_invitation` RPC flips acceptance for a confirmed-email user regardless of the `email_verified` claim; typecheck + lint pass.

### Key Discoveries:

- Invitations table + all owner/invitee RLS already exist — no table migration needed (`supabase/migrations/20260527125732_initial_wishlist_schema.sql`).
- `email_verified` claim is unreliable — acceptance must not depend on it (`context/foundation/lessons.md:12`).
- Shared-list reads must rely on `lists_select` RLS, never an `invitations` join (`context/foundation/lessons.md:12`; already honored in `src/lib/services/lists.ts:20`).
- Actions receive `context.request`, so the accept-link origin can be derived per-request — no app-URL env var needed (`src/actions/index.ts`).
- URL fields persisted/rendered must be http(s)-restricted (`context/foundation/lessons.md:1`) — not directly triggered here (no user URL field), but the email HTML must only ever embed our own origin-built link.

## What We're NOT Doing

- No viewing of a shared list's **items** with available/reserved status — that is S-04 (`view-shared-list`).
- No **resend** button and no **bulk / multi-address** invite in one submit — owner re-invites via revoke + invite.
- No in-app / push notifications; email is the only channel.
- No new `invitations` table columns; no invite-expiry / token-secret column (the row `id` uuid is the link handle; security is the RPC's session-email check).
- No changes to who may invite (list owner only, unchanged).
- No email-confirmation return-URL threading for brand-new signups across the confirm gap — new users re-click the emailed link after confirming (see Phase 4).

## Implementation Approach

Build bottom-up so each phase is independently verifiable: (1) the acceptance RPC + invitation service + actions with no side effects; (2) layer Resend email onto the create action; (3) owner-facing dialog + pending list on the list page; (4) the public accept route that ties the handshake together. The `invitations` row is the source of truth throughout — it is created before the email is sent, so acceptance works even if delivery fails.

## Critical Implementation Details

- **Acceptance must bypass the JWT claim.** The `accept_invitation` RPC reads `auth.users.email_confirmed_at` and `email` for the calling `auth.uid()` directly (SECURITY DEFINER), so it does not depend on GoTrue emitting `email_verified`. This is the whole reason the RPC exists rather than a client-side `UPDATE`.
- **Ordering in create action.** Insert the invitation row first, then attempt the Resend send. Never roll back the row on send failure — return an `emailSent: false` flag so the UI can warn while the invite remains acceptable.
- **The accept route is unauthenticated by design.** Do not add `/invitations` to `PROTECTED_ROUTES`; the page branches on `locals.user` itself so signed-out invitees can be bounced to auth.

## Phase 1: Invitation backend (RPC, schemas, service, actions)

### Overview

Land the acceptance RPC and all server-side invitation operations (create / list / revoke / accept) with no email and no UI. After this phase the full handshake is exercisable from tests / a REST client.

### Changes Required:

#### 1. Acceptance RPC migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_accept_invitation_rpc.sql`

**Intent**: Provide a reliable, idempotent acceptance path that does not depend on the `email_verified` JWT claim, closing the silent-no-op class from `lessons.md`.

**Contract**: `public.accept_invitation(invite_id uuid) returns uuid` — `SECURITY DEFINER`, `set search_path = public`, granted to `authenticated` only (revoke from `public`/`anon`). Behavior: require `auth.uid()`; look up the caller's `email` + `email_confirmed_at` from `auth.users`; reject if not confirmed; load the invitation; reject if `lower(trim(email))` mismatches; if already accepted, return its `list_id` (idempotent); else set `accepted_at = now()`, `accepted_by_user_id = auth.uid()` and return `list_id`. Raise a distinguishable error on email mismatch vs not-found so the route can show the right message.

```sql
create or replace function public.accept_invitation(invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_email     text;
  v_confirmed timestamptz;
  v_inv       public.invitations%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select email, email_confirmed_at into v_email, v_confirmed
  from auth.users where id = v_uid;

  if v_confirmed is null then
    raise exception 'email not confirmed' using errcode = 'P0001';
  end if;

  select * into v_inv from public.invitations where id = invite_id;
  if not found then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;

  if lower(trim(v_inv.email)) <> lower(trim(v_email)) then
    raise exception 'invitation email mismatch' using errcode = 'P0003';
  end if;

  if v_inv.accepted_by_user_id is not null then
    return v_inv.list_id;  -- idempotent
  end if;

  update public.invitations
     set accepted_at = now(), accepted_by_user_id = v_uid
   where id = invite_id;

  return v_inv.list_id;
end;
$$;

revoke execute on function public.accept_invitation(uuid) from public, anon;
grant  execute on function public.accept_invitation(uuid) to authenticated;
```

**Note**: This migration must be backward-compatible with the current Worker (it only adds a function) per the rollback rule in `AGENTS.md`.

#### 2. Invitation zod schemas

**File**: `src/lib/schemas/wishlist.ts`

**Intent**: Validate invite create / revoke / accept inputs at the action boundary, mirroring the existing list/item schema exports.

**Contract**: Add `invitationCreateSchema` (`listId: z.uuid()`, `email: z.string().trim().toLowerCase().email().max(320)`), `invitationRevokeSchema` (`invitationId: z.uuid()`), `invitationAcceptSchema` (`invitationId: z.uuid()`), plus inferred `…Input` types. Self-invite is not checked here (the user's own email isn't known to the schema) — it is enforced in the action handler.

#### 3. Invitations service

**File**: `src/lib/services/invitations.ts` (new)

**Intent**: House invitation data operations behind the same service shape as `lists.ts`/`items.ts`, relying on RLS for authorization.

**Contract**: Export `InvitationRow = Database["public"]["Tables"]["invitations"]["Row"]` and:
- `createInvitation(client, input)` — insert `{ list_id, email }`; RLS `invitations_insert` enforces owner. Map a `unique (list_id, email)` violation (Postgres code `23505`) to a typed "already invited" outcome rather than a raw throw.
- `listInvitations(client, listId)` — select invitations for a list ordered by `invited_at`; owner visibility comes from `invitations_select` RLS.
- `deleteInvitation(client, input)` — delete by `id`; RLS `invitations_delete` gates to owner.
- `acceptInvitation(client, input)` — call `client.rpc("accept_invitation", { invite_id })`; return the `list_id` or a typed error discriminating mismatch / not-found / not-confirmed from the RPC `errcode`.

#### 4. Astro actions

**File**: `src/actions/index.ts`

**Intent**: Expose `invitations.create`, `invitations.revoke`, `invitations.accept` following the existing `defineAction` + `requireSupabase` pattern.

**Contract**: New `invitations` action group. `create` handler additionally rejects self-invite by comparing the normalized input email to `context.locals.user.email` and returns a typed `ActionError` (`BAD_REQUEST`) for self-invite and for the "already invited" service outcome. `create` returns `{ invitation, emailSent }` (Phase 1: `emailSent` always `false`; email is wired in Phase 2). `revoke` returns `{ success: true }`. `accept` returns `{ listId }` and maps RPC errors to `ActionError` codes. Log failures via `console.error` for `wrangler tail`, matching existing handlers.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly against local Supabase: `npx supabase db reset` (or `npx supabase migration up`)
- Type checking passes: `npm run build` (Astro `check`/typegen) or the project's typecheck script
- Linting passes: `npm run lint`
- `accept_invitation` is idempotent and rejects mismatched email (verified via SQL against local DB with two seeded users)

#### Manual Verification:

- Inserting an invitation as a non-owner is rejected by RLS (spot-check via SQL / REST)
- Calling `accept_invitation` as a confirmed invitee flips `accepted_at`/`accepted_by_user_id` even when the `email_verified` claim is absent
- Calling `accept_invitation` twice returns the same `list_id` with no error

**Implementation Note**: After automated verification passes, pause for human confirmation of the manual DB checks before starting Phase 2.

---

## Phase 2: Email delivery via Resend

### Overview

Layer transactional email onto `invitations.create`: build the accept link from the request origin, send via Resend's REST API, and report delivery status without ever discarding the invitation row.

### Changes Required:

#### 1. Env schema for Resend

**File**: `astro.config.mjs`

**Intent**: Declare the Resend credentials as server-only secrets so they're accessible via `astro:env/server`.

**Contract**: Add to `env.schema`: `RESEND_API_KEY` (`envField.string({ context: "server", access: "secret", optional: true })`) and `RESEND_FROM` (`context: "server", access: "secret", optional: true`) — the verified sender address (e.g. `AsYouWish <invites@yourdomain>`). Keep `optional: true` so builds without the secret still succeed (mirrors the `SUPABASE_*` treatment); the send path degrades to `emailSent: false` when unset.

#### 2. Local env + CI wiring

**File**: `.dev.vars`, `.env` (local, gitignored), and `.github/workflows/ci.yml`

**Intent**: Keep the two env files in sync (per `AGENTS.md`) and document the new secret for CI/build.

**Contract**: Add `RESEND_API_KEY` and `RESEND_FROM` entries to `.dev.vars` and `.env`. CI build does not require real values (optional env), but note the secret in the workflow env block alongside `SUPABASE_*` for parity. No secret values committed.

#### 3. Email send module

**File**: `src/lib/services/email.ts` (new)

**Intent**: Provide an edge-compatible `sendInvitationEmail` that posts to Resend and returns a boolean success, isolating the transport so the action stays clean.

**Contract**: `sendInvitationEmail({ to, acceptUrl, listTitle, inviterEmail }): Promise<boolean>` — `POST https://api.resend.com/emails` with `Authorization: Bearer ${RESEND_API_KEY}`, JSON body `{ from: RESEND_FROM, to, subject, html, text }`. Returns `false` (never throws) when the key/from is unset or the response is non-2xx, logging the failure. The email body embeds only the server-built `acceptUrl` (no user-supplied URL). Provide both `html` and a `text` fallback.

#### 4. Wire email into the create action

**File**: `src/actions/index.ts`, `src/lib/services/invitations.ts`

**Intent**: After the row is inserted, build the accept link and send, surfacing delivery status to the caller.

**Contract**: In `invitations.create`, derive `origin` from `new URL(context.request.url).origin`, build `acceptUrl = ${origin}/invitations/accept?invite=${invitation.id}&email=${encodeURIComponent(invitation.email)}` (the `email` param is an untrusted prefill hint only — the RPC re-verifies from the session), call `sendInvitationEmail`, and return `{ invitation, emailSent }`. Row creation and email send are sequential; a send failure leaves the row intact.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`
- `sendInvitationEmail` returns `false` (no throw) when `RESEND_API_KEY` is unset — unit test or manual invocation

#### Manual Verification:

- With a valid `RESEND_API_KEY` + verified sender, inviting an address delivers an email whose link is `…/invitations/accept?invite=<uuid>&email=<addr>`
- With the key unset, `invitations.create` still returns `emailSent: false` and the invitation row persists
- The accept link in the received email points only at the app's own origin

**Implementation Note**: After automated verification passes, pause for human confirmation that a real email was received before starting Phase 3.

---

## Phase 3: Owner invite UI (dialog + pending list with revoke)

### Overview

Add the owner-facing invite experience to the list-detail page: an **Invite** action opening an email dialog, and a **Pending invitations** list showing invited addresses with acceptance status and a revoke control. Existing invitations are SSR-loaded.

### Changes Required:

#### 1. SSR-load invitations for the owner

**File**: `src/pages/lists/[id].astro`

**Intent**: Fetch the list's invitations server-side (owner only) and pass them to `ListDetail`, matching how items are loaded.

**Contract**: When `list.owner_id === user.id`, call `listInvitations(supabase, id)` and pass the result as a new `initialInvitations` prop to `ListDetail`; non-owners get an empty array. Wrap in the existing try/catch that logs SSR load failures.

#### 2. Invite dialog

**File**: `src/components/lists/InviteDialog.tsx` (new)

**Intent**: Collect an email and call `invitations.create`, mirroring `CreateListDialog`'s form/dialog/optimistic pattern.

**Contract**: Props `{ listId, open, onOpenChange, onInvited(invitation), }`. Uses `useForm` + `zodResolver(invitationCreateSchema.pick({ email }))` (or an email-only form schema). On submit → `actions.invitations.create({ listId, email })`. On `isInputError`, set the `email` field error; on self-invite / already-invited `ActionError`, show the message inline or via `toast`. On success, call `onInvited`, close, and `toast.success` — or `toast.warning("Invited, but the email couldn't be sent")` when `emailSent === false`. Reset form on both open and close (per `lessons.md:31`).

#### 3. Pending invitations list + revoke

**File**: `src/components/lists/PendingInvitations.tsx` (new)

**Intent**: Show invited addresses with status (Pending / Accepted) and let the owner revoke a pending one behind a confirmation, reusing the `AlertDialog` + optimistic-remove pattern from `DeleteItemDialog`.

**Contract**: Props `{ invitations, onRevoked(id), }`. Each row renders the email + a status badge (`accepted_at ? "Accepted" : "Pending"`); a revoke button opens an `AlertDialog` confirm → `actions.invitations.revoke({ invitationId })` → optimistic remove with rollback on error and a `toast`. Empty state renders nothing (or a subtle hint).

#### 4. Wire into ListDetail

**File**: `src/components/lists/ListDetail.tsx`

**Intent**: Surface Invite + Pending invitations for owners only, holding invitation state locally.

**Contract**: Add `initialInvitations: InvitationRow[]` to `Props`; hold `invitations` state seeded from it. Render an **Invite** trigger near `ListActionsMenu` and, below the items, the `PendingInvitations` section — both inside the existing `isOwner` block. Wire `onInvited` (append) and `onRevoked` (filter) to the state. Import `InvitationRow` from the service.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- As owner, the Invite dialog validates email, creates an invitation, and it appears in Pending invitations
- Inviting your own address shows a friendly self-invite message; re-inviting a pending address shows "already invited" (no duplicate row)
- Revoke removes the invitation after confirmation; non-owners see no invite UI
- With the Resend key unset, invite still succeeds with a "couldn't send email" warning

**Implementation Note**: After automated verification passes, pause for human confirmation of the manual UI checks before starting Phase 4.

---

## Phase 4: Accept flow (public route + auth bounce)

### Overview

Add the `/invitations/accept` route that turns a clicked email link into an accepted invitation and a visible shared list. Signed-out invitees are bounced through auth and returned; signed-in invitees have the RPC run and are redirected to the list.

### Changes Required:

#### 1. Accept route

**File**: `src/pages/invitations/accept.astro` (new)

**Intent**: The single entry point the emailed link targets; branches on auth state and performs acceptance for signed-in, confirmed invitees.

**Contract**: `export const prerender = false`. Read `invite` query param; if missing/not a uuid, return `404`. If `!locals.user`: redirect to `/auth/signin?return=<encoded accept path>&email=<hint>` (the `email` hint from the query is prefill only). If `locals.user`: call `acceptInvitation(supabase, { invitationId })`; on success redirect to `/lists/<listId>`; on **email mismatch** render a friendly page ("This invitation was sent to a different address — sign in as that address"); on **not-confirmed** render "Please confirm your email first"; on not-found return `404`. Do **not** add `/invitations` to `PROTECTED_ROUTES`.

#### 2. Return-URL handling in sign-in

**File**: `src/pages/api/auth/signin.ts`, `src/pages/auth/signin.astro`

**Intent**: Let an existing invitee return to the accept route after signing in, and prefill their email.

**Contract**: `signin.astro` reads optional `return` + `email` query params, prefills the email input, and includes `return` as a hidden field. `signin.ts` reads `return` from the form; after a successful `signInWithPassword`, redirect to it **only if** it is a local path matching `^/invitations/accept` (else fall back to `/`). This validation prevents open-redirect. New signups are not threaded through the email-confirmation gap — they re-click the emailed link after confirming (documented behavior, not a bug).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`
- `return` param is honored only for `^/invitations/accept` paths (open-redirect guard) — verified by attempting an external `return` and confirming fallback to `/`

#### Manual Verification:

- End-to-end (two users): owner invites User B → B receives email → clicks link → signs up, confirms email, re-clicks link → accepts → lands on the list; the list also appears under "Shared with me" on B's dashboard
- Existing-user path: B already signed up → clicking the link bounces to sign-in (email prefilled), and after sign-in returns to accept and lands on the list
- Wrong-address path: signed in as a different address → friendly mismatch page, no acceptance
- Owner still cannot see who reserved anything (unaffected) and the invite disappears from Pending once accepted (shows "Accepted")

**Implementation Note**: After automated verification passes, pause for human confirmation of the full two-user manual run — this is the slice's acceptance gate.

---

## Testing Strategy

### Unit Tests:

- `accept_invitation` RPC: confirmed-email accept, idempotent re-accept, email-mismatch rejection, not-confirmed rejection (SQL-level against local Supabase).
- `createInvitation` maps a `23505` unique violation to the "already invited" outcome.
- `sendInvitationEmail` returns `false` without throwing when the key is unset and on a non-2xx response.
- Sign-in `return` validation accepts `^/invitations/accept` and rejects external/other paths.

### Integration Tests:

- Owner creates invitation → row exists with correct `list_id`/`email`; non-owner insert is blocked by RLS.
- Full handshake: invite → accept RPC → `listOwnedAndShared` now returns the list in `shared` for the invitee.

### Manual Testing Steps:

1. Owner invites User B by email; confirm Pending invitations shows B as "Pending".
2. Deliver + open the email; verify the accept link origin and params.
3. As B (new account): sign up, confirm email, click the link, accept, land on the list; confirm it appears under "Shared with me".
4. As owner: confirm the invite now shows "Accepted"; revoke a different pending invite and confirm removal.
5. Edge: self-invite rejected; duplicate invite deduped; wrong-address accept shows mismatch page.

## Performance Considerations

Negligible at family scale (low QPS, small data). The only added per-request work is one invitations select on owner list-page load and one Resend `fetch` per invite (in the action, off the render path). No N+1 concerns.

## Migration Notes

Only additive DB change is the `accept_invitation` function — backward-compatible with the current Worker, satisfying the `wrangler rollback` constraint in `AGENTS.md` (a rollback to the prior Worker leaves an unused function, which is harmless). No data backfill.

## References

- Change identity: `context/changes/share-list-by-email-invite/change.md`
- Roadmap slice S-03: `context/foundation/roadmap.md:89`
- PRD FR-008 + Access Control: `context/foundation/prd.md:70`
- Existing schema + RLS: `supabase/migrations/20260527125732_initial_wishlist_schema.sql`
- `email_verified` gotcha + shared-list RLS rule: `context/foundation/lessons.md:12`
- Dialog/action patterns: `src/components/dashboard/CreateListDialog.tsx`, `src/actions/index.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Invitation backend (RPC, schemas, service, actions)

#### Automated

- [x] 1.1 Migration applies cleanly against local Supabase (`npx supabase db reset`) — 97f492a
- [x] 1.2 Type checking passes (`npm run build`) — 97f492a
- [x] 1.3 Linting passes (`npm run lint`) — 97f492a
- [x] 1.4 `accept_invitation` is idempotent and rejects mismatched email (SQL against local DB) — 97f492a

#### Manual

- [x] 1.5 Non-owner invitation insert is rejected by RLS — 97f492a
- [x] 1.6 `accept_invitation` flips acceptance for a confirmed invitee even without the `email_verified` claim — 97f492a
- [x] 1.7 Calling `accept_invitation` twice returns the same `list_id` with no error — 97f492a

### Phase 2: Email delivery via Resend

#### Automated

- [x] 2.1 Type checking passes (`npm run build`)
- [x] 2.2 Linting passes (`npm run lint`)
- [x] 2.3 `sendInvitationEmail` returns `false` without throwing when `RESEND_API_KEY` is unset

#### Manual

- [ ] 2.4 Valid key + sender delivers an email whose link is `…/invitations/accept?invite=<uuid>&email=<addr>`
- [ ] 2.5 With the key unset, `invitations.create` returns `emailSent: false` and the row persists
- [ ] 2.6 The accept link points only at the app's own origin

### Phase 3: Owner invite UI (dialog + pending list with revoke)

#### Automated

- [ ] 3.1 Type checking passes (`npm run build`)
- [ ] 3.2 Linting passes (`npm run lint`)

#### Manual

- [ ] 3.3 Invite dialog validates email, creates the invitation, and it appears in Pending invitations
- [ ] 3.4 Self-invite shows a friendly message; re-inviting a pending address shows "already invited" (no duplicate)
- [ ] 3.5 Revoke removes the invitation after confirmation; non-owners see no invite UI
- [ ] 3.6 With the Resend key unset, invite still succeeds with a "couldn't send email" warning

### Phase 4: Accept flow (public route + auth bounce)

#### Automated

- [ ] 4.1 Type checking passes (`npm run build`)
- [ ] 4.2 Linting passes (`npm run lint`)
- [ ] 4.3 `return` param is honored only for `^/invitations/accept` paths (open-redirect guard)

#### Manual

- [ ] 4.4 New-user end-to-end: invite → email → signup → confirm → re-click → accept → lands on list and it appears under "Shared with me"
- [ ] 4.5 Existing-user path: link bounces to sign-in (email prefilled), returns to accept, lands on the list
- [ ] 4.6 Wrong-address path shows the friendly mismatch page with no acceptance
- [ ] 4.7 Accepted invite shows "Accepted" in the owner's Pending invitations list
