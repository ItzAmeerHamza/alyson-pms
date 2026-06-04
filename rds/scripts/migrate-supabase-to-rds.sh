#!/usr/bin/env bash
# Full pipeline: live Supabase dump → fix for RDS → restore → AWS columns → verify
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

if [[ -z "${SUPABASE_DATABASE_URL:-}" ]]; then
  echo "ERROR: Set SUPABASE_DATABASE_URL" >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: Set DATABASE_URL" >&2
  exit 1
fi

echo "=== Step 1/4: Dump live Supabase (public) ==="
"$ROOT/rds/scripts/dump-from-supabase.sh"

echo ""
echo "=== Step 2/4: Fix schema for RDS ==="
"$ROOT/rds/scripts/fix-schema-for-rds.sh" "$ROOT/rds/dumps/public_schema.sql"

echo ""
echo "=== Step 3/4: Restore to RDS ==="
export DATABASE_URL
SKIP_DATA="${SKIP_DATA:-0}" "$ROOT/rds/scripts/restore-to-rds.sh"

echo ""
echo "=== Step 4/4: Verify ==="
if [[ "${SKIP_VERIFY:-0}" != "1" ]] && [[ "${SKIP_DATA:-0}" != "1" ]]; then
  "$ROOT/rds/scripts/verify-supabase-rds.sh"
else
  echo "Skipped verify (SKIP_VERIFY=1 or SKIP_DATA=1)"
fi

echo ""
echo "Migration pipeline complete."
