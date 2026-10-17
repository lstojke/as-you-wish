create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_extension e
    join pg_catalog.pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pgcrypto' and n.nspname = 'extensions'
  ) then
    raise exception 'pgcrypto must be installed in the extensions schema before enabling list sharing';
  end if;
end;
$$;

-- Recoverable bearer tokens live outside lists, whose existing readers use select("*").
create table public.list_share_links (
  list_id uuid primary key references public.lists (id) on delete cascade,
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  disabled_at timestamptz
);

alter table public.list_share_links enable row level security;
revoke all on public.list_share_links from public, anon, authenticated;
grant select on public.list_share_links to authenticated;

create policy list_share_links_select on public.list_share_links
  for select to authenticated
  using (public.is_list_owner(list_id));

create function public.get_or_create_list_share(p_list_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_share public.list_share_links%rowtype;
begin
  -- Lock the parent: the sharing row does not exist on concurrent first creation.
  perform 1 from public.lists
  where id = p_list_id and owner_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'list not found or not owned' using errcode = '42501';
  end if;

  insert into public.list_share_links (list_id, token)
  values (p_list_id, pg_catalog.encode(extensions.gen_random_bytes(32), 'hex'))
  on conflict (list_id) do nothing;

  select * into strict v_share from public.list_share_links where list_id = p_list_id;
  if v_share.disabled_at is not null then
    return pg_catalog.jsonb_build_object('state', 'disabled', 'token', null);
  end if;
  return pg_catalog.jsonb_build_object('state', 'active', 'token', v_share.token);
end;
$$;

create function public.disable_list_share(p_list_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.lists
  where id = p_list_id and owner_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'list not found or not owned' using errcode = '42501';
  end if;

  update public.list_share_links
  set disabled_at = coalesce(disabled_at, pg_catalog.now())
  where list_id = p_list_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'not_created', 'token', null);
  end if;
  return pg_catalog.jsonb_build_object('state', 'disabled', 'token', null);
end;
$$;

create function public.replace_list_share(p_list_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  perform 1 from public.lists
  where id = p_list_id and owner_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'list not found or not owned' using errcode = '42501';
  end if;

  insert into public.list_share_links (list_id, token)
  values (p_list_id, pg_catalog.encode(extensions.gen_random_bytes(32), 'hex'))
  on conflict (list_id) do update
    set token = excluded.token, disabled_at = null
  returning token into v_token;

  return pg_catalog.jsonb_build_object('state', 'active', 'token', v_token);
end;
$$;

create function public.read_list_share(p_token text)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'list_id', l.id,
    'title', l.title,
    'items', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'title', i.title,
          'notes', i.notes,
          'price_cents', i.price_cents,
          'currency', i.currency,
          'link', i.link
        ) order by i.created_at, i.id
      )
      from public.items i
      where i.list_id = l.id
    ), '[]'::jsonb)
  )
  from public.list_share_links s
  join public.lists l on l.id = s.list_id
  where p_token ~ '^[0-9a-f]{64}$'
    and s.token = p_token
    and s.disabled_at is null;
$$;

revoke execute on function public.get_or_create_list_share(uuid) from public, anon, authenticated;
revoke execute on function public.disable_list_share(uuid) from public, anon, authenticated;
revoke execute on function public.replace_list_share(uuid) from public, anon, authenticated;
revoke execute on function public.read_list_share(text) from public, anon, authenticated;

grant execute on function public.get_or_create_list_share(uuid) to authenticated;
grant execute on function public.disable_list_share(uuid) to authenticated;
grant execute on function public.replace_list_share(uuid) to authenticated;
grant execute on function public.read_list_share(text) to anon, authenticated;
