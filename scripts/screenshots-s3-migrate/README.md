# Migrate historical screenshots to AWS S3

Uploads every row from `public.screenshots` (Supabase Storage bucket `screenshots`) into your S3 bucket with:

- **Path layout:** `s3://{bucket}/{prefix}/{year}/{month}/{day}/organization_{org|none}/user_{userId}/{screenshot_id}.{avif|webp}`
- **Compression:**
  - **Default (non–audit-critical):** AVIF lossy **quality 42** (within 40–45). If AVIF fails, **WebP lossy quality 78** (within 75–80).
  - **Audit-critical:** Both **WebP lossless** and **AVIF lossless** are produced; the **smaller** buffer is uploaded (per “WebP lossless or AVIF lossless”).

## Prerequisites

- Node.js 18+
- IAM user/role with `s3:PutObject` (and `s3:HeadObject` if using `--skip-existing`) on `arn:aws:s3:::alyson-pm/alyson-td-screenshots/*`
- Supabase **service role** key (reads all `screenshots` rows and downloads objects from Storage)

## Setup

```bash
cd scripts/screenshots-s3-migrate
cp .env.example .env
# Edit .env — never commit secrets
npm install
```

## Run

Dry run (no S3 writes, no DB changes):

```bash
npm run migrate:dry -- --limit 5
```

Full migration (batched, resumable):

```bash
npm run migrate -- --batch-size 200
```

Resume after an interruption (offset into stable `captured_at,id` ordering):

```bash
npm run migrate -- --start-offset 8000
```

Skip keys that already exist in S3:

```bash
npm run migrate -- --skip-existing
```

## Audit-critical (lossless) selection

Set `AUDIT_LOSSLESS_MODE` in `.env`:

| Mode | Behavior |
|------|----------|
| `never` | All rows use AVIF lossy → WebP lossy fallback (default). |
| `file` | UUIDs listed in `AUDIT_LOSSLESS_IDS_FILE` (one per line) use lossless compare. |
| `db_privacy` | Rows with non-empty `vision_privacy_concerns` use lossless. |
| `db_distraction` | Rows with `distraction_score >= AUDIT_DISTRACTION_MIN` (default 75) use lossless. |

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | yes | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Service role (bypasses RLS for read + storage) |
| `AWS_ACCESS_KEY_ID` | yes | IAM access key |
| `AWS_SECRET_ACCESS_KEY` | yes | IAM secret |
| `AWS_REGION` | yes | e.g. `us-east-1` |
| `S3_BUCKET` | yes | e.g. `alyson-pm` |
| `S3_PREFIX` | yes | e.g. `alyson-td-screenshots` (no leading/trailing slashes) |
| `SINCE` / `UNTIL` | no | ISO bounds on `captured_at` |
| `AUDIT_LOSSLESS_MODE` | no | See table above |
| `AUDIT_LOSSLESS_IDS_FILE` | if `file` | Path to UUID list |
| `AUDIT_DISTRACTION_MIN` | no | Default `75` for `db_distraction` |

## Example IAM policy (least privilege)

Scope to your prefix under `alyson-pm`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:HeadObject"],
      "Resource": "arn:aws:s3:::alyson-pm/alyson-td-screenshots/*"
    }
  ]
}
```

## Notes

- Original Supabase objects are **not** deleted; this is a copy/archive.
- Large libraries: first run `npm install` may compile `sharp` (requires build tools on some Linux images).
- For very large archives, run from a machine with stable network; lower `--batch-size` if Supabase or S3 returns rate-limit errors.
