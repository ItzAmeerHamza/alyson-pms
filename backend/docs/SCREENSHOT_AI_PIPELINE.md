# Screenshot AI Analysis Pipeline

DeepSeek vision analysis for employee screenshots — real-time on upload and backfill for historical rows in `time_doctor.screenshots`.

## Goals

1. **New screenshots** — enqueue analysis automatically after `screenshot_upload_complete`.
2. **Historical screenshots** — backfill all existing rows that have a valid S3 object.
3. **Non-blocking** — API Lambda stays fast; vision runs in a dedicated worker.
4. **Retry-safe** — failed jobs retry with backoff; permanent failures marked `failed` or `skipped`.

## Architecture

```
┌─────────────────┐     upload complete      ┌──────────────────┐
│  Desktop Agent  │ ───────────────────────► │   API Lambda     │
└─────────────────┘                          │  (NestJS 29s)    │
                                             └────────┬─────────┘
                                                      │ INSERT screenshot (status=pending)
                                                      │ SQS SendMessage
                                                      ▼
                                             ┌──────────────────┐
                                             │  SQS Queue       │
                                             │  screenshot-ai   │
                                             └────────┬─────────┘
                                                      │
          ┌───────────────────────────────────────────┼───────────────────────────┐
          │                                           │                           │
          ▼                                           ▼                           ▼
┌──────────────────┐                       ┌──────────────────┐        ┌──────────────────┐
│ Backfill Lambda  │  every 5 min          │  AI Worker       │        │  Admin API       │
│ (EventBridge)    │  claim pending rows   │  Lambda          │        │  POST /backfill  │
│  → enqueue batch │  ───────────────────► │  SQS trigger     │        │  GET /status     │
└──────────────────┘                       └────────┬─────────┘        └──────────────────┘
                                                    │
                    ┌───────────────────────────────┼───────────────────────────────┐
                    │                               │                               │
                    ▼                               ▼                               ▼
             ┌────────────┐                  ┌─────────────┐                 ┌─────────────┐
             │ S3 bucket  │                  │ DeepSeek    │                 │ RDS         │
             │ (JPEG)     │                  │ Vision API  │                 │ screenshots │
             └────────────┘                  └─────────────┘                 └─────────────┘
```

## Status lifecycle

| Status | Meaning |
|--------|---------|
| `pending` | Waiting to be enqueued (new upload or retry) |
| `queued` | Message sent to SQS |
| `processing` | Worker claimed the job |
| `completed` | DeepSeek result stored |
| `failed` | Error after max retries |
| `skipped` | No analyzable image (`s3_key` missing/invalid) |

Flow: `pending` → `queued` → `processing` → `completed` | `failed` | `skipped`

On failure with `ai_retry_count < 3`: reset to `pending` for backfill cron to re-enqueue.

## Database

Migration: `db/migrations/007_screenshot_ai_analysis.sql`

Columns added to `time_doctor.screenshots`:

| Column | Type | Purpose |
|--------|------|---------|
| `ai_analysis_status` | TEXT | Lifecycle status (see above) |
| `ai_queued_at` | TIMESTAMPTZ | Last enqueue time |
| `ai_analyzed_at` | TIMESTAMPTZ | Completion time |
| `ai_retry_count` | INTEGER | Retry attempts |
| `ai_error_message` | TEXT | Last error (server-side only in logs for clients) |
| `ai_model_used` | TEXT | e.g. `deepseek-chat` |
| `activity_type` | TEXT | `development`, `communication`, `social`, … |
| `category` | TEXT | `productive`, `neutral`, `distraction` |
| `is_work_related` | BOOLEAN | |
| `confidence_score` | INTEGER | 0–100 |
| `distraction_score` | INTEGER | 0–100 |
| `vision_analysis` | JSONB | Full DeepSeek response |
| `vision_summary` | TEXT | Short human-readable summary |

Index: `(ai_analysis_status, captured_at)` for backfill polling.

**Backfill on migrate:** all existing rows with valid `s3_key` → `pending`; others → `skipped`.

## SQS message format

```json
{
  "screenshotId": "uuid",
  "s3Key": "alyson-td-screenshots/2026/07/09/...",
  "userId": 42,
  "workspaceId": 510,
  "appName": "Cursor",
  "windowTitle": "index.ts — project",
  "capturedAt": "2026-07-09T12:00:00.000Z",
  "source": "upload | backfill | manual"
}
```

## Worker algorithm (per message)

1. `UPDATE … SET ai_analysis_status = 'processing' WHERE id = $1 AND ai_analysis_status IN ('queued', 'processing')`
2. Download JPEG from S3 (`GetObject`) — max 4 MB; reject larger.
3. OCR with **Tesseract.js** in the worker (`SCREENSHOT_OCR_PROVIDER=tesseract`). System `tesseract` is used when present.
4. Call DeepSeek text API with OCR + app/window metadata (images are not sent to DeepSeek).
5. Validate response schema; map to columns.
6. `UPDATE … SET ai_analysis_status = 'completed', vision_analysis = $json, …`
7. On error: increment `ai_retry_count`; if `< 3` set `pending`, else `failed`.

## DeepSeek integration

**Env vars (Secrets Manager in prod):**

| Variable | Example |
|----------|---------|
| `DEEPSEEK_API_KEY` | `sk-…` |
| `DEEPSEEK_API_BASE_URL` | `https://api.deepseek.com` |
| `DEEPSEEK_VISION_MODEL` | Model with image input support |
| `SCREENSHOT_AI_ENABLED` | `true` / `false` kill switch |
| `SCREENSHOT_OCR_PROVIDER` | `tesseract` (default) / `none` |

**Request:** OpenAI-compatible chat completions with `image_url` data URL (base64 JPEG).

**Expected JSON output:**

```json
{
  "activity_type": "development",
  "category": "productive",
  "is_work_related": true,
  "confidence_score": 85,
  "distraction_score": 10,
  "summary": "Editing TypeScript in Cursor IDE"
}
```

**Activity types** (aligned with legacy `public.screenshots`):  
`development`, `communication`, `email`, `document`, `design`, `research`, `social`, `gaming`, `shopping`, `media`, `advertising`, `networking`, `music`, `general`.

## AWS resources (SAM)

Add to `infra/sam/template.yaml`:

| Resource | Purpose |
|----------|---------|
| `ScreenshotAiQueue` | SQS standard queue |
| `ScreenshotAiDLQ` | Dead letter after 3 receives |
| `ScreenshotAiWorkerFunction` | Lambda, 1024MB, 300s timeout, SQS event source |
| `ScreenshotAiBackfillFunction` | Lambda, EventBridge `rate(5 minutes)` |
| `ScreenshotAiApiPolicy` | API Lambda: `sqs:SendMessage` |
| Secrets | `DEEPSEEK_API_KEY` via SSM/Secrets Manager |

Worker shares the same ECR image with a different handler: `dist/lambda/screenshot-ai-worker.handler`.

API Lambda env: `SCREENSHOT_AI_QUEUE_URL`, `SCREENSHOT_AI_ENABLED=true`.

## Backend module layout

```
backend/src/screenshot-ai/
  screenshot-ai.types.ts          # DTOs, enums, DeepSeek response schema
  screenshot-ai.repository.ts     # SQL: claim, update, backfill batch
  screenshot-ai-queue.service.ts  # SQS enqueue
  deepseek-vision.service.ts      # HTTP client + prompt
  screenshot-ai-analyzer.service.ts  # S3 download + analyze + persist
  screenshot-ai-backfill.service.ts  # Claim pending rows, enqueue
  screenshot-ai.controller.ts     # Admin endpoints
  screenshot-ai.module.ts
backend/src/lambda/
  screenshot-ai-worker.handler.ts # SQS Lambda entry
  screenshot-ai-backfill.handler.ts # Cron Lambda entry
```

## API endpoints (admin only)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/pulse/ai-analysis/status` | Counts by status, queue depth estimate |
| `POST` | `/pulse/ai-analysis/backfill` | Enqueue up to `limit` pending screenshots |
| `POST` | `/pulse/ai-analysis/retry-failed` | Reset `failed` → `pending` (optional filters) |

### POST `/pulse/ai-analysis/backfill`

```json
{
  "limit": 500,
  "userId": "optional",
  "startDate": "2026-01-01",
  "endDate": "2026-06-30",
  "newestFirst": false
}
```

Default order: **oldest first** (`captured_at ASC`) so historical backlog drains chronologically.

## Historical / legacy data

### `time_doctor.screenshots` (current)

- Migration sets all rows with valid `s3_key` to `pending`.
- Backfill cron + optional manual POST processes them at ~100–500 per 5 min (tunable).
- At 10k screenshots, ~200 min at 500/5min — scale worker concurrency or batch size as needed.

### `public.screenshots` (legacy Supabase, optional Phase 2)

Some rows may already have `vision_analysis` from the old DeepSeek pipeline. Options:

1. **Copy-forward migration** — one-time SQL to copy AI fields where `time_doctor.screenshots.id` matches legacy UUID.
2. **Re-analyze** — if images moved to S3, treat as normal backfill.
3. **Skip** — if only Supabase public URLs remain and objects were deleted, mark `skipped`.

## Cost controls

1. `SCREENSHOT_AI_ENABLED` kill switch.
2. Max image size 4 MB before API call.
3. Backfill rate limit: `SCREENSHOT_AI_BACKFILL_BATCH_SIZE` (default 100).
4. Worker reserved concurrency (e.g. 5) to cap parallel DeepSeek calls.
5. Phase 2: heuristic pre-filter before vision (reuse legacy `process_pending_screenshots` logic).

## Security

- `DEEPSEEK_API_KEY` only in Secrets Manager / Lambda env — never in repo.
- Worker runs in VPC (RDS access); needs NAT or VPC endpoint for DeepSeek HTTPS egress.
- Do not return `ai_error_message` or raw `vision_analysis` to employees — admin/manager only.
- Screenshot images sent to DeepSeek — document in privacy policy.

## Deployment checklist

1. Run migration `007_screenshot_ai_analysis.sql` on `revclouddb` (done).
2. Set `DEEPSEEK_API_KEY` in `infra/sam/deploy.env`.
3. Deploy SAM stack: `cd infra/sam && ./deploy.sh` with `SCREENSHOT_AI_ENABLED=true`.
4. See `infra/sam/SCREENSHOT_AI_SERVICES.md` for AWS services used.
5. Verify: upload one screenshot → status `completed` within ~30s.
6. Trigger backfill: `POST /pulse/ai-analysis/backfill` with `{ "limit": 100 }`.
7. Monitor: `GET /pulse/ai-analysis/status` until `pending` → 0.

## Frontend (follow-up, not in this doc)

- Screenshots gallery: show `activity_type` badge when `completed`.
- Activity Report: new **AI Analysis** tab with breakdown by type/category.
