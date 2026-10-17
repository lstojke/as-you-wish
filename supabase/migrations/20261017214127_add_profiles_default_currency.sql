-- Per-user profile store. First user-preference table; carries the default
-- currency applied to newly priced items. Rows are provisioned by the
-- handle_new_user() trigger on signup plus a one-time backfill below.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  default_currency char(3) not null default 'PLN' check (default_currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- Self-only policies. profiles never reads another RLS'd table, so no
-- SECURITY DEFINER helper is needed to avoid recursion.
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Defensive self-insert path; primary provisioning is the trigger below.
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- One-time backfill for users created before this migration.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;
