# Alyson Pulse — Leave module

Postgres leave ledger + People Ops Gmail intake (AlysonHR product rules), adapted for Pulse.

## Architecture (Pulse vs AlysonHR S3)

| AlysonHR spec | Pulse implementation |
|---------------|----------------------|
| S3 `leave/data.json` | Postgres `time_doctor.leave_*` |
| Clerk Super Access | Cognito admin (`canAdjustPulseTime`) |
| Asia/Kolkata dates | **Company work TZ** (`workspace_settings.timezone`) |
| Leave credit in pacing | Ledger → pacing at **8h**/day; Team Time adjustments still **7h**/day |

## Migrations

```bash
psql … -f db/migrations/018_leave.sql
psql … -f db/migrations/020_leave_inbox_hr_statuses.sql
```

## Scan / DeepSeek intake

- Periods: `7d` / **`30d` (default)** / `90d` / `6mo` / `12mo` / `24mo`
- Gmail DWD: impersonate real user (`GOOGLE_WORKSPACE_ADMIN_SUBJECT_EMAIL`), filter to `LEAVE_EMAIL_MAILBOX` (often Google Group `people-ops@cintara.ai`)
- Statuses: `pending` · `approved` · `rejected` · `unmatched` · `duplicate` · `not_leave` · `extraction_failed`
- Auto-approve when `LEAVE_EMAIL_HR_REVIEW_ENABLED` is not `true`
- Recruitment / FYI / meeting / payroll → `not_leave`
- Overlap with existing leave → `duplicate`
- Cancellation → void matching ledger leave when possible
- Half-day → `0.5` days + half credit

## Env

Same Google DWD service account as AlysonHR. Prefer either:

**A) AlysonHR-style JSON (local / Lambda env)**

```bash
GOOGLE_DWD_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'  # full SA JSON
GOOGLE_WORKSPACE_ADMIN_SUBJECT_EMAIL=thirumalai@cintara.ai
```

**B) Split vars (recommended for SAM `deploy.env`)**

```bash
DEEPSEEK_API_KEY=...
# From JSON.client_email:
GOOGLE_DWD_CLIENT_EMAIL=alyson-calendar-sync@YOUR_PROJECT.iam.gserviceaccount.com
# From JSON.private_key (\n escaped). deploy.sh base64-encodes for SAM:
GOOGLE_DWD_PRIVATE_KEY='-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n'
GOOGLE_WORKSPACE_ADMIN_SUBJECT_EMAIL=thirumalai@cintara.ai   # impersonate user
GOOGLE_DWD_SUBJECT=thirumalai@cintara.ai                     # same as above for SAM
LEAVE_EMAIL_MAILBOX=people-ops@cintara.ai
LEAVE_EMAIL_IMPERSONATE_MAILBOX=false
LEAVE_EMAIL_HR_REVIEW_ENABLED=false
LEAVE_CREDIT_HOURS_PER_DAY=7   # Team Time adjustment credit
```

Unused for leave scan (keep for AlysonHR only): `GOOGLE_WORKSPACE_DOMAIN`, `GOOGLE_PROJECT_ID`, `GOOGLE_DWD_SERVICE_ACCOUNT_CLIENT_ID` (Client ID is for Workspace Admin DWD UI, not the API runtime).

Workspace Admin: authorize SA **Client ID** for `https://www.googleapis.com/auth/gmail.readonly`.

API Lambda has **no NAT**. Gmail + DeepSeek run on non-VPC `LeaveScanWorkerFunction`;
`POST /pulse/leave/scan` Event-invokes that worker, which POSTs `/pulse/leave/internal/ingest-batch`.

## API

`/pulse/leave/*` — see controller. Key: `POST /scan` `{ period:"30d" }`, inbox assign/approve/reject.
