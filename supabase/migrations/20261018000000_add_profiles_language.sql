-- Per-user UI language. Mirrors the `lang` cookie so the choice follows a
-- signed-in user across devices. Existing self-only RLS policies on profiles
-- already cover select/update; the column default provisions new users.
alter table public.profiles
  add column language text not null default 'pl' check (language in ('pl', 'en'));
