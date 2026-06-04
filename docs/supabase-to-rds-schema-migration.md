# Move live schema from Supabase to RDS (when local migrations are stale)

If you changed the database in the **Supabase SQL Editor**, the **database itself** is the source of truth — not `supabase/migrations/` in git.

Use **`pg_dump` from the live Supabase instance** → fix Supabase-only bits → restore to RDS → verify.

---

## Golden rule

| Source | Use for migration? |
|--------|-------------------|
| Live Supabase Postgres (pg_dump) | **Yes** |
| `supabase/migrations/` in repo | **No** (stale / incomplete) |
| Supabase Dashboard table list | Reference only |

---

## Prerequisites

1. **PostgreSQL client tools** on your Mac: `psql`, `pg_dump`, `pg_restore`  
   ```bash
   brew install libpq && brew link --force libpq
   ```

2. **Supabase connection string (direct, not pooler)**  
   Dashboard → **Project Settings** → **Database** → **Connection string** → **URI**  
   Use the host on port **5432** (session mode). Transaction pooler (6543) can break `pg_dump`.

   Example shape:
   ```
   postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-us-west-2.pooler.supabase.com:5432/postgres
   ```
   If dump fails, try **Direct connection** host from the same page.

3. **RDS endpoint** ready (empty database `timeflow` created).

4. **Do not commit** connection strings or passwords.

---

## Recommended workflow (schema + data)

### Step 1 — Export live `public` schema + data from Supabase

```bash
cd /Users/revcloudmac/Desktop/alyson-time-doctor

export SUPABASE_DATABASE_URL='postgresql://...'

./rds/scripts/dump-from-supabase.sh
```

This writes under `rds/dumps/`:

- `public_schema.sql` — tables, indexes, functions, views, RLS policies (live)
- `public_data.dump` — all row data (custom format)
- `manifest.txt` — table list + row counts from source

### Step 2 — Make schema compatible with RDS

Supabase-specific objects in a raw dump break on plain RDS:

| Issue | Fix |
|-------|-----|
| `REFERENCES auth.users(...)` | Removed (Cognito replaces Supabase Auth) |
| Triggers on `auth.users` | Removed |
| `GRANT` to `anon`, `authenticated`, `service_role` | Removed |
| Policies using `auth.uid()` | Optional: keep (harmless until RLS enforced) or strip with `--strip-rls` |

```bash
./rds/scripts/fix-schema-for-rds.sh rds/dumps/public_schema.sql
# → rds/dumps/public_schema_rds.sql
```

### Step 3 — Restore into RDS

```bash
export DATABASE_URL='postgresql://timeflow_admin:...@....rds.amazonaws.com:5432/timeflow?sslmode=require'

./rds/scripts/restore-to-rds.sh
```

Order: **schema SQL** → **data pg_restore** → **AWS migrations** (`cognito_sub`, `s3_key`).

### Step 4 — Verify

```bash
./rds/scripts/verify-supabase-rds.sh
```

Compares table names and row counts (Supabase vs RDS). Fix any mismatches before cutting over apps.

---

## One-command path (schema + data)

```bash
export SUPABASE_DATABASE_URL='...'
export DATABASE_URL='...'

./rds/scripts/migrate-supabase-to-rds.sh
```

Runs dump → fix → restore → AWS migrations → verify.

---

## What about local `supabase/migrations/`?

After a successful live dump migration:

1. **Optional:** Regenerate a baseline migration from RDS so git matches production:
   ```bash
   pg_dump "$DATABASE_URL" --schema-only --schema=public --no-owner --no-acl \
     > supabase/migrations/20990101000000_rds_baseline_from_live.sql
   ```
   (Use a far-future timestamp so it never runs on old Supabase.)

2. **Do not** run the full old migration chain on RDS — you already restored the live shape.

3. **New changes** go in `rds/migrations/` (AWS) going forward.

---

## Auth / RLS after move

- **Cognito** handles login; `users.cognito_sub` links identities (`rds/migrations/001_aws_cognito_s3.sql`).
- **RLS** policies that call `auth.uid()` do nothing useful on RDS unless you emulate Supabase JWT. Phase 1: enforce access in the **API**; you can `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` later per table if needed.
- **`handle_new_user` trigger** on `auth.users` will not exist on RDS — create users via Cognito + API insert into `public.users`.

---

## Troubleshooting

| Error | Cause | Fix |
|-------|--------|-----|
| `relation "auth.users" does not exist` | Schema still references Supabase Auth | Re-run `fix-schema-for-rds.sh` |
| `permission denied for schema auth` | Dump included auth schema | Export **public** only (scripts default) |
| `pg_dump: error: query failed` on pooler | Wrong pool mode | Use direct/session connection :5432 |
| Restore hangs on FK | Order of data load | Use `restore-to-rds.sh` (disables triggers during data load) |
| Missing tables vs Supabase | Partial restore | Re-run full migrate; compare `verify-supabase-rds.sh` |
| Extension `http` / `pg_net` missing | Supabase-only extensions | Omit from dump or `CREATE EXTENSION` on RDS only if you need them |

---

## Minimal schema-only test (no data yet)

```bash
export SUPABASE_DATABASE_URL='...'
export DATABASE_URL='...'
SKIP_DATA=1 ./rds/scripts/migrate-supabase-to-rds.sh
```

Useful while RDS is still provisioning — confirms schema loads before copying rows.

---

## After RDS has data

1. Link Cognito: `UPDATE users SET cognito_sub = '...' WHERE email = '...';`
2. Set `DATABASE_URL` in `backend/.env`
3. `curl http://localhost:3000/health` → `"backend": "rds"`
4. Point screenshot uploads at S3 + `s3_key` column
