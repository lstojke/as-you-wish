alter table public.invitations
  add column role text not null default 'viewer'
  check (role in ('viewer', 'collaborator'));

-- Only acceptance may set membership; owners can still choose an invite role.
revoke insert on public.invitations from authenticated;
grant insert (id, list_id, email, invited_at, role) on public.invitations to authenticated;

create function public.is_list_editor(list_uuid uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_list_owner(list_uuid) or exists (
    select 1
    from public.invitations i
    where i.list_id = list_uuid
      and i.accepted_at is not null
      and i.accepted_by_user_id = (select auth.uid())
      and i.role = 'collaborator'
  );
$$;

create function public.get_list_role(p_list_id uuid)
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select case
    when l.owner_id = (select auth.uid()) then 'owner'
    when public.is_list_editor(l.id) then 'collaborator'
    when exists (
      select 1 from public.invitations i
      where i.list_id = l.id and i.accepted_by_user_id = (select auth.uid())
        and i.accepted_at is not null
    ) then 'viewer'
    else null
  end
  from public.lists l
  where l.id = p_list_id;
$$;

create function public.set_invitation_role(p_invitation_id uuid, p_role text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_role is null or p_role not in ('viewer', 'collaborator') then
    raise exception 'invalid invitation role' using errcode = '22023';
  end if;

  perform 1
  from public.invitations i
  join public.lists l on l.id = i.list_id
  where i.id = p_invitation_id and l.owner_id = (select auth.uid())
  for update of i;
  if not found then
    raise exception 'invitation not found or not owned' using errcode = '42501';
  end if;

  update public.invitations set role = p_role where id = p_invitation_id;
  return true;
end;
$$;

create function public.rename_collaborative_list(p_list_id uuid, p_title text)
returns setof public.lists
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_list_editor(p_list_id) then
    raise exception 'list not found or not editable' using errcode = '42501';
  end if;
  if p_title is null or pg_catalog.char_length(pg_catalog.btrim(p_title)) not between 1 and 200 then
    raise exception 'invalid list title' using errcode = '22023';
  end if;

  return query
    update public.lists set title = pg_catalog.btrim(p_title)
    where id = p_list_id
    returning *;
end;
$$;

revoke all on function public.is_list_editor(uuid) from public, anon, authenticated;
revoke all on function public.get_list_role(uuid) from public, anon, authenticated;
revoke all on function public.set_invitation_role(uuid, text) from public, anon, authenticated;
revoke all on function public.rename_collaborative_list(uuid, text) from public, anon, authenticated;
grant execute on function public.is_list_editor(uuid) to authenticated;
grant execute on function public.get_list_role(uuid) to authenticated;
grant execute on function public.set_invitation_role(uuid, text) to authenticated;
grant execute on function public.rename_collaborative_list(uuid, text) to authenticated;

drop policy items_insert on public.items;
drop policy items_update on public.items;
drop policy items_delete on public.items;

create policy items_insert on public.items
  for insert to authenticated
  with check (public.is_list_editor(list_id));

create policy items_update on public.items
  for update to authenticated
  using (public.is_list_editor(list_id))
  with check (public.is_list_editor(list_id));

create policy items_delete on public.items
  for delete to authenticated
  using (public.is_list_editor(list_id));

-- A write policy cannot compare old and new identity or list columns.
revoke update on public.items from authenticated;
grant update (title, notes, link, price_cents, currency, created_at, updated_at)
  on public.items to authenticated;
