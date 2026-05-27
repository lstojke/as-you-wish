# Phase 3 Production Smoke Notes

**Date:** 2026-05-27
**Target:** linked production Supabase project
**Migration applied:** `20260527125732_initial_wishlist_schema.sql`

## 3.1 — Migration applied to remote

`npx supabase migration list --linked`:

```
Local          | Remote         | Time (UTC)
---------------|---------------|--------------------
20260527125732 | 20260527125732 | 2026-05-27 12:57:32
```

Two pre-existing remote bookkeeping rows (`20260525110234`, `20260525110654`) were marked `reverted` via `supabase migration repair` after confirming the remote `public` schema was empty (`supabase db dump --linked --schema public` returned only default grants).

## 3.2 — Cloudflare Worker deploy unaffected

Schema-only change; no Worker rebuild triggered or required.

## 3.3 — Production regression check

```
$ curl -sI https://as-you-wish.as-you-wish.workers.dev/ | head -1
HTTP/2 200
```

## 3.4 — Production login

Confirmed working post-migration.

## 3.5 — Cascade probe

Ran the probe in `smoke.sql` manually against the production project (Studio
SQL editor, postgres role). Inserted one `lists` row, one `items` row, one
`invitations` row, one `reservations` row, then deleted the list.

Result matched expected output exactly:

- `before`: lists=1, items=1, invitations=1, reservations=1
- `view`: is_reserved = true
- `after`: lists=0, items=0, invitations=0, reservations=0

CASCADE chain from `lists` → `items` → `reservations` and `lists` → `invitations` confirmed.

## 3.6 — These notes recorded

This file.
