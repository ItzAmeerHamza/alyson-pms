# Migrate historical screenshots to AWS S3

Copy every row from Supabase Storage (`screenshots` bucket) into S3 and optionally set `public.screenshots.s3_key` on RDS so the web portal loads images via the backend (presigned URLs).

## Recommended layout (keeps Supabase folder paths)

Supabase stores files as:

```text
{user_id}/{timestamp}.png
```

Use **preserve path** mode so S3 keys match that structure (plus your prefix):

```text
s3://{bucket}/{prefix}/{user_id}/{timestamp}.png
```

Example: `s3://timeflow-screenshots-dev/screenshots/abc-user-uuid/1712345678901.png`

RDS column `s3_key` stores the full object key, e.g. `screenshots/abc-user-uuid/1712345678901.png`.

## Alternative layout (better for date/org reporting)

Without `--preserve-path`, files are reorganized as:

```text
{prefix}/{year}/{month}/{day}/organization_{org}/user_{userId}/{screenshot_id}.avif
```

Use this if you want Athena/S3 analytics by date and organization, not the legacy Supabase paths.

## Prerequisites

- Node.js 18+
- IAM: `s3:PutObject`, `s3:HeadObject` on `arn:aws:s3:::YOUR_BUCKET/YOUR_PREFIX/*`
- Supabase **service role** key
- RDS credentials (when using `--update-rds`)

## Setup

```bash
cd scripts/screenshots-s3-migrate
cp .env.example .env
# Edit .env — never commit secrets
npm install
```

The script also loads **`scripts/.env`** and **`backend/.env`** automatically if local `.env` is missing.

## Run (preserve paths + update RDS)

Dry run (5 rows):

```bash
npm run migrate:dry -- --limit 5 --preserve-path --no-transcode --update-rds
```

Full migration:

```bash
npm run migrate -- --preserve-path --no-transcode --update-rds --batch-size 100 --skip-existing
```

Resume:

```bash
npm run migrate -- --preserve-path --no-transcode --update-rds --start-offset 5000 --skip-existing
```

## Flags

| Flag | Description |
|------|-------------|
| `--preserve-path` | S3 key = `{prefix}/{file_path}` (same folders as Supabase) |
| `--no-transcode` | Upload original bytes (png/jpg); no AVIF/WebP conversion |
| `--update-rds` | Set `screenshots.s3_key` after each upload |
| `--skip-existing` | Skip if object already exists in S3 |
| `--dry-run` | No S3 writes, no DB updates |
| `--batch-size N` | Rows per batch (default 150) |
| `--start-offset N` | Resume offset |

## Backend + web portal (after migration)

1. In `backend/.env`:

```env
AWS_REGION=us-west-2
AWS_S3_SCREENSHOTS_BUCKET=timeflow-screenshots-dev
AWS_S3_PRESIGN_TTL_SEC=3600
```

2. Restart backend. `GET /data/screenshots` returns presigned `image_url` when `s3_key` is set.

3. Web screenshots page already uses the backend API — images load from S3 automatically.

## S3 bucket settings

- **Block public access** ON (use presigned URLs only)
- **CORS** (if needed for direct browser PUT later): allow your web origin
- **Lifecycle** (optional): transition to Glacier after N days for cost

## Notes

- Original Supabase objects are **not** deleted.
- Rows without `file_path` fall back to `image_url` HTTP download.
- Large libraries: use `--skip-existing` and run in batches; lower `--batch-size` on rate limits.
