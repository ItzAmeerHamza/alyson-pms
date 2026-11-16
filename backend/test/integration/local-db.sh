#!/usr/bin/env bash
# Throwaway local Postgres with the production schema shape (Palisade tenant.*
# + time_doctor.*) for the *.int.spec.ts tests. Never points at a real database.
#
#   bash backend/test/integration/local-db.sh start   # create + migrate
#   bash backend/test/integration/local-db.sh stop    # stop and delete
#
# Then:
#   cd backend && INTEGRATION_DATABASE_URL=postgresql://postgres@localhost:55432/revclouddb \
#     npx vitest run test/integration
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PALISADE_BE_DIR="${PALISADE_BE_DIR:-$REPO_ROOT/../palisade-be}"
PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@14/bin}"
PORT="${INTEGRATION_PG_PORT:-55432}"
WORK="${INTEGRATION_PG_DIR:-$REPO_ROOT/.tmp-pgtest}"
MIG="$REPO_ROOT/db/migrations"

psql_db() {
  "$PGBIN/psql" -h localhost -p "$PORT" -U postgres -d revclouddb -q -v ON_ERROR_STOP=1 "$@"
}

stop() {
  if [[ -d "$WORK/data" ]]; then
    "$PGBIN/pg_ctl" -D "$WORK/data" -m fast stop >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK"
  echo "==> stopped and removed $WORK"
}

start() {
  stop >/dev/null
  mkdir -p "$WORK"
  "$PGBIN/initdb" -D "$WORK/data" -U postgres -A trust --no-locale -E UTF8 >/dev/null
  "$PGBIN/pg_ctl" -D "$WORK/data" -l "$WORK/pg.log" \
    -o "-p $PORT -k $WORK -c listen_addresses=localhost" start >/dev/null
  for _ in $(seq 1 30); do
    "$PGBIN/pg_isready" -h localhost -p "$PORT" >/dev/null 2>&1 && break
    sleep 0.5
  done
  "$PGBIN/psql" -h localhost -p "$PORT" -U postgres -q -c "CREATE DATABASE revclouddb"
  psql_db -c "CREATE ROLE alyson_time_doctor_api LOGIN"

  # Palisade's 0000 migration is a commented-out introspection, so tenant.*
  # only exists as Drizzle schema. Export its DDL instead of replaying history.
  echo "==> tenant.* DDL from $PALISADE_BE_DIR/db/schema"
  cat >"$WORK/drizzle.tenant.config.ts" <<EOF
export default {
  dialect: 'postgresql',
  schema: ['$PALISADE_BE_DIR/db/schema/tenant.ts', '$PALISADE_BE_DIR/db/schema/marketplace.ts'],
  schemaFilter: ['tenant', 'marketplace'],
};
EOF
  (cd "$PALISADE_BE_DIR" && npx --no-install drizzle-kit export --config "$WORK/drizzle.tenant.config.ts") \
    >"$WORK/tenant.sql" 2>>"$WORK/migrate.log"
  psql_db -1 -f "$WORK/tenant.sql" >>"$WORK/migrate.log" 2>&1 \
    || { echo "tenant DDL failed — see $WORK/migrate.log"; tail -n 5 "$WORK/migrate.log"; exit 1; }

  echo "==> time_doctor migrations"
  for f in \
    002_time_doctor_schema.sql 005_screenshot_interval_5min.sql 007_screenshot_ai_analysis.sql \
    008_access_grants.sql 009_grant_tenant_user_write.sql 010_project_delete_fk_actions.sql \
    011_low_hours_email_period.sql 013_widen_low_hours_email_log_hours.sql \
    014_time_log_events.sql 014_time_log_events_grants.sql \
    015_session_heartbeats.sql 015_session_heartbeats_grants.sql \
    016_time_adjustments.sql 016_time_adjustments_grants.sql \
    017_workspace_timezone.sql 018_leave.sql 019_employee_started_on.sql \
    020_leave_inbox_hr_statuses.sql 022_time_logs_last_alive_at.sql 023_drop_liveness_ceiling.sql \
    024_time_logs_agent_version.sql 025_idle_logs_lookup_index.sql 026_screenshot_thumb_s3_key.sql \
    027_grant_tenant_workspace_write.sql 028_screenshot_interval_5min_for_random_windows.sql \
    029_employee_country.sql 030_team_leave_holiday.sql 031_signed_in_at.sql \
    032_pulse_super_admin.sql 033_idle_logs_idempotent.sql 034_time_log_id_lookup_indexes.sql \
    035_issue_reports.sql 036_screenshot_activity_unknown.sql; do
    psql_db -f "$MIG/$f" >>"$WORK/migrate.log" 2>&1 || { echo "FAILED $f — see $WORK/migrate.log"; tail -n 5 "$WORK/migrate.log"; exit 1; }
  done
  psql_db -f "$REPO_ROOT/db/prod/01_grants_api_role.sql" >>"$WORK/migrate.log" 2>&1

  echo "==> ready: postgresql://postgres@localhost:$PORT/revclouddb"
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  *) echo "usage: $0 start|stop"; exit 2 ;;
esac
