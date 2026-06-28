#!/usr/bin/env bash
# race-test.sh — proves FR-013 via the unique partial index on reservations.
#
# Two concurrent transactions try to insert a reservation for the same
# item_id. With `reservations_one_active_per_item UNIQUE (item_id) WHERE
# released_at IS NULL`, Postgres must commit exactly one and reject the
# other with SQLSTATE 23505.
#
# Run against the local Supabase db container (db service must be up):
#   bash context/changes/wishlist-data-schema/race-test.sh
#
# Round 2 re-claim: after releasing the active reservation, the partial
# index allows a new reservation row to be inserted. We assert that too.

set -euo pipefail

DB_CONTAINER="$(docker ps --format '{{.Names}}' | grep '^supabase_db' | head -1 || true)"
if [[ -z "$DB_CONTAINER" ]]; then
  echo "FAIL: no supabase_db container running. Start with 'npx supabase start'." >&2
  exit 1
fi

PSQL=(docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA)

OWNER='44444444-4444-4444-4444-444444444444'
CLAIMER_A='55555555-5555-5555-5555-555555555555'
CLAIMER_B='66666666-6666-6666-6666-666666666666'
LIST='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
ITEM='ffffffff-ffff-ffff-ffff-ffffffffffff'

cleanup() {
  "${PSQL[@]}" >/dev/null <<SQL
delete from public.lists where id = '$LIST';
delete from auth.users where id in ('$OWNER','$CLAIMER_A','$CLAIMER_B');
SQL
}
trap cleanup EXIT

# Fixtures (superuser, bypasses RLS).
"${PSQL[@]}" >/dev/null <<SQL
insert into auth.users (id, email, instance_id, aud, role, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('$OWNER',     'owner-race@example.test',     '00000000-0000-0000-0000-000000000000','authenticated','authenticated','',now(),now(),now(),'{}','{}'),
  ('$CLAIMER_A', 'a-race@example.test',         '00000000-0000-0000-0000-000000000000','authenticated','authenticated','',now(),now(),now(),'{}','{}'),
  ('$CLAIMER_B', 'b-race@example.test',         '00000000-0000-0000-0000-000000000000','authenticated','authenticated','',now(),now(),now(),'{}','{}')
on conflict (id) do nothing;

insert into public.lists (id, owner_id, title) values ('$LIST','$OWNER','race list');
insert into public.items (id, list_id, title)  values ('$ITEM','$LIST','contested item');
SQL

# Two concurrent INSERTs against the same item_id.
# Use ANALYZE-free, no-app-locking inserts so the race is pure DB resolution.
TMPA="$(mktemp)"
TMPB="$(mktemp)"

(
  "${PSQL[@]}" 2>&1 <<SQL
insert into public.reservations (item_id, claimer_id)
  values ('$ITEM','$CLAIMER_A');
SQL
) > "$TMPA" 2>&1 &
PID_A=$!

(
  "${PSQL[@]}" 2>&1 <<SQL
insert into public.reservations (item_id, claimer_id)
  values ('$ITEM','$CLAIMER_B');
SQL
) > "$TMPB" 2>&1 &
PID_B=$!

set +e
wait $PID_A; STATUS_A=$?
wait $PID_B; STATUS_B=$?
set -e

# Exactly one must succeed (exit 0), exactly one must fail.
SUCCESS=0
FAILURE=0
FAIL_OUT=""
for s in "$STATUS_A:$TMPA" "$STATUS_B:$TMPB"; do
  code="${s%%:*}"
  log="${s#*:}"
  if [[ "$code" == "0" ]]; then
    SUCCESS=$((SUCCESS + 1))
  else
    FAILURE=$((FAILURE + 1))
    FAIL_OUT="$(cat "$log")"
  fi
done

rm -f "$TMPA" "$TMPB"

if [[ "$SUCCESS" -ne 1 || "$FAILURE" -ne 1 ]]; then
  echo "FAIL: expected exactly one success and one failure, got success=$SUCCESS failure=$FAILURE" >&2
  exit 1
fi

if ! grep -qE "23505|reservations_one_active_per_item" <<<"$FAIL_OUT"; then
  echo "FAIL: losing insert did not raise the expected unique-violation. Output:" >&2
  echo "$FAIL_OUT" >&2
  exit 1
fi

# Round 2: release the active reservation, then a fresh insert must succeed
# (proves the partial index allows re-claim after release).
"${PSQL[@]}" >/dev/null <<SQL
update public.reservations set released_at = now() where item_id = '$ITEM' and released_at is null;
insert into public.reservations (item_id, claimer_id) values ('$ITEM','$CLAIMER_B');
SQL

# Count active reservations: must be exactly 1.
ACTIVE="$("${PSQL[@]}" <<SQL
select count(*) from public.reservations where item_id = '$ITEM' and released_at is null;
SQL
)"
if [[ "$ACTIVE" != "1" ]]; then
  echo "FAIL: after release+reclaim, expected 1 active reservation, got $ACTIVE" >&2
  exit 1
fi

echo "OK: exactly one insert succeeded"
