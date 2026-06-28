-- smoke.sql — Phase 3 §3.5 production cascade probe.
--
-- Run in Supabase Studio (production project) SQL editor, which executes as
-- `postgres` and bypasses RLS. Verifies the CASCADE chain end-to-end:
--   lists -> items / invitations / reservations
--
-- Before running, set OWNER_UID to a real auth.users.id from this project
-- (any existing confirmed user). All other UUIDs are fixtures.

\set OWNER_UID '''00000000-0000-0000-0000-000000000000'''  -- <-- REPLACE
\set LIST_ID   '''aaaaaaaa-0000-4000-8000-000000000001'''
\set ITEM_ID   '''bbbbbbbb-0000-4000-8000-000000000001'''
\set INVITE_ID '''cccccccc-0000-4000-8000-000000000001'''
\set RES_ID    '''dddddddd-0000-4000-8000-000000000001'''

begin;

-- 1. Insert one of each.
insert into public.lists (id, owner_id, title)
  values (:LIST_ID::uuid, :OWNER_UID::uuid, 'smoke-test list');

insert into public.items (id, list_id, title)
  values (:ITEM_ID::uuid, :LIST_ID::uuid, 'smoke-test item');

insert into public.invitations (id, list_id, email)
  values (:INVITE_ID::uuid, :LIST_ID::uuid, 'smoke-invitee@example.test');

insert into public.reservations (id, item_id, claimer_id)
  values (:RES_ID::uuid, :ITEM_ID::uuid, :OWNER_UID::uuid);

-- 2. Confirm presence (expect 1, 1, 1, 1).
select 'before' as phase,
  (select count(*) from public.lists        where id = :LIST_ID::uuid)   as lists,
  (select count(*) from public.items        where id = :ITEM_ID::uuid)   as items,
  (select count(*) from public.invitations  where id = :INVITE_ID::uuid) as invitations,
  (select count(*) from public.reservations where id = :RES_ID::uuid)    as reservations;

-- 3. Spot-check the owner-safe view returns is_reserved = true.
select 'view' as phase, is_reserved
  from public.item_reservation_status
  where item_id = :ITEM_ID::uuid;

-- 4. Delete the list. CASCADE must remove items, invitations, reservations.
delete from public.lists where id = :LIST_ID::uuid;

-- 5. Confirm cascade (expect 0, 0, 0, 0).
select 'after' as phase,
  (select count(*) from public.lists        where id = :LIST_ID::uuid)   as lists,
  (select count(*) from public.items        where id = :ITEM_ID::uuid)   as items,
  (select count(*) from public.invitations  where id = :INVITE_ID::uuid) as invitations,
  (select count(*) from public.reservations where id = :RES_ID::uuid)    as reservations;

commit;
