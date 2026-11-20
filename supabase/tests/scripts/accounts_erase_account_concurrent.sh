#!/bin/sh
# Issue #1244: two workers on the same due request at the same time delete once and send one confirmation.
# pgTAP runs in one session and cannot overlap two transactions, so this script opens two psql sessions against a local database.
# Usage: DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres sh supabase/tests/scripts/accounts_erase_account_concurrent.sh
# Synthetic data only; it removes what it created.
set -eu
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
psql_q() { psql "$DB_URL" -v ON_ERROR_STOP=1 -At -q "$@"; }
fail() { echo "FAIL: $1" >&2; cleanup; exit 1; }

USER_ID=$(psql_q -c "select gen_random_uuid()")
ATHLETE_ID=$(psql_q -c "select gen_random_uuid()")
STARTED=$(psql_q -c "select clock_timestamp()")
OUT1=$(mktemp); OUT2=$(mktemp)
cleanup() {
  psql_q -c "delete from public.account_deletion_requests where user_id = '$USER_ID'; delete from public.athletes where id = '$ATHLETE_ID'; delete from auth.users where id = '$USER_ID'; delete from public.account_deletion_audit where erased_at >= '$STARTED'" >/dev/null 2>&1 || true
  rm -f "$OUT1" "$OUT2"
}

psql_q >/dev/null <<SQL
insert into auth.users (id, email) values ('$USER_ID', 'concurrent-erase@example.test');
insert into public.athletes (id, first_name, last_name) values ('$ATHLETE_ID', 'Concurrent', 'Swimmer');
insert into public.athlete_managers (user_id, athlete_id, relation) values ('$USER_ID', '$ATHLETE_ID', 'guardian');
insert into public.account_deletion_requests (user_id, email, delete_after) values ('$USER_ID', 'concurrent-erase@example.test', now() - interval '1 day');
SQL
REQUEST_ID=$(psql_q -c "select id from public.account_deletion_requests where user_id = '$USER_ID'")

# Worker 1 holds the request row open for 3 seconds; worker 2 arrives while it does.
psql_q -c "begin; select public.erase_account('$REQUEST_ID') ->> 'status'; select pg_sleep(3); commit;" > "$OUT1" &
PID1=$!
sleep 1
psql_q -c "select public.erase_account('$REQUEST_ID') ->> 'status'" > "$OUT2"
wait $PID1

grep -q '^deleted$' "$OUT1" || fail "worker 1 did not delete: $(cat "$OUT1")"
grep -q '^skipped$' "$OUT2" || fail "worker 2 did not skip: $(cat "$OUT2")"
[ "$(psql_q -c "select count(*) from auth.users where id = '$USER_ID'")" = 0 ] || fail "the user still exists"
[ "$(psql_q -c "select count(*) from public.account_deletion_requests where id = '$REQUEST_ID' and status = 'deleted'")" = 1 ] || fail "the request is not deleted"
# One confirmation: the first claim offers the request, the second (another worker, right after) offers nothing.
CLAIM1=$(psql_q -c "select jsonb_array_length(public.claim_account_deletion_mail())")
CLAIM2=$(psql_q -c "select jsonb_array_length(public.claim_account_deletion_mail())")
[ "$CLAIM1" = 1 ] || fail "the first claim offered $CLAIM1 emails"
[ "$CLAIM2" = 0 ] || fail "the second claim offered $CLAIM2 emails"
echo "ok: two workers at once deleted once and offered one confirmation email"
psql_q -c "select public.finish_account_deletion_mail('$REQUEST_ID', 'deleted')" >/dev/null
cleanup
