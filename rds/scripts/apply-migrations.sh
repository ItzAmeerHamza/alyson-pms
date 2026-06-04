#!/usr/bin/env bash
# Apply rds/migrations/*.sql in order. Requires DATABASE_URL and psql.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATIONS_DIR="$ROOT/rds/migrations"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: Set DATABASE_URL (postgresql://...)" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql not found. Install PostgreSQL client tools." >&2
  exit 1
fi

shopt -s nullglob
files=("$MIGRATIONS_DIR"/*.sql)
shopt -u nullglob

if [[ ${#files[@]} -eq 0 ]]; then
  echo "No migrations in $MIGRATIONS_DIR"
  exit 0
fi

IFS=$'\n' sorted=($(sort <<<"${files[*]}"))
unset IFS

for f in "${sorted[@]}"; do
  echo "Applying $(basename "$f")..."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done

echo "Done. Applied ${#sorted[@]} migration(s)."
