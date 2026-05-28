-- Migration: gate invitation acceptance on confirmed email (F-01 follow-up)
--
-- Closes the invitation-hijack class flagged in impl-review F1: with
-- unconfirmed signup, an attacker can register `victim@example.com` and
-- accept any invitation addressed to that email. Defense in depth — fix
-- in the policy so we don't depend on project auth settings.
--
-- Supabase's GoTrue emits `email_verified: true|false` as a top-level JWT
-- claim. We require it to be the literal string 'true' (auth.jwt() ->> ...
-- returns text). Service-role and superuser paths bypass RLS entirely.

drop policy if exists invitations_select on public.invitations;
drop policy if exists invitations_update on public.invitations;

create policy invitations_select on public.invitations
  for select to authenticated
  using (
    public.is_list_owner(list_id)
    or (
      lower(trim((auth.jwt() ->> 'email'))) = invitations.email
      and (auth.jwt() ->> 'email_verified') = 'true'
    )
  );

create policy invitations_update on public.invitations
  for update to authenticated
  using (
    lower(trim((auth.jwt() ->> 'email'))) = invitations.email
    and (auth.jwt() ->> 'email_verified') = 'true'
    and accepted_at is null
  )
  with check (
    accepted_by_user_id = (select auth.uid())
  );

-- Defense in depth (impl-review F4): wrap is_item_reserved so that
-- non-members get `false` instead of leaking taken/free state for an
-- item they have no business knowing about. UUIDs are unguessable so
-- the prior risk was theoretical — this just removes the class.
create or replace function public.is_item_reserved(item_uuid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.is_item_list_member(item_uuid)
    and exists (
      select 1 from public.reservations r
      where r.item_id = item_uuid and r.released_at is null
    );
$$;
