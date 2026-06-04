# RDS migrations (AWS Postgres)

## Stale local migrations? Use live dump

If you edited schema in the **Supabase SQL Editor**, do **not** replay `supabase/migrations/` on RDS.

**Source of truth:** live Supabase database via `pg_dump`.

Full guide: [`docs/supabase-to-rds-schema-migration.md`](../docs/supabase-to-rds-schema-migration.md)

```bash
export SUPABASE_DATABASE_URL='postgresql://...'   # port 5432, from Dashboard
export DATABASE_URL='postgresql://...'            # RDS

./rds/scripts/migrate-supabase-to-rds.sh
```

While RDS is still creating (schema-only test):

```bash
SKIP_DATA=1 ./rds/scripts/migrate-supabase-to-rds.sh
```

## Scripts

| Script | Purpose |
|--------|---------|
| `dump-from-supabase.sh` | Live `public` schema + data + manifest |
| `fix-schema-for-rds.sh` | Remove `auth.users` FKs, Supabase grants |
| `restore-to-rds.sh` | Load schema + data + `rds/migrations/` |
| `verify-supabase-rds.sh` | Compare row counts |
| `migrate-supabase-to-rds.sh` | Runs all of the above |
| `apply-migrations.sh` | AWS-only SQL (`cognito_sub`, `s3_key`) |

Dumps go to `rds/dumps/` (gitignored via `*.dump` / `*.sql` patterns — do not commit secrets).

## `rds/migrations/`

Additive SQL **after** restore:

| File | Purpose |
|------|---------|
| `001_aws_cognito_s3.sql` | `users.cognito_sub`, `screenshots.s3_key` |
