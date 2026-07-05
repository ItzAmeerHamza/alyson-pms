# Alyson Pulse — Backend API (Loveable)

Minimal REST API for the Loveable frontend. Deploy behind API Gateway + Lambda with `SERVERLESS_MODE=1`.

**Base URL:** `https://<api-gateway-host>`  
**Auth:** `Authorization: Bearer <cognito_id_token>`  
**Desktop agent sync:** `x-api-key: <INTERNAL_API_KEY>`

---

## Auth

| Method | Path | Description |
|--------|------|-------------|
| GET | `/auth/me` | Current user profile |
| GET | `/auth/organizations/by-slug/:slug` | Org lookup at login |

---

## Pulse dashboards (admin/manager)

All require `admin` or `manager` role.

| Method | Path | Loveable page | Description |
|--------|------|---------------|-------------|
| GET | `/pulse/dashboard?days=7` | Dashboard | Total hours, active/offline users, avg activity %, daily breakdown |
| GET | `/pulse/daily-hours?start=YYYY-MM-DD&end=YYYY-MM-DD` | Daily Hours | Employee × day grid with `below_threshold` flags |
| GET | `/pulse/activity-levels?start=YYYY-MM-DD&end=YYYY-MM-DD` | Activity Levels | Per-employee daily scores (`high` / `medium` / `low`) |
| GET | `/pulse/team` | Team Management | Leads + direct reports + weekly hours |
| GET | `/pulse/settings` | — | Org thresholds (`hours_threshold` default 7h) |
| GET | `/pulse/low-hours?date=YYYY-MM-DD` | Email Reporting | Employees below threshold |
| POST | `/pulse/low-hours/send` | Email Reporting | Send notification emails |
| GET | `/pulse/low-hours/history` | Email Reporting | Sent email log |
| PATCH | `/pulse/users/:id` | Team Management | Update manager, department, role, etc. |

### POST `/pulse/low-hours/send` body

```json
{
  "date": "2026-06-30",
  "employee_ids": ["uuid-optional"],
  "notify_manager": true
}
```

---

## Data reads (admin + employee self-service)

JWT required. Employees only see own data unless admin/manager.

| Method | Path | Loveable page | Description |
|--------|------|---------------|-------------|
| GET | `/data/users` | Team Management | Employee list |
| GET | `/data/projects` | Time Tracker | Project list |
| POST/PATCH/DELETE | `/data/projects/*` | — | Project CRUD (admin) |
| GET | `/data/time-logs?start&end&userId&detailed=1` | Employee Detail, My Reports | Sessions |
| GET | `/data/app-logs?start&end&userId` | Employee Detail | Apps used |
| GET | `/data/url-logs?start&end&userId` | Employee Detail | URLs visited |
| GET | `/data/idle-logs?start&end&userId` | Employee Detail | Idle periods |
| GET | `/data/screenshots?start&end&userId` | Screenshots, My Reports | Screenshot gallery (S3 presigned URLs) |

---

## Desktop agent sync

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/sync/desktop-action` | API key | All agent writes (time logs, screenshots, apps, URLs, idle) |

Actions: `create_time_log`, `upsert_time_log`, `update_time_log`, `close_active_sessions`, `get_active_time_log`, `get_today_time_logs`, `insert_app_logs`, `insert_url_logs`, `insert_idle_log`, `screenshot_upload_init`, `screenshot_upload_complete`, `list_screenshots`.

**Idle logging (desktop agent):** idle is counted after **60 seconds** with no keyboard/mouse input. While the user remains idle, the agent writes **60-second checkpoints** to `time_doctor.idle_logs` via `insert_idle_log` (no click required to close a period). Daily totals are the sum of `duration_seconds` across rows for that user/day.

---

## Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | RDS ping |

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | RDS PostgreSQL connection string |
| `COGNITO_USER_POOL_ID` | Yes | JWT validation |
| `COGNITO_CLIENT_ID` | Yes | JWT validation |
| `INTERNAL_API_KEY` | Yes | Desktop agent sync |
| `AWS_S3_BUCKET` | Yes | Screenshot storage |
| `RESEND_API_KEY` | For email | Low-hours notifications |
| `EMAIL_FROM` | Optional | Sender address |
| `ALLOWED_ORIGINS` | Yes | CORS for Loveable domain |

---

## Database setup

**Greenfield RDS:** run `backend/db/schema-minimal.sql`

**Existing TimeFlow RDS:** run `backend/db/migrations/001_pulse_additive.sql`

---

## Removed (not needed for Loveable)

- All `/ai-insights`, `/insights/*`, GraphQL subscriptions
- Bull/Redis workers, AI analysis queues
- Complex email report configuration (`report_*` tables)
- HR warnings, payroll, finance, super-admin multi-tenant UI APIs

Legacy tables can remain in RDS unused; new installs use the minimal schema only.
