#!/usr/bin/env bash
# Extract GRANT / ALTER DEFAULT PRIVILEGES tail from Supabase schema dump.
set -euo pipefail
INPUT="${1:-schema.sql}"
OUT="${2:-rds/grants_tail.sql}"
grep -E '^(GRANT |ALTER DEFAULT PRIVILEGES|REVOKE )' "$INPUT" > "$OUT" || true
echo "Wrote $(wc -l < "$OUT" | tr -d ' ') lines to $OUT"
