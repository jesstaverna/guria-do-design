#!/usr/bin/env bash
# Valida migrações + regras de negócio/RLS em um PostgreSQL local descartável (sem Supabase).
# Uso: supabase/tests/run_local.sh   (requer PostgreSQL 15+ instalado e permissão para iniciar o cluster)
set -euo pipefail
cd "$(dirname "$0")/.."
psql() { if [ -z "${CI_PG:-}" ] && [ "$(id -u)" = 0 ]; then runuser -u postgres -- env PGDATABASE="${PGDATABASE:-postgres}" psql "$@"; else command psql "$@"; fi; }
if [ -z "${CI_PG:-}" ]; then (pg_lsclusters | grep -q online) || pg_ctlcluster 16 main start; sleep 2; fi
psql -qAt -c "drop database if exists guria_test with (force)" -c "create database guria_test" postgres >/dev/null
export PGDATABASE=guria_test
psql -q -o /dev/null -v ON_ERROR_STOP=1 < tests/local_stub.sql
for f in migrations/*.sql; do echo ">> $f"; psql -q -o /dev/null -v ON_ERROR_STOP=1 -c "set client_min_messages = warning" -f - < "$f"; done
psql -q -o /dev/null -v ON_ERROR_STOP=1 < tests/rules.test.sql
psql -q -o /dev/null -v ON_ERROR_STOP=1 < tests/content.test.sql
psql -q -o /dev/null -v ON_ERROR_STOP=1 < tests/prospecting.test.sql
echo "OK — todos os testes SQL passaram"
