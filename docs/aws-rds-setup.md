# AWS RDS setup (TimeFlow / Alyson)

Target scale: **~50 employees**, screenshots in **S3**, auth in **Cognito**, database on **RDS PostgreSQL**.

## Recommended RDS settings (phase 1)

| Setting | Value |
|---------|--------|
| Engine | **PostgreSQL 16** (or 15) |
| Template | Dev/Test or Production |
| Instance | **db.t4g.small** (prod) or **db.t4g.micro** (dev only) |
| Storage | **gp3**, 30 GB, autoscaling optional (max 100 GB) |
| Multi-AZ | **No** (phase 1 — enable when downtime cost justifies ~2× DB cost) |
| Public access | **No** if API runs in same VPC; **Yes** only for dev with SG locked to your IP |
| VPC | Same region as Cognito/S3 (**us-west-2**) |
| DB name | `timeflow` |
| Master username | e.g. `timeflow_admin` |
| Encryption | On (default) |
| Backup retention | 7 days |
| Performance Insights | Off (save cost) or free tier only |

## Security group

Allow **inbound 5432** only from:

- Your API (App Runner / ECS / EC2 / Lambda via RDS Proxy later)
- Your IP for migrations (`psql`, `pg_dump` restore)
- **Not** `0.0.0.0/0` in production

## After the instance is available

1. Note the **endpoint**, **port**, **database name**, **username**, **password**.
2. Build `DATABASE_URL`:

   ```
   postgresql://timeflow_admin:PASSWORD@your-instance.xxxx.us-west-2.rds.amazonaws.com:5432/timeflow?sslmode=require
   ```

3. Put it in `backend/.env` (see `backend/.env.example`).

## Schema migration (live Supabase → RDS)

**Do not use stale `supabase/migrations/`** if you ran SQL in the Supabase SQL Editor. Dump the **live** database instead.

See **[supabase-to-rds-schema-migration.md](./supabase-to-rds-schema-migration.md)** for the full guide.

```bash
export SUPABASE_DATABASE_URL='...'   # Dashboard → Database → URI (port 5432)
export DATABASE_URL='...'            # RDS endpoint

./rds/scripts/migrate-supabase-to-rds.sh
```

## AWS-specific SQL

`rds/migrations/` adds:

- `users.cognito_sub` — link Cognito `sub` to existing user rows
- `screenshots.s3_key` — S3 object key (images not in Postgres)

## S3 bucket (screenshots)

| Setting | Value |
|---------|--------|
| Name | e.g. `timeflow-screenshots-prod` |
| Block public access | **On** |
| Encryption | SSE-S3 or SSE-KMS |
| Lifecycle | Transition to **Intelligent-Tiering** or **IA** after 90 days |

Object key pattern:

```
{organization_id}/{user_id}/{yyyy}/{mm}/{dd}/{screenshot_id}.jpg
```

## Cognito ↔ users

After first Cognito login, decode the IdToken `sub` and run:

```sql
UPDATE public.users
SET cognito_sub = '<cognito-sub>'
WHERE email = '<user@email>';
```

## Cost ballpark (50 users, us-west-2)

| Service | ~Monthly |
|---------|----------|
| RDS db.t4g.small + 30 GB | $25–35 |
| S3 ~30 GB + lifecycle | $1–5 |
| Cognito | ~$0 (MAU tier) |
| API (App Runner / small ECS) | $5–25 |

## Local development

```bash
cd backend && docker compose up -d postgres redis
cp .env.example .env   # set DATABASE_URL to local postgres URL
./rds/scripts/apply-migrations.sh
```

Default local URL (see `backend/docker-compose.yml`):

`postgresql://timeflow:timeflow@localhost:5432/timeflow`

## Next implementation steps in this repo

1. Cognito sign-in on web + `cognito_sub` on users
2. API routes for screenshot presigned upload + metadata insert using `s3_key`
3. Move web domain services from `supabase.from()` to API
4. Port edge functions to Lambda; retire Supabase
