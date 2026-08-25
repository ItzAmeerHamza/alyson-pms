# Screenshot AI pipeline — AWS services

Minimal resources for DeepSeek screenshot analysis. All **new** resources tagged **`team: Alyson PM`**.

## Architecture (Option 1 — no NAT)

```
New upload / backfill (VPC Lambda, RDS + SQS endpoint)
        │
        ▼
  ScreenshotAiQueue (SQS)
        │
        ▼
  Worker Lambda (NO VPC — public internet)
        │── S3 GetObject
        │── Tesseract.js OCR
        │── DeepSeek HTTPS (text)
        └── POST /sync/screenshot-ai/* → API Lambda (VPC) → RDS
```

| Lambda | VPC? | Why |
|--------|------|-----|
| **API** | Yes | RDS Proxy |
| **Backfill** | Yes | RDS + enqueue via SQS VPC endpoint |
| **Worker** | **No** | DeepSeek + S3; DB via internal API |

**Est. cost:** ~$7–14/mo (SQS interface endpoint) vs ~$32+/mo (NAT Gateway).

## Services used

| Service | Role | New? |
|---------|------|------|
| **Amazon SQS** | Job queue | Yes |
| **SQS VPC interface endpoint** | API/backfill enqueue from VPC without NAT | Yes |
| **AWS Lambda (worker)** | S3 + Tesseract.js OCR + DeepSeek (outside VPC) | Yes |
| **AWS Lambda (API/backfill)** | RDS + SQS send | Updated |
| **DeepSeek API** | Vision/text analysis | External |

## Not used

- NAT Gateway
- Cognito VPC endpoint (breaks Palisade Managed Login)

## Physical names (`EnvironmentName=dev`)

| Resource | Name |
|----------|------|
| SQS queue | `alyson-time-doctor-screenshot-ai-queue-dev` |
| Worker | `alyson-time-doctor-screenshot-ai-worker-dev` |
| Backfill | `alyson-time-doctor-screenshot-ai-backfill-dev` |

## Upload + backfill flow

1. **New screenshot** — API sets `ai_analysis_status=pending`, enqueues SQS (`source: upload`).
2. **Backfill cron** — every 5 min, claims pending rows, enqueues SQS (`source: backfill`).
3. **Worker** — claim via API → S3 → DeepSeek → complete/fail via API.

## Deploy

```bash
cd infra/sam && ./deploy.sh
```

Requires in `deploy.env`: `DEEPSEEK_API_KEY`, `SCREENSHOT_AI_ENABLED=true`.

## Verify

```bash
# Manual backfill
curl -X POST "https://<ApiEndpoint>/pulse/ai-analysis/backfill" \
  -H "Authorization: Bearer <admin-jwt>" -H "Content-Type: application/json" -d '{"limit":10}'

# Status
curl "https://<ApiEndpoint>/pulse/ai-analysis/status" -H "Authorization: Bearer <admin-jwt>"
```
