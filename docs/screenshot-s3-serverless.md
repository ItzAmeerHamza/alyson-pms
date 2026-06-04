# Screenshots: desktop agent → S3 → web portal (serverless-friendly)

## Principle

The **desktop agent never needs AWS credentials**. It talks only to your **API** (NestJS today; API Gateway + Lambda later). S3 stays **private**; URLs are **presigned** and short-lived.

| Step | Who | What |
|------|-----|------|
| 1 | Agent | `POST /sync/desktop-action` → `screenshot_upload_init` |
| 2 | API | Returns `{ id, s3_key, upload_url }` (presigned **PUT**, ~5 min) |
| 3 | Agent | `PUT` JPEG bytes to `upload_url` (direct to S3) |
| 4 | Agent | `screenshot_upload_complete` with metadata + `s3_key` |
| 5 | API | `INSERT` into RDS `screenshots` with `s3_key` |
| 6 | Web | `GET /data/screenshots` (Cognito JWT) |
| 7 | API | Presigned **GET** per row → `image_url` in JSON |
| 8 | Browser | `<img src={image_url}>` |

No large binaries through Lambda/API body — ideal for serverless and cheap at scale.

## S3 key layout (same as migration)

```
alyson-td-screenshots/{YYYY}/{MM}/{DD}/organization_{org_id}/user_{user_id}/{screenshot_id}.jpg
```

Bucket: `alyson-pm` (env: `AWS_S3_SCREENSHOTS_BUCKET`).

## Desktop agent config

```json
{
  "backend_api_url": "https://api.yourdomain.com/sync/desktop-action",
  "backend_api_key": "<INTERNAL_API_KEY>"
}
```

Or env: `BACKEND_API_URL`, `INTERNAL_API_KEY`.

When both are set, `screenshot-storage.js` uses S3 presigned upload. Otherwise it falls back to Supabase Storage (legacy).

## Web portal

No S3 SDK in the browser. The screenshots page already calls `GET /data/screenshots`; the backend fills `image_url` from `s3_key` via presigned GET.

Requires backend env: `AWS_REGION`, `AWS_S3_SCREENSHOTS_BUCKET`, credentials or IAM role.

## Serverless target architecture

```
┌─────────────┐     Cognito JWT      ┌──────────────────┐     RDS Proxy    ┌─────┐
│  Web (SPA)  │ ───────────────────► │ API Gateway      │ ───────────────► │ RDS │
└─────────────┘                      │ + Lambda         │                  └─────┘
                                     │  /data/*         │
┌─────────────┐     API key          │  /sync/*         │     presign      ┌─────┐
│ Desktop     │ ───────────────────► └────────┬─────────┘ ◄──────────────► │ S3  │
│ agent       │     PUT image (presigned)     │                            └─────┘
└─────────────┘ ──────────────────────────────┘
```

- **Lambda handlers** can reuse the same logic as NestJS (`screenshot_upload_init`, `listScreenshots` + presign GET).
- Use **RDS Proxy** for Lambda → Postgres connection pooling.
- Optional later: **CloudFront** + OAI for reads instead of presigned GET (custom domain, caching).
- **Workers** (AI analysis): S3 GetObject with IAM role, or SQS trigger on `s3:ObjectCreated`.

## IAM (minimal)

**API role**

- `s3:PutObject`, `s3:GetObject` on `arn:aws:s3:::alyson-pm/alyson-td-screenshots/*`

**Agent**

- No S3 permissions (only HTTPS to API + presigned PUT URL).

## Env reference

| Variable | Purpose |
|----------|---------|
| `AWS_S3_SCREENSHOTS_BUCKET` | `alyson-pm` |
| `AWS_S3_SCREENSHOTS_PREFIX` | `alyson-td-screenshots` |
| `AWS_S3_PRESIGN_TTL_SEC` | GET URL lifetime for web (default 3600) |
| `AWS_S3_PRESIGN_PUT_TTL_SEC` | PUT URL lifetime for agent (default 300) |
| `INTERNAL_API_KEY` | Desktop → `/sync/*` |
