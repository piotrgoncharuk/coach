#!/usr/bin/env bash
# Сквозная проверка MCP-сервера: Edge Function в настоящем Deno, настоящий Postgres
# с миграциями, запросы по HTTP — так, как их шлёт Grok.
# Нужны postgres 16 и deno (DENO=/путь/к/deno). Запуск: npm run mcp:smoke
set -euo pipefail
DENO=${DENO:-deno}
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PGD=/tmp/coach-smoke-pg SOCK=/tmp/coach-smoke-sock PORT=5435 HTTP=8000  # Deno.serve без параметров слушает 8000
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN=cch_smoke_test_token_0123456789abcdefXYZ
HASH=$(printf %s "$TOKEN" | sha256sum | cut -d' ' -f1)

cleanup() {
  pkill -f "functions/mcp/index.ts" 2>/dev/null || true
  su postgres -c "$PGBIN/pg_ctl -D $PGD stop -m immediate" >/dev/null 2>&1 || true
}
trap cleanup EXIT

rm -rf "$PGD" "$SOCK" && mkdir -p "$PGD" "$SOCK" && chown -R postgres:postgres "$PGD" "$SOCK"
su postgres -c "$PGBIN/initdb -D $PGD -A trust -U postgres" >/dev/null
su postgres -c "$PGBIN/pg_ctl -D $PGD -o '-k $SOCK -p $PORT -c listen_addresses=127.0.0.1' -l /tmp/coach-smoke-pg.log start" >/dev/null
sleep 1
P="psql -h $SOCK -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$P -c "create database coach"
$P -d coach -f "$ROOT/supabase/test/00_auth_stub.sql" $(for f in "$ROOT"/supabase/migrations/*.sql; do printf -- '-f %s ' "$f"; done)
$P -d coach -c "insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001', 'p@test');
  update public.profiles set display_name = 'Пётр';
  insert into public.api_tokens (user_id, name, token_hash, prefix) values ('aaaaaaaa-0000-4000-8000-000000000001', 'smoke', '$HASH', 'cch_smoke');"

(cd "$ROOT" && SUPABASE_DB_URL="postgres://postgres@127.0.0.1:$PORT/coach" "$DENO" run --allow-net --allow-env --allow-read --allow-sys supabase/functions/mcp/index.ts >/tmp/coach-smoke-deno.log 2>&1 &)
for _ in $(seq 1 30); do curl -s -o /dev/null "localhost:$HTTP" && break; sleep 1; done

rpc() { curl -s -X POST "localhost:$HTTP" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d "$1"; }
check() { if echo "$2" | grep -q "$3"; then echo " OK: $1"; else echo " ПРОВАЛ: $1"; echo "$2" | head -c 300; exit 1; fi; }

check "без токена — 401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "localhost:$HTTP" -d '{}')" '401'
check "initialize" "$(rpc '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}')" '"protocolVersion":"2025-06-18"'
check "12 инструментов" "$(rpc '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | python3 -c 'import sys,json; print(len(json.load(sys.stdin)["result"]["tools"]))')" '^12$'
check "get_profile" "$(rpc '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_profile","arguments":{}}}')" 'Пётр'
check "заметка тренера" "$(rpc '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"add_coach_note","arguments":{"text":"проверка"}}}')" '"isError":false'
