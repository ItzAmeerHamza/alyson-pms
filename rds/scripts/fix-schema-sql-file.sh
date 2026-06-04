#!/usr/bin/env bash
# Fix Supabase schema.sql for plain RDS (no Supabase Auth service).
# Usage: ./rds/scripts/fix-schema-sql-file.sh schema.sql schema_rds.sql
set -euo pipefail

INPUT="${1:-schema.sql}"
OUTPUT="${2:-schema_rds.sql}"

if [[ ! -f "$INPUT" ]]; then
  echo "ERROR: $INPUT not found" >&2
  exit 1
fi

cp "$INPUT" "$OUTPUT"

sed_inplace() {
  if sed --version 2>/dev/null | grep -q GNU; then
    sed -i -E "$@"
  else
    sed -i '' -E "$@"
  fi
}

# Function default params: DEFAULT auth.uid() → no default
sed_inplace 's/DEFAULT "auth"\."uid"\(\)//g' "$OUTPUT"

# FK to Supabase auth.users
sed_inplace 's/ REFERENCES "auth"\."users"\("id"\)( ON DELETE CASCADE)?//g' "$OUTPUT"
sed_inplace 's/ REFERENCES "auth"\."users"\("id"\)//g' "$OUTPUT"

# Triggers on auth.users (not on RDS)
grep -v 'ON "auth"\."users"' "$OUTPUT" > "${OUTPUT}.tmp" && mv "${OUTPUT}.tmp" "$OUTPUT"

HEADER=$(cat <<'EOSQL'
--
-- RDS preamble (auto-generated) — stub auth + roles Supabase expects
--
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULL::uuid $$;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$roles$;

EOSQL
)

# Prepend header (macOS-compatible)
{ echo "$HEADER"; cat "$OUTPUT"; } > "${OUTPUT}.tmp" && mv "${OUTPUT}.tmp" "$OUTPUT"

echo "Wrote $OUTPUT"
echo "Load with: psql -h RDS_HOST -U postgres -d postgres -v ON_ERROR_STOP=1 -f $OUTPUT"
