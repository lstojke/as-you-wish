-- Migration: align is_item_reserved with the deployed definition (S-04)
--
-- Drift reconciliation. The hosted database's public.is_item_reserved carries
-- an is_item_list_member(item_uuid) guard that the initial schema migration
-- (20260527125732) never captured, so a fresh `supabase db reset` would
-- regenerate the weaker, guard-less version and diverge local from prod.
--
-- The guard is intended defense-in-depth: is_item_reserved is granted to
-- `authenticated` and could otherwise be called directly to probe any item's
-- taken/free status. Requiring caller membership restricts the boolean to
-- list members only. The item_reservation_status view already filters rows via
-- security_invoker RLS on items, so the view path is unaffected for members;
-- this only closes the direct-call probing gap.
--
-- Idempotent (CREATE OR REPLACE) and additive: matches what is already live,
-- so applying it to the hosted project is a no-op.

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
