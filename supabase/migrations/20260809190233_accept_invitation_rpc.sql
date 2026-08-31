-- Migration: accept_invitation RPC (S-03)
--
-- Reliable, idempotent invitation acceptance that does NOT depend on the
-- `email_verified` JWT claim. lessons.md documents that GoTrue often omits
-- that claim even for confirmed users, so the invitee-side RLS UPDATE on
-- public.invitations silently no-ops. This SECURITY DEFINER function reads
-- auth.users.email_confirmed_at directly, keeping the anti-hijack guarantee
-- (real confirmation timestamp + email match) without the fragile claim.
--
-- Additive only: rolling the Worker back leaves this function unused and
-- harmless (see AGENTS.md rollback rule).

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

  -- Idempotent: a second accept (or re-click) returns the same list.
  if v_inv.accepted_by_user_id is not null then
    return v_inv.list_id;
  end if;

  update public.invitations
     set accepted_at = now(), accepted_by_user_id = v_uid
   where id = invite_id;

  return v_inv.list_id;
end;
$$;

revoke execute on function public.accept_invitation(uuid) from public, anon;
grant  execute on function public.accept_invitation(uuid) to authenticated;
