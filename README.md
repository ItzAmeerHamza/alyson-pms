# Alyson Pulse

Employee time tracking for Palisade. This repo is the **desktop agent**, **NestJS API**, **database**, and **AWS deploy** for Alyson PM. Managers review hours, activity, and screenshots in the Palisade web dashboard (separate repo).

```
Alyson PM (desktop)  ──API key──►  Nest API (Lambda)  ──►  RDS  time_doctor.* + tenant.*
Palisade web (JWT)   ──────────►         │              ──►  S3 screenshots
Cognito login        ──────────►         │
                                         └── optional SQS → screenshot AI workers
```

**GitHub:** [revcloud/alyson-pms](https://github.com/revcloud/alyson-pms)  
**Product name:** Alyson PM · **appId:** `com.alyson.work-time-agent` (do not change)

---

## What this repo contains

| Path | Role |
|------|------|
| `desktop-agent/` | Electron tracker for macOS and Windows |
| `backend/` | NestJS REST API (local `:3000` and AWS Lambda) |
| `db/` | PostgreSQL migrations and prod grants |
| `infra/sam/` | API Gateway + container Lambda, SES, screenshot-AI SQS |
| `tasks/` | Scheduled jobs (stale sessions, screenshot cleanup, Athena export) |
| `scripts/` | Desktop release helpers |
| `.github/workflows/` | CI and desktop release |

**Not in this repo:** Palisade / Pulse UI. That app calls this API with a Cognito (or Palisade) JWT.

---

## Desktop app (Alyson PM)

Electron companion employees run on their machine. It records work, stays usable offline, and syncs to the API.

### Tracking

- Start / stop / pause from the app or tray
- One `time_logs` row per session (`active`, `paused`, `completed`, `auto_closed`)
- Tray clock is the live authority while tracking; in-app clock stays aligned
- Work day is **America/Los_Angeles** (override with `WORK_TIMEZONE`)
- Overnight sessions: only time after Pacific midnight counts as “today”
- Lid close / sleep **stops** the session (screen lock alone does not)
- Stale open sessions are recovered on launch; server-side, jobs close sessions left open > 12h

### Idle

- Idle is logged after ~60s with no keyboard/mouse (checkpoints while still idle)
- After **10 minutes** idle, a “still working?” prompt appears (~60s countdown)
  - **I'm working** / input → continue, no cut
  - **On break** → stop now, no 10-minute cut
  - **Timeout** after the prompt is shown → stop and cut exactly 10 minutes
- If the prompt cannot be shown, time is **not** cut
- Meeting windows are treated as work so idle-looking video calls are not marked low-activity

### Screenshots

- Random **N captures per M-minute window** (workspace setting; default 2 per 10 minutes)
- Uploaded to private S3 via presigned PUT, plus a sibling thumbnail
- Activity % is stored on each screenshot (clicks / keys / mouse in the window)
- Admins can delete screenshots; deleted time is deducted from the session

### Apps, URLs, and activity

- Foreground app and window title
- Browser URL capture (macOS + Windows)
- Input activity for activity scoring
- Optional anti-cheat / process checks on a low-power schedule

### Offline and sync

- Queues time logs, screenshots, apps, URLs, and idle locally if the API is down
- Time logs are never dropped (payroll)
- Flush to `POST /sync/desktop-action` with `x-api-key`
- Cognito login, then `GET /auth/me` for the RDS profile

### Permissions (macOS)

- Needs **Screen Recording** and **Accessibility**
- Releases are **not notarized**
- Builds are signed with the stable self-signed identity **Alyson PM Code Signing**
- Same `appId` + same cert → permissions survive in-app updates
- Do not generate a new signing cert or change `appId` for a normal release

### Auto-update

- In-app updates from GitHub Releases on [`revcloud/alyson-td-releases`](https://github.com/revcloud/alyson-td-releases)
- Mac: in-place ZIP replace (not a DMG)
- Windows: silent NSIS (`oneClick: true`)
- Manual downloads: DMG (arm64 / Intel) and Windows Setup `.exe`

### Platforms

| Platform | Status |
|----------|--------|
| macOS 11+ (Apple Silicon and Intel) | Supported |
| Windows 10/11 | Supported |
| Linux | Stubs only |

---

## Backend (NestJS API)

REST API for the desktop agent and Palisade Pulse UI. Runs locally on port 3000 or as a container Lambda behind HTTP API Gateway.

### Auth

| Client | Auth | Used for |
|--------|------|----------|
| Palisade web | Cognito ID token or Palisade app token | `/pulse`, `/data`, `/auth` |
| Desktop agent | `x-api-key` (`INTERNAL_API_KEY`) | `/sync/desktop-action` and AI workers |
| TimeDoctor-compat | App token | `/timedoctor/v1.1/*` |
| Health | None | `GET /health` |

API Gateway does **not** attach a JWT authorizer (so API-key sync stays reachable). Nest enforces auth. CORS is `ALLOWED_ORIGINS` (Electron may send a null Origin).

### Pulse (admin dashboards)

Org reports require `admin`. Managers can invite users and assign projects but cannot view team reports or adjust hours.

- Dashboard totals, active users, activity %
- Daily hours grid (below-threshold flags)
- Project hours
- Activity levels and activity summary (screenshots, clicks, keys)
- AI insights from screenshot analysis
- Not-tracking list
- Team / org chart (leads, reports, weekly hours)
- Workspace settings (hours threshold, screenshot N-in-M)
- Low-hours email (preview, send, history)
- Manual time adjustments (append-only audit)
- Weekly / monthly pacing emails
- AWS cost read for Pulse (when enabled)
- User invite (`POST /pulse/users`) and profile patch
- Access grants (delegated visibility)
- Leave inbox / calendar / analytics

### Data reads and admin CRUD

JWT. Employees see their own data unless they are admin or have a grant.

- Users, projects, assignments
- Time logs, app logs, URL logs, idle logs
- Screenshot gallery (presigned S3 URLs) and delete
- Time-log events (audit / breadcrumbs)
- Delete user (admin)

### Desktop sync (`POST /sync/desktop-action`)

Single write endpoint. Actions include:

`create_time_log`, `upsert_time_log`, `update_time_log`, `close_active_sessions`, `get_active_time_log`, `get_today_time_logs`, `insert_app_logs`, `insert_url_logs`, `insert_idle_log`, `screenshot_upload_init`, `screenshot_upload_complete`, `list_screenshots`

Screenshots: init → presigned S3 PUT → complete. Optional AI pipeline claims jobs over `/sync/screenshot-ai/*`.

### Other modules

| Module | Purpose |
|--------|---------|
| Auth | `/auth/me`, org-by-slug, token |
| TimeDoctor | `/timedoctor/v1.1/*` compatibility reads |
| Screenshot AI | Admin status / backfill / retry + worker claim/complete |
| Health | RDS ping |

Full route list: [backend/API.md](backend/API.md).

### How hours are computed

Pulse clips sessions to the Pacific work day, then:

- **Tracked** = session duration minus authorized idle cuts and screenshot deductions
- **Idle** = summed `idle_logs` (desktop starts counting after 60s)
- **Effective** = tracked minus idle and sustained low-activity (meetings excluded)
- Manual **time adjustments** add or subtract on that day (floor at 0)

Desktop UI effective-time is a simpler local estimate and is **not** the payroll source of truth. Pulse is.

---

## Database and storage

Production is shared Palisade RDS.

| Schema | Contents |
|--------|----------|
| `tenant.*` | Users, workspaces, profiles |
| `time_doctor.*` | Time logs, screenshots, app/url/idle logs, settings, grants, leave, audit |

Screenshots live in a **private S3** bucket. The API returns short-lived presigned URLs. Objects are not public.

Migrations: `db/migrations/`. Apply order is in [db/prod/README.md](db/prod/README.md). Prefer additive, idempotent SQL.

---

## Infra and scheduled jobs

**API deploy:** `infra/sam/` — HTTP API → Nest container Lambda in the VPC (RDS Proxy), plus Cognito admin, SES, and screenshot-AI SQS workers.

Stacks: `alyson-time-doctor-api-dev` / `-prod`. See [infra/sam/README.md](infra/sam/README.md).

**Tasks** (`tasks/`, EventBridge or cron):

| Job | Schedule | Purpose |
|-----|----------|---------|
| Close stale sessions | Hourly | Auto-close sessions open > 12h |
| Cleanup screenshots | Daily | Delete RDS + S3 objects older than 90 days |
| Export time logs / events | Every 15 min | NDJSON to S3 for Athena |

---

## Desktop releases

Channel: GitHub Releases on **[`revcloud/alyson-td-releases`](https://github.com/revcloud/alyson-td-releases)** (public). Source stays on private `revcloud/alyson-pms`.

```bash
# After pushing main
gh workflow run release.yml -f version=vX.Y.Z
```

Release rules (do not change for a normal ship):

- `"notarize": false`
- `"identity": "Alyson PM Code Signing"`
- `"appId": "com.alyson.work-time-agent"`
- Copy the **existing** `MAC_CSC_LINK` / `MAC_CSC_KEY_PASSWORD` secrets — do not mint a new cert
- Auto-update manifests (`latest-mac.yml`, `latest.yml`) must name ZIP / Setup files with dots (`Alyson.PM-…`)

Installed apps update in place. A new cert or `appId` forces every Mac user to re-grant Screen Recording and Accessibility.

---

## Local development

**New machine:** follow [SETUP.md](SETUP.md) (`bash scripts/install-requirements.sh`).

Requires Node 20+.

```bash
# API  →  http://localhost:3000
# Swagger (non-production)  →  http://localhost:3000/api
cd backend
cp .env.example .env   # DATABASE_URL, Cognito, S3, INTERNAL_API_KEY, ALLOWED_ORIGINS
npm install
npm run start:dev

# Desktop
cd desktop-agent
cp .env.example .env   # VITE_AUTH_PROVIDER=cognito, VITE_API_BASE_URL, INTERNAL_API_KEY
npm install
npm start

# From repo root
npm run dev:backend
npm run dev:desktop
npm run build:backend
npm run test:backend
npm run db:migrate
```

Backend env (required in prod): `DATABASE_URL`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `INTERNAL_API_KEY`, `AWS_S3_BUCKET`, `ALLOWED_ORIGINS`.

Desktop build embeds config with `desktop-agent/generate-env-config.js` → `env-config.js` (`npm run prebuild` in `desktop-agent/`).

---

## CI

`.github/workflows/ci.yml` runs backend **build + test** and a light desktop TypeScript check. There is no `web/` workspace in this repo (Pulse UI is Palisade-web).

---

## Deeper docs

| Doc | Contents |
|-----|----------|
| [SETUP.md](SETUP.md) | New machine + Palisade web |
| [docs/FEATURES.md](docs/FEATURES.md) | Pulse UI + API + desktop features |
| [docs/GLOSSARY.md](docs/GLOSSARY.md) | Tracked / effective / idle / cuts |
| [docs/ENV.md](docs/ENV.md) | Env vars and env pairing |
| [docs/RUNBOOK.md](docs/RUNBOOK.md) | Debug: sync, permissions, hours |
| [docs/RELEASE.md](docs/RELEASE.md) | Unsigned GitHub release one-pager |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Privacy, multi-device, stage vs prod |
| [docs/PULSE_UI.md](docs/PULSE_UI.md) | How to add a Pulse page |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Auth split, desktop recording, idle cut, offline queues |
| [docs/BACKEND_PIPELINE.md](docs/BACKEND_PIPELINE.md) | Sync actions, screenshot deduction, Pulse formulas |
| [docs/DB_SCHEMA.md](docs/DB_SCHEMA.md) | Tables, indexes, migrations |
| [backend/API.md](backend/API.md) | REST routes |
| [db/README.md](db/README.md) | Schema apply |
| [infra/sam/README.md](infra/sam/README.md) | Lambda deploy |
| [tasks/README.md](tasks/README.md) | Maintenance jobs |

`system-architecture.md` and `backend/README.md` still describe the old Supabase / GraphQL stack. Treat them as historical.
