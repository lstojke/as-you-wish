alter table public.profiles
  add column first_name text
    check (char_length(first_name) between 1 and 100 and first_name ~ '[^[:space:]]'),
  add column last_name text
    check (char_length(last_name) between 1 and 100 and last_name ~ '[^[:space:]]');

create table public.profile_important_dates (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  date date not null check (date between date '0001-01-01' and date '9999-12-31'),
  heading text not null check (char_length(heading) between 1 and 100 and heading ~ '[^[:space:]]'),
  description text
    check (char_length(description) between 1 and 1000 and description ~ '[^[:space:]]'),
  repeat_frequency text not null default 'yearly'
    check (repeat_frequency in ('none', 'weekly', 'monthly', 'yearly')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profile_important_dates_owner_date_id
  on public.profile_important_dates (profile_id, date, id);

create trigger profile_important_dates_set_updated_at
  before update on public.profile_important_dates
  for each row execute function public.set_updated_at();

alter table public.profile_important_dates enable row level security;

create policy profile_important_dates_select on public.profile_important_dates
  for select to authenticated
  using (profile_id = (select auth.uid()));

create policy profile_important_dates_insert on public.profile_important_dates
  for insert to authenticated
  with check (profile_id = (select auth.uid()));

create policy profile_important_dates_update on public.profile_important_dates
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy profile_important_dates_delete on public.profile_important_dates
  for delete to authenticated
  using (profile_id = (select auth.uid()));
