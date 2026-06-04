#!/usr/bin/env bash
# Adapt a live Supabase public schema dump for plain RDS (no auth.users, no Supabase roles).
set -euo pipefail

INPUT="${1:-$(cd "$(dirname "$0")/../.." && pwd)/rds/dumps/public_schema.sql}"
STRIP_RLS="${STRIP_RLS:-0}"

if [[ ! -f "$INPUT" ]]; then
  echo "ERROR: Schema file not found: $INPUT" >&2
  echo "Run ./rds/scripts/dump-from-supabase.sh first." >&2
  exit 1
fi

DIR="$(dirname "$INPUT")"
OUTPUT="${2:-$DIR/public_schema_rds.sql}"

echo "==> Fixing schema for RDS: $INPUT"

# Copy then edit in place on output file
cp "$INPUT" "$OUTPUT"

# macOS + Linux sed in-place
sed_in_place() {
  if sed --version 2>/dev/null | grep -q GNU; then
    sed -i "$@"
  else
    sed -i '' "$@"
  fi
}

# Remove FK references to Supabase Auth (Cognito replaces this)
sed_in_place -E 's/ REFERENCES auth\.users\([^)]*\)//g' "$OUTPUT"
sed_in_place -E 's/ REFERENCES auth\.users//g' "$OUTPUT"

# Remove triggers on auth.users (not present on RDS)
sed_in_place -E '/ON auth\.users/d' "$OUTPUT"

# Remove Supabase API role grants
sed_in_place -E '/GRANT .* (TO|ON ROLE) (anon|authenticated|service_role)/d' "$OUTPUT"
sed_in_place -E '/REVOKE .* (FROM|ON ROLE) (anon|authenticated|service_role)/d' "$OUTPUT"

# Optional: strip RLS (API enforces access on RDS)
if [[ "$STRIP_RLS" == "1" ]]; then
  echo "    (STRIP_RLS=1: removing RLS policies and ENABLE ROW LEVEL SECURITY)"
  sed_in_place -E '/^ALTER TABLE .* ENABLE ROW LEVEL SECURITY;/d' "$OUTPUT"
  sed_in_place -E '/^CREATE POLICY /d' "$OUTPUT"
  sed_in_place -E '/^ALTER POLICY /d' "$OUTPUT"
  sed_in_place -E '/^DROP POLICY /d' "$OUTPUT"
fi

# Header note
HEADER="# RDS-adapted schema — generated from Supabase live dump
# $(date -u +%Y-%m-%dT%H:%M:%SZ)
# Review before production restore. Re-run dump-from-supabase if Supabase schema changed.

"
if ! grep -q 'RDS-adapted schema' "$OUTPUT" 2>/dev/null; then
  echo "$HEADER" | cat - "$OUTPUT" > "${OUTPUT}.tmp" && mv "${OUTPUT}.tmp" "$OUTPUT"
fi

echo "==> Wrote: $OUTPUT"
echo ""
echo "Review checklist:"
echo "  - grep -n 'auth\\.' $OUTPUT   # should be empty or comments only"
echo "  - grep -n 'CREATE EXTENSION' $OUTPUT   # install matching extensions on RDS if needed"
echo ""
echo "Next: ./rds/scripts/restore-to-rds.sh"
