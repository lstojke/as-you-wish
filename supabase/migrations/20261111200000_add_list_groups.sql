-- Migration: personal list groups
--
-- Private, user-owned topic groups (e.g. "Christmas") with a many-to-many
-- association to lists the user can access (owned or accepted invitation).
-- Groups never grant list access: every membership read re-checks
-- is_list_member(), so a list whose invitation was revoked disappears from
-- the group without deleting the stale association. Owners remove stale
-- associations through remove_list_from_group(), because RLS would otherwise
-- hide those rows from DELETE as well.
--
-- Additive only: rolling the Worker back leaves these tables unused.

create table public.list_groups (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 100 and name ~ '[^[:space:]]'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Target for the composite FK below so memberships always match the group owner.
  unique (id, user_id)
);

create table public.list_group_members (
  group_id    uuid not null,
  list_id     uuid not null references public.lists (id) on delete cascade,
  user_id     uuid not null,
  created_at  timestamptz not null default now(),
  primary key (group_id, list_id),
  foreign key (group_id, user_id) references public.list_groups (id, user_id) on delete cascade
);

create index list_groups_user_created_idx on public.list_groups (user_id, created_at, id);
create index list_group_members_user_idx  on public.list_group_members (user_id);
create index list_group_members_list_idx  on public.list_group_members (list_id);

create trigger list_groups_set_updated_at
  before update on public.list_groups
  for each row execute function public.set_updated_at();

alter table public.list_groups        enable row level security;
alter table public.list_group_members enable row level security;

-- ----- list_groups ----------------------------------------------------------

create policy list_groups_select on public.list_groups
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy list_groups_insert on public.list_groups
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy list_groups_update on public.list_groups
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy list_groups_delete on public.list_groups
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Only the name is user-editable; ownership and timestamps are fixed.
revoke update on public.list_groups from authenticated;
grant update (name) on public.list_groups to authenticated;

-- ----- list_group_members ---------------------------------------------------

create policy list_group_members_select on public.list_group_members
  for select to authenticated
  using (user_id = (select auth.uid()) and public.is_list_member(list_id));

create policy list_group_members_insert on public.list_group_members
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.list_groups g
      where g.id = group_id and g.user_id = (select auth.uid())
    )
    and public.is_list_member(list_id)
  );

create policy list_group_members_delete on public.list_group_members
  for delete to authenticated
  using (user_id = (select auth.uid()) and public.is_list_member(list_id));

-- Associations are immutable; move a list by delete + insert.
revoke update on public.list_group_members from authenticated;

-- Removes an association from a group the caller owns, including a stale one
-- whose list the caller can no longer access. Returns nothing about the list.
-- Raises P0002 when the group is not the caller's, or when nothing was removed
-- and the list is inaccessible, so unauthorized IDs are never a silent success.
create function public.remove_list_from_group(p_group_id uuid, p_list_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_removed integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not exists (select 1 from public.list_groups g where g.id = p_group_id and g.user_id = v_uid) then
    raise exception 'list group not found' using errcode = 'P0002';
  end if;

  delete from public.list_group_members m
  where m.group_id = p_group_id and m.list_id = p_list_id and m.user_id = v_uid;
  get diagnostics v_removed = row_count;

  if v_removed = 0 and not public.is_list_member(p_list_id) then
    raise exception 'list not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.remove_list_from_group(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.remove_list_from_group(uuid, uuid) to authenticated;
