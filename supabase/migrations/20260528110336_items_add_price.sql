-- 20260528110336_items_add_price.sql
-- S-01 schema delta: estimated price on items.
-- Adds two nullable columns to public.items:
--   * price_cents (integer, non-negative)
--   * currency    (char(3), ISO 4217-shaped uppercase)
-- Both nullable so an item may carry only a title + link if the owner does
-- not yet know the price. CHECK constraints enforce shape, not list membership.

alter table public.items
  add column price_cents integer
    check (price_cents is null or price_cents >= 0);

alter table public.items
  add column currency char(3)
    check (currency is null or currency ~ '^[A-Z]{3}$');
