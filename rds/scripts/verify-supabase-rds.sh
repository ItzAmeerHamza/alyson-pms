#!/usr/bin/env bash
# Compare public table row counts: Supabase (source) vs RDS (target).
set -euo pipefail

if [[ -z "${SUPABASE_DATABASE_URL:-}" ]] || [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: Set both SUPABASE_DATABASE_URL and DATABASE_URL" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

COUNT_SQL="
SELECT c.relname,
       COALESCE(s.n_live_tup, 0)::bigint
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;
"

psql "$SUPABASE_DATABASE_URL" -At -F'|' -c "$COUNT_SQL" > "$TMP/supabase.txt"
psql "$DATABASE_URL" -At -F'|' -c "$COUNT_SQL" > "$TMP/rds.txt"

echo "Table                          |  Supabase  |    RDS     | OK?"
echo "-------------------------------|------------|------------|----"

FAIL=0
while IFS='|' read -r table supa _; do
  rds=$(grep -E "^${table}\|" "$TMP/rds.txt" | cut -d'|' -f2 || echo "MISSING")
  if [[ "$rds" == "MISSING" ]]; then
    ok="NO (missing on RDS)"
    FAIL=1
  elif [[ "$supa" == "$rds" ]]; then
    ok="yes"
  else
    ok="NO"
    FAIL=1
  fi
  printf "%-30s | %10s | %10s | %s\n" "$table" "$supa" "$rds" "$ok"
done < "$TMP/supabase.txt"

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo "All tables match (approximate counts from pg_stat)."
  echo "Tip: psql \"\$DATABASE_URL\" -c 'ANALYZE;' then re-run if counts look stale."
else
  echo "MISMATCH — re-dump during a quiet window and re-run migrate-supabase-to-rds.sh"
  exit 1
fi
