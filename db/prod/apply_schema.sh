#!/usr/bin/env bash
# Apply Time Doctor schema migrations to production (or any target DB) in plan order.
#
# Prerequisites:
#   - Palisade tenant.* already exists on the target database
#   - Role alyson_time_doctor_api exists (create if missing)
#   - You can reach the DB (DBeaver tunnel / bastion / VPN)
#
# Usage:
#   export DATABASE_URL='postgresql://USER:PASS@HOST:5432/revclouddb?sslmode=require'
#   # Or set PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
#   bash db/prod/apply_schema.sh
#
# Skip 001_pulse_additive.sql (legacy public.users TimeFlow shape — not used on Palisade).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG_DIR="$(cd "$SCRIPT_DIR/../migrations" && pwd)"

psql_cmd() {
  if [[ -n "${DATABASE_URL:-}" ]]; then
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 "$@"
  else
    : "${PGHOST:?Set DATABASE_URL or PGHOST/PGUSER/PGDATABASE}"
    : "${PGUSER:?Set PGUSER}"
    : "${PGDATABASE:?Set PGDATABASE}"
    psql -v ON_ERROR_STOP=1 "$@"
  fi
}

echo "==> Ensuring API role exists (no-op if already present)"
psql_cmd <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'alyson_time_doctor_api') THEN
    CREATE ROLE alyson_time_doctor_api LOGIN PASSWORD NULL;
    RAISE NOTICE 'Created role alyson_time_doctor_api — set password via ALTER ROLE before app use';
  END IF;
END $$;
SQL

run_file() {
  local f="$1"
  echo "==> $(basename "$f")"
  psql_cmd -f "$f"
}

# A. Schema (plan order)
run_file "$MIG_DIR/002_time_doctor_schema.sql"
run_file "$MIG_DIR/005_screenshot_interval_5min.sql"
run_file "$MIG_DIR/007_screenshot_ai_analysis.sql"
run_file "$MIG_DIR/008_access_grants.sql"
run_file "$MIG_DIR/010_project_delete_fk_actions.sql"
run_file "$MIG_DIR/011_low_hours_email_period.sql"
run_file "$MIG_DIR/026_screenshot_thumb_s3_key.sql"

# B. Grants (tenant write + refresh time_doctor privileges)
run_file "$SCRIPT_DIR/01_grants_api_role.sql"

echo ""
echo "==> Schema + grants applied."
echo "Next:"
echo "  1. Edit db/prod/02_bootstrap_workspace.sql (PROD_WORKSPACE_ID, admin email)"
echo "  2. psql ... -f db/prod/02_bootstrap_workspace.sql"
echo "  3. psql ... -f db/prod/03_verify.sql"
echo "  4. Point SAM prod stack at this DATABASE_HOST (see infra/sam/deploy.env.prod.example)"
