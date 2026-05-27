-- Migration: initial wishlist schema (F-01)
--
-- Lands the AsYouWish data foundation in a single transaction:
--   * Four tables: lists, items, invitations, reservations
--   * FR-013 exclusive-reservation invariant via unique partial index
--   * Full Row-Level Security on every table, per-op per-role policies
--   * item_reservation_status view (security_invoker = true) for owner-safe
--     reservation visibility without exposing claimer_id
--
-- Identity-hiding is the load-bearing privacy invariant: reservations.SELECT
-- is restricted to the claimer; owners read taken/free via the view, never
-- the underlying rows.

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

create table public.lists (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.items (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references public.lists (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 500),
  notes       text,
  link        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.invitations (
  id                    uuid primary key default gen_random_uuid(),
  list_id               uuid not null references public.lists (id) on delete cascade,
  email                 text not null check (email = lower(trim(email)) and email like '%@%'),
  invited_at            timestamptz not null default now(),
  accepted_at           timestamptz null,
  accepted_by_user_id   uuid null references auth.users (id) on delete set null,
  unique (list_id, email)
);

create table public.reservations (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.items (id) on delete cascade,
  claimer_id   uuid not null references auth.users (id) on delete cascade,
  claimed_at   timestamptz not null default now(),
  released_at  timestamptz null
);

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------

-- FR-013: at most one active reservation per item (released rows excluded).
create unique index reservations_one_active_per_item
  on public.reservations (item_id)
  where released_at is null;

create index items_list_id_idx         on public.items (list_id);
create index invitations_email_idx     on public.invitations (email);
create index reservations_claimer_idx  on public.reservations (claimer_id);

-- ----------------------------------------------------------------------------
-- updated_at trigger
-- ----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger lists_set_updated_at
  before update on public.lists
  for each row execute function public.set_updated_at();

create trigger items_set_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------

alter table public.lists         enable row level security;
alter table public.items         enable row level security;
alter table public.invitations   enable row level security;
alter table public.reservations  enable row level security;

-- ----- lists ----------------------------------------------------------------

create policy lists_select on public.lists
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.invitations i
      where i.list_id = lists.id
        and i.accepted_by_user_id = (select auth.uid())
    )
  );

create policy lists_insert on public.lists
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy lists_update on public.lists
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy lists_delete on public.lists
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ----- items ----------------------------------------------------------------

-- Helper predicate (inlined): caller is owner of the parent list, or an
-- accepted invitee.
create policy items_select on public.items
  for select to authenticated
  using (
    exists (
      select 1 from public.lists l
      where l.id = items.list_id
        and (
          l.owner_id = (select auth.uid())
          or exists (
            select 1 from public.invitations i
            where i.list_id = l.id
              and i.accepted_by_user_id = (select auth.uid())
          )
        )
    )
  );

create policy items_insert on public.items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.lists l
      where l.id = items.list_id
        and l.owner_id = (select auth.uid())
    )
  );

create policy items_update on public.items
  for update to authenticated
  using (
    exists (
      select 1 from public.lists l
      where l.id = items.list_id
        and l.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.lists l
      where l.id = items.list_id
        and l.owner_id = (select auth.uid())
    )
  );

create policy items_delete on public.items
  for delete to authenticated
  using (
    exists (
      select 1 from public.lists l
      where l.id = items.list_id
        and l.owner_id = (select auth.uid())
    )
  );

-- ----- invitations ----------------------------------------------------------

-- Field-level immutability of `email`/`list_id` is enforced via column-level
-- GRANTs below (RLS WITH CHECK cannot reference OLD or restrict columns).
create policy invitations_select on public.invitations
  for select to authenticated
  using (
    exists (
      select 1 from public.lists l
      where l.id = invitations.list_id
        and l.owner_id = (select auth.uid())
    )
    or lower(trim((auth.jwt() ->> 'email'))) = invitations.email
  );

create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (
    exists (
      select 1 from public.lists l
      where l.id = invitations.list_id
        and l.owner_id = (select auth.uid())
    )
  );

create policy invitations_update on public.invitations
  for update to authenticated
  using (
    lower(trim((auth.jwt() ->> 'email'))) = invitations.email
    and accepted_at is null
  )
  with check (
    accepted_by_user_id = (select auth.uid())
  );

create policy invitations_delete on public.invitations
  for delete to authenticated
  using (
    exists (
      select 1 from public.lists l
      where l.id = invitations.list_id
        and l.owner_id = (select auth.uid())
    )
  );

-- Lock down writable columns: invitee may only flip the two acceptance fields.
revoke update on public.invitations from authenticated;
grant  update (accepted_at, accepted_by_user_id) on public.invitations to authenticated;

-- ----- reservations ---------------------------------------------------------

-- SELECT restricted to the claimer. Owners read taken/free state via
-- item_reservation_status; they MUST NOT see claimer_id through any path.
create policy reservations_select on public.reservations
  for select to authenticated
  using (claimer_id = (select auth.uid()));

create policy reservations_insert on public.reservations
  for insert to authenticated
  with check (
    claimer_id = (select auth.uid())
    and exists (
      select 1
      from public.items it
      join public.lists l on l.id = it.list_id
      where it.id = reservations.item_id
        and (
          l.owner_id = (select auth.uid())
          or exists (
            select 1 from public.invitations inv
            where inv.list_id = l.id
              and inv.accepted_by_user_id = (select auth.uid())
          )
        )
    )
  );

create policy reservations_update on public.reservations
  for update to authenticated
  using (claimer_id = (select auth.uid()))
  with check (claimer_id = (select auth.uid()));

-- No delete policy: claimers cannot hard-delete reservation history;
-- removal happens via CASCADE from items / auth.users only.

-- Lock down writable columns: claimer may only mark a reservation released.
revoke update on public.reservations from authenticated;
grant  update (released_at) on public.reservations to authenticated;

-- ----------------------------------------------------------------------------
-- item_reservation_status view
-- ----------------------------------------------------------------------------

-- security_invoker = true is load-bearing: the caller's RLS on `items` and
-- `reservations` gates the rows the view returns. The view exposes only the
-- boolean is_reserved; claimer_id is never selected.
create view public.item_reservation_status
  with (security_invoker = true)
  as
  select
    i.id      as item_id,
    i.list_id as list_id,
    exists (
      select 1
      from public.reservations r
      where r.item_id = i.id
        and r.released_at is null
    ) as is_reserved
  from public.items i;

grant select on public.item_reservation_status to authenticated;
