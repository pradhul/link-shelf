#!/usr/bin/env bash
# Per-boot startup: bring up Postgres and confirm the schema exists.
# The long-running services (Neon proxy + Next.js dev server) are launched as
# named terminals; this script only reconciles daemon state and then returns.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB_NAME="linkshelf"
DB_USER="shelf"
DB_PASS="shelf"

echo "==> Ensure Postgres is running"
if ! pg_lsclusters -h | awk '{print $4}' | grep -q online; then
  sudo pg_ctlcluster "$(pg_lsclusters -h | awk 'NR==1{print $1}')" main start 2>/dev/null || \
    sudo service postgresql start 2>/dev/null || true
fi

echo "==> Wait for Postgres to accept connections"
export PGPASSWORD="$DB_PASS"
DB_URL="postgres://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}"
for i in $(seq 1 30); do
  if psql "$DB_URL" -tAc "select 1" >/dev/null 2>&1; then break; fi
  sleep 1
done

echo "==> Ensure schema exists (safety net after cold starts)"
if [ "$(psql "$DB_URL" -tAc "SELECT to_regclass('public.saves') IS NOT NULL" 2>/dev/null)" != "t" ]; then
  psql -v ON_ERROR_STOP=1 "$DB_URL" -f "$REPO_ROOT/drizzle/0000_init.sql" || true
  for f in 0001_tag_sort_order 0002_daily_recommendations 0003_movie_watched; do
    psql -v ON_ERROR_STOP=1 "$DB_URL" -f "$REPO_ROOT/drizzle/${f}.sql" || true
  done
fi

echo "==> Startup reconciliation complete"
