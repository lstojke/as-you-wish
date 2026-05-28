-- verify.sql — RLS persona probes for the wishlist schema (F-01).
--
-- Run inside the local Supabase db container:
--   docker exec -i $(docker ps -qf name=supabase_db) \
--     psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /dev/stdin < verify.sql
--
-- Strategy: spoof Supabase JWT context via `request.jwt.claims` so the
-- `authenticated` role evaluates RLS as a given user. Three personas:
--   owner      - owns the list, is NOT a claimer
--   invitee    - accepted invitation for the list, claims one item
--   outsider   - no relationship to the list
--
-- Each probe is wrapped in `set local role authenticated; set local
-- "request.jwt.claims" = '<json>';` so the policy sees the right uid/email.
--
-- Outcomes are asserted via `do $$ ... $$` blocks that raise on unexpected
-- visibility. A successful run prints "OK: all persona probes pass" at the
-- end and exits 0; any failure raises with the failing probe's name.

\set ON_ERROR_STOP on

begin;

-- ----------------------------------------------------------------------------
-- Fixtures: three users in auth.users, one list, one item, one invitation.
-- ----------------------------------------------------------------------------

-- Stable UUIDs so we can re-reference them across probes.
\set owner_uid     '''11111111-1111-1111-1111-111111111111'''
\set invitee_uid   '''22222222-2222-2222-2222-222222222222'''
\set outsider_uid  '''33333333-3333-3333-3333-333333333333'''

insert into auth.users (id, email, instance_id, aud, role, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values
  (:owner_uid::uuid,    'owner@example.test',    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now(), now(), '{}', '{}'),
  (:invitee_uid::uuid,  'invitee@example.test',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now(), now(), '{}', '{}'),
  (:outsider_uid::uuid, 'outsider@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now(), now(), '{}', '{}')
on conflict (id) do nothing;

-- Seed schema rows as superuser (bypasses RLS) so persona probes have data
-- to read or fail against.
insert into public.lists (id, owner_id, title) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', :owner_uid::uuid, 'Birthday list');

insert into public.items (id, list_id, title) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Vinyl record');

insert into public.invitations (id, list_id, email, accepted_at, accepted_by_user_id) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'invitee@example.test',
   now(),
   :invitee_uid::uuid);

-- Invitee claims the item so we have a reservation row to probe.
insert into public.reservations (id, item_id, claimer_id) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   :invitee_uid::uuid);

commit;

-- ----------------------------------------------------------------------------
-- Helper: assert_count(expected_int, actual_int, probe_name_text)
-- ----------------------------------------------------------------------------

create or replace function pg_temp.assert_count(expected int, actual int, probe text)
returns void language plpgsql as $$
begin
  if expected <> actual then
    raise exception 'FAIL [%]: expected %, got %', probe, expected, actual;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Persona: OWNER
-- ----------------------------------------------------------------------------

begin;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@example.test","email_verified":"true","role":"authenticated"}';

-- Owner sees their own list.
select pg_temp.assert_count(1,
  (select count(*)::int from public.lists where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'owner.lists_select_own');

-- Owner sees items on their list.
select pg_temp.assert_count(1,
  (select count(*)::int from public.items where list_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'owner.items_select_own_list');

-- Owner CANNOT see reservation rows (the load-bearing privacy check).
select pg_temp.assert_count(0,
  (select count(*)::int from public.reservations),
  'owner.reservations_blocked');

-- Owner sees is_reserved via the view (boolean, no claimer_id).
select pg_temp.assert_count(1,
  (select count(*)::int from public.item_reservation_status
    where list_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and is_reserved = true),
  'owner.view_sees_is_reserved');

commit;

-- ----------------------------------------------------------------------------
-- Persona: INVITEE
-- ----------------------------------------------------------------------------

begin;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","email":"invitee@example.test","email_verified":"true","role":"authenticated"}';

-- Invitee sees the list they were invited to.
select pg_temp.assert_count(1,
  (select count(*)::int from public.lists where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'invitee.lists_select_via_invitation');

-- Invitee sees items on that list.
select pg_temp.assert_count(1,
  (select count(*)::int from public.items where list_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'invitee.items_select_via_invitation');

-- Invitee CANNOT insert items (owner-only).
do $$
begin
  begin
    insert into public.items (list_id, title)
      values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'sneaky');
    raise exception 'FAIL [invitee.items_insert_blocked]: insert should have been denied';
  exception when insufficient_privilege or check_violation then
    null;
  end;
end $$;

-- Invitee sees their own reservation row.
select pg_temp.assert_count(1,
  (select count(*)::int from public.reservations
    where claimer_id = '22222222-2222-2222-2222-222222222222'),
  'invitee.reservations_select_own');

commit;

-- ----------------------------------------------------------------------------
-- Persona: OUTSIDER
-- ----------------------------------------------------------------------------

begin;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333333","email":"outsider@example.test","email_verified":"true","role":"authenticated"}';

select pg_temp.assert_count(0,
  (select count(*)::int from public.lists),
  'outsider.lists_blocked');

select pg_temp.assert_count(0,
  (select count(*)::int from public.items),
  'outsider.items_blocked');

select pg_temp.assert_count(0,
  (select count(*)::int from public.invitations),
  'outsider.invitations_blocked');

select pg_temp.assert_count(0,
  (select count(*)::int from public.reservations),
  'outsider.reservations_blocked');

select pg_temp.assert_count(0,
  (select count(*)::int from public.item_reservation_status),
  'outsider.view_blocked');

commit;

-- ----------------------------------------------------------------------------
-- Column-grant defense (F2/F3 fix verification)
-- ----------------------------------------------------------------------------

-- Invitee must NOT be able to mutate list_id on their invitation row.
begin;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","email":"invitee@example.test","email_verified":"true","role":"authenticated"}';

do $$
begin
  begin
    update public.invitations
       set list_id = '00000000-0000-0000-0000-000000000000'
     where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    raise exception 'FAIL [invitee.invitations_list_id_locked]: list_id should be unwritable';
  exception when insufficient_privilege then
    null;
  end;
end $$;

-- Claimer must NOT be able to mutate item_id on their reservation row.
do $$
begin
  begin
    update public.reservations
       set item_id = '00000000-0000-0000-0000-000000000000'
     where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    raise exception 'FAIL [invitee.reservations_item_id_locked]: item_id should be unwritable';
  exception when insufficient_privilege then
    null;
  end;
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Cleanup
-- ----------------------------------------------------------------------------

begin;
delete from public.lists where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
delete from auth.users where id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333'
);
commit;

select 'OK: all persona probes pass' as result;
