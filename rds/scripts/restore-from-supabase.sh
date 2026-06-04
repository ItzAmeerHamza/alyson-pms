#!/usr/bin/env bash
# Legacy one-shot restore (custom format, schema+data combined).
# Prefer: ./rds/scripts/migrate-supabase-to-rds.sh (schema fix + verify).
#
# Usage:
#   export SUPABASE_DATABASE_URL='postgresql://postgres.[ref]:[password]@...pooler.supabase.com:5432/postgres'
#   export DATABASE_URL='postgresql://timeflow_admin:...@....rds.amazonaws.com:5432/timeflow?sslmode=require'
#   ./rds/scripts/restore-from-supabase.sh
set -euo pipefail

if [[ -z "${SUPABASE_DATABASE_URL:-}" ]]; then
  echo "ERROR: Set SUPABASE_DATABASE_URL (Supabase → Database → URI)" >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: Set DATABASE_URL (RDS connection string)" >&2
  exit 1
fi

DUMP_FILE="${DUMP_FILE:-./timeflow_supabase.dump}"

echo "Exporting public schema from Supabase → $DUMP_FILE"
pg_dump "$SUPABASE_DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --schema=public \
  --file="$DUMP_FILE"

echo "Restoring into RDS..."
pg_restore \
  --dbname="$DATABASE_URL" \
  --no-owner \
  --no-acl \
  --jobs=4 \
  "$DUMP_FILE"

echo "Restore complete. Run ./rds/scripts/apply-migrations.sh for AWS columns."
