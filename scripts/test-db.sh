#!/usr/bin/env bash
# Применяет миграции к временному кластеру Postgres и проверяет изоляцию данных.
# Нужен локальный postgres 16. Запуск: npm run test:db
set -euo pipefail

PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PGDATA=${PGDATA:-/tmp/coach-pgdata}
SOCK=${SOCK:-/tmp/coach-pgrun}
PORT=${PORT:-5433}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

export PATH="$PGBIN:$PATH"

cleanup() {
  su postgres -c "PATH=$PGBIN:\$PATH pg_ctl -D $PGDATA stop -m immediate" >/dev/null 2>&1 || true
}
trap cleanup EXIT

rm -rf "$PGDATA" "$SOCK"
mkdir -p "$PGDATA" "$SOCK"
chown -R postgres:postgres "$PGDATA" "$SOCK"

su postgres -c "PATH=$PGBIN:\$PATH initdb -D $PGDATA -A trust -U postgres" >/dev/null
su postgres -c "PATH=$PGBIN:\$PATH pg_ctl -D $PGDATA -o '-k $SOCK -p $PORT -c listen_addresses=' -l /tmp/coach-pg.log start" >/dev/null
sleep 1

PSQL="psql -h $SOCK -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
su postgres -c "$PSQL -c 'create database coach_test'" >/dev/null

echo "→ применяю миграции"
su postgres -c "$PSQL -d coach_test -f $ROOT/supabase/test/00_auth_stub.sql $(for f in "$ROOT"/supabase/migrations/*.sql; do printf -- '-f %s ' "$f"; done)" >/dev/null
echo "→ проверяю изоляцию данных и мягкое удаление"
su postgres -c "$PSQL -d coach_test -f $ROOT/supabase/test/01_rls.sql" | grep -E 'OK:|ПРОВАЛ'

echo "→ MCP-сервер на настоящей базе: транспорт, инструменты, изоляция пользователей"
PGHOST="$SOCK" PGPORT="$PORT" PGDATABASE=coach_test npx vitest run --config "$ROOT/vitest.db.config.ts" 2>&1 | grep -E "✓|×|Test Files|Tests |FAIL|Error" | grep -vE "^\s*✓" || true
