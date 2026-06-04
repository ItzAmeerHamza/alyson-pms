#!/usr/bin/env bash
# Restore fixed schema + data dump into RDS, then apply AWS migrations.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DUMPS="${DUMPS:-$ROOT/rds/dumps}"

SCHEMA_FILE="${SCHEMA_FILE:-$DUMPS/public_schema_rds.sql}"
DATA_FILE="${DATA_FILE:-$DUMPS/public_data.dump}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: Set DATABASE_URL (RDS connection string)" >&2
  exit 1
fi

if [[ ! -f "$SCHEMA_FILE" ]]; then
  echo "ERROR: Missing $SCHEMA_FILE — run fix-schema-for-rds.sh first" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql not found" >&2
  exit 1
fi

echo "==> Applying schema to RDS..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SCHEMA_FILE"

if [[ "${SKIP_DATA:-0}" != "1" ]]; then
  if [[ ! -f "$DATA_FILE" ]]; then
    echo "ERROR: Missing $DATA_FILE — run dump-from-supabase.sh or set SKIP_DATA=1" >&2
    exit 1
  fi
  if ! command -v pg_restore >/dev/null 2>&1; then
    echo "ERROR: pg_restore not found" >&2
    exit 1
  fi
  echo "==> Restoring data (public schema)..."
  pg_restore \
    --dbname="$DATABASE_URL" \
    --data-only \
    --schema=public \
    --no-owner \
    --no-acl \
    --disable-triggers \
    --jobs=4 \
    "$DATA_FILE"
else
  echo "==> SKIP_DATA=1 — schema only"
fi

echo "==> Applying AWS migrations (cognito_sub, s3_key)..."
export DATABASE_URL
"$ROOT/rds/scripts/apply-migrations.sh"

echo "==> Done. Run ./rds/scripts/verify-supabase-rds.sh if SUPABASE_DATABASE_URL is set."
