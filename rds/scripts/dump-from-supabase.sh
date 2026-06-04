#!/usr/bin/env bash
# Dump LIVE public schema + data from Supabase (source of truth when migrations are stale).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT/rds/dumps}"
STAMP="$(date +%Y%m%d_%H%M%S)"

if [[ -z "${SUPABASE_DATABASE_URL:-}" ]]; then
  echo "ERROR: Set SUPABASE_DATABASE_URL (Supabase Dashboard → Database → URI, port 5432)" >&2
  exit 1
fi

for cmd in pg_dump psql; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: $cmd not found. Install: brew install libpq && brew link --force libpq" >&2
    exit 1
  fi
done

mkdir -p "$OUT_DIR"

SCHEMA_FILE="$OUT_DIR/public_schema_${STAMP}.sql"
SCHEMA_LATEST="$OUT_DIR/public_schema.sql"
DATA_FILE="$OUT_DIR/public_data_${STAMP}.dump"
DATA_LATEST="$OUT_DIR/public_data.dump"
MANIFEST="$OUT_DIR/manifest_${STAMP}.txt"
MANIFEST_LATEST="$OUT_DIR/manifest.txt"

echo "==> Dumping LIVE public SCHEMA from Supabase..."
pg_dump "$SUPABASE_DATABASE_URL" \
  --schema-only \
  --schema=public \
  --no-owner \
  --no-acl \
  --file="$SCHEMA_FILE"

cp "$SCHEMA_FILE" "$SCHEMA_LATEST"

echo "==> Dumping LIVE public DATA from Supabase..."
pg_dump "$SUPABASE_DATABASE_URL" \
  --format=custom \
  --data-only \
  --schema=public \
  --no-owner \
  --no-acl \
  --file="$DATA_FILE"

cp "$DATA_FILE" "$DATA_LATEST"

echo "==> Writing manifest (tables + row counts)..."
{
  echo "# Supabase public schema manifest — $STAMP"
  echo "# Connection host: $(echo "$SUPABASE_DATABASE_URL" | sed -E 's|.*@([^/:]+).*|\1|')"
  psql "$SUPABASE_DATABASE_URL" -v ON_ERROR_STOP=1 -At -c "
    SELECT c.relname || '|' || COALESCE(s.n_live_tup::text, '0')
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname;
  "
} > "$MANIFEST"

cp "$MANIFEST" "$MANIFEST_LATEST"

echo ""
echo "Done."
echo "  Schema: $SCHEMA_LATEST"
echo "  Data:   $DATA_LATEST"
echo "  Manifest: $MANIFEST_LATEST"
echo ""
echo "Next: ./rds/scripts/fix-schema-for-rds.sh"
