# Alyson Pulse / Alyson PM — General Architecture (Research Doc)

> **Audience:** Feed this to an LLM / researcher investigating time-tracking bugs (silent time loss, effective vs tracked mismatches, sync failures).
> **Repo:** `alyson-time-doctor` (npm name `alyson-pulse`). Product desktop app: **Alyson PM**.
> **As-of:** Desktop agent lineage through **v1.0.224**. Treat `system-architecture.md` at repo root as **stale** (pre–Nest/Cognito cutover).

---

## 1. What this system is

Employee time-tracking platform:

| Surface | Role | Lives where |
|---------|------|-------------|
| **Desktop agent** (Electron) | Captures time, idle, screenshots, apps, URLs; syncs to API | `desktop-agent/` in this monorepo |
| **NestJS API** | Auth, CRUD, Pulse dashboards, desktop sync, TimeDoctor-compat | `backend/` → AWS Lambda (SAM) |
| **PostgreSQL** | Canonical data on shared Palisade RDS (`time_doctor.*` + `tenant.*`) | `db/` |
| **Loveable / Palisade SPA** | Admin dashboards, team, low-hours emails UI | **Not** in this monorepo |
| **S3** | Screenshot binaries (presigned upload) | Private bucket |
| **Cognito** | User login (shared Palisade pool) | AWS Cognito |
| **SQS + AI workers** | Optional DeepSeek screenshot analysis | `infra/sam/` + `screenshot-ai` |

**Removed / legacy (do not treat as current):** `web/` Vite portal, Supabase Edge Functions, GraphQL, Bull/Redis workers, HR/payroll modules. Leftover code/docs may still mention them.

---

## 2. Monorepo layout

Root: `/Users/revcloudmac/Desktop/alyson-time-doctor`  
Workspaces: `desktop-agent`, `backend`, `tasks`

| Path | Purpose |
|------|---------|
| `backend/` | NestJS REST API (local `:3000` + Lambda `lambda.handler`) |
| `db/` | Migrations, prod apply scripts, grants |
| `desktop-agent/` | Electron tracker (macOS + Windows; Linux stubs) |
| `infra/sam/` | SAM: HTTP API, Nest container Lambda, Cognito admin, SES, screenshot-AI SQS |
| `scripts/` | Desktop release signing / GitHub upload helpers |
| `tasks/` | Maintenance (`close-stale-sessions`, `cleanup-screenshots`) |
| `docs/` | Architecture + pipeline research docs |
| `.github/workflows/` | `ci.yml`, `release.yml`, `build-staging-test.yml` |
| `system-architecture.md` | **Historical only** (Supabase era) |

### Commands (root)

```bash
npm run dev:backend      # API :3000
npm run dev:desktop      # Electron
npm run build:backend
npm run db:migrate
```

Desktop releases: push `main` + `gh workflow run release.yml -f version=vX.Y.Z` → GitHub `ItzAmeerHamza/alyson-pms`.

---

## 3. Runtime topology

```
┌─────────────────────┐     Cognito ID token      ┌──────────────────────────┐
│ Loveable / Palisade │ ───────────────────────► │ Nest AuthGuard           │
│ SPA                 │     Bearer / x-auth-token │ /pulse /data /auth       │
└─────────────────────┘                           └────────────┬─────────────┘
                                                               │
┌─────────────────────┐     x-api-key              ┌───────────▼─────────────┐
│ Alyson PM Desktop   │ ───────────────────────► │ POST /sync/desktop-action│
│ (Electron)          │     INTERNAL_API_KEY      │ ApiKeyGuard (no JWT)     │
└─────────┬───────────┘                           └───────────┬─────────────┘
          │ Cognito login → GET /auth/me                      │
          │ Presigned S3 PUT for screenshots                  ▼
          │                                          ┌────────────────────┐
          │                                          │ RDS: time_doctor.* │
          │                                          │      tenant.*      │
          │                                          └─────────┬──────────┘
          │                                                    │
          ▼                                                    ▼
   offline-*.json (local)                          Pulse aggregates / SES email
```

**Critical auth split:**

- **Human/UI APIs** (`/pulse`, `/data`, `/auth/me`): Cognito JWT (or Palisade app token).
- **Desktop writes** (`/sync/desktop-action`): **API key only**. The agent sends `user_id` in the payload; the sync path does **not** bind the request to a Cognito subject. Trust model = shared secret + device-controlled payloads.

API Gateway does **not** attach a JWT authorizer (so API-key sync stays reachable). Nest enforces auth.

---

## 4. Database architecture

### Schemas

| Schema | Owner | Contents |
|--------|-------|----------|
| `tenant.*` | Shared Palisade | `user`, `workspace`, `profile`, `profile_workspace` — identity |
| `time_doctor.*` | This product | Extensions, projects, `time_logs`, screenshots, app/url/idle logs, settings, audit |

SQL helpers: `backend/src/database/time-doctor-sql.ts` (integer `tenant.user.id`, workspace scoping).

API DB role: `alyson_time_doctor_api` (grants in `db/prod/`, migration `014_time_log_events_grants.sql`).

### Core tables (`db/migrations/002_time_doctor_schema.sql` + later)

| Table | Meaning |
|-------|---------|
| `time_doctor.user_extensions` | `cognito_sub`, `pulse_role`, manager, department, `workspace_id` |
| `time_doctor.workspace_settings` | JSONB: hours/activity thresholds, screenshot interval |
| `time_doctor.projects` | Projects |
| `time_doctor.employee_project_assignments` | User ↔ project |
| `time_doctor.time_logs` | **A session is a row** (no separate sessions table) |
| `time_doctor.screenshots` | Capture metadata + `activity_percent` + AI columns |
| `time_doctor.app_logs` / `url_logs` | Focus / browsing |
| `time_doctor.idle_logs` | OS idle stretches |
| `time_doctor.low_hours_email_log` | Email send history |
| `time_doctor.access_grants` (+ targets) | Delegated visibility (`008`) |
| `time_doctor.time_log_events` | Append-only audit + desktop breadcrumbs (`014`) |

### `time_logs` fields (payroll-critical)

| Column | Role |
|--------|------|
| `id` | UUID (often client-generated) |
| `user_id` | `tenant.user.id` (integer) |
| `project_id` | Optional |
| `workspace_id` / org | Org boundary |
| `start_time` / `end_time` | Wall clock; `end_time` NULL = open |
| `status` | `active` \| `paused` \| `completed` \| `auto_closed` |
| `idle_seconds` | Aggregate idle attributed to session (desktop-reported; sync uses GREATEST) |
| `deducted_seconds` | Time removed for deleted screenshots (sync GREATEST; delete path **adds**) |
| `device_id` | Multi-device |

### Migrations convention

- Numbered: `db/migrations/NNN_description.sql`
- Prefer idempotent / additive
- **Caveat:** duplicate numbers exist (e.g. two `005_*`, two `014_*`) — apply order is documented in `db/prod/README.md`
- Prod apply skips `001` and some QA seeds

### View caveat

`daily_activity_summary` buckets with UTC date — **Pulse does not use this view** for reports. Pulse uses Pacific day math in application code.

### Dual schema story (confusion risk)

| Mode | Schemas | Status |
|------|---------|--------|
| Production | `time_doctor` + `tenant` on Palisade RDS | **Current** |
| Greenfield sketch | `public.*` in `db/schema.sql` / `001_*` | Legacy / unused for Nest sync |
| Supabase | public + RLS + storage | Removed; dumps remain |

---

## 5. Backend NestJS shell

| File | Role |
|------|------|
| `backend/src/app.module.ts` | Feature modules + global ThrottlerGuard (120/min; sync skips) |
| `backend/src/main.ts` | Local listen `:3000` |
| `backend/src/lambda.ts` | Serverless Express handler |
| `backend/src/setup-app.ts` | Helmet, ValidationPipe (`whitelist` + `forbidNonWhitelisted`), CORS via `ALLOWED_ORIGINS` (allows null Origin for Electron), Swagger `/api` when not production |

### Modules

| Module | Prefix / role |
|--------|----------------|
| Auth | `/auth`, `/oauth/v2` |
| Data | `/data/*` CRUD/reads |
| Pulse | `/pulse/*` dashboards, low-hours |
| Users | `POST /pulse/users` Cognito invite |
| Access grants | `/pulse/access-grants` |
| Screenshot AI | Admin + internal claim/complete |
| TimeDoctor | `/timedoctor/v1.1/*` TD-compatible |
| Sync | `force-sync.controller.ts` → `/sync/*` |
| Health | `/health` (no auth) |

### Guards

| Guard | Use |
|-------|-----|
| `ApiKeyGuard` | `x-api-key` / `x-internal-api-key` vs `INTERNAL_API_KEY` — sync + AI workers |
| `AuthGuard` | Cognito ID token **or** Palisade app token |
| `TdAuthGuard` | App token only — TimeDoctor routes |
| `RolesGuard` | Admin/manager |
| `ThrottlerGuard` | Global; sync exempt |

---

## 6. Infra (SAM)

Template: `infra/sam/template.yaml`

- HTTP API → Nest container Lambda in VPC (RDS Proxy)
- Stack names: `alyson-time-doctor-api-dev` / `-prod`
- Sibling Lambdas: Cognito admin (non-VPC), SES email (non-VPC), Screenshot AI worker (SQS), AI backfill (schedule)
- S3: private screenshots; Nest `S3CrudPolicy`
- Cognito: shared Palisade pool; Nest verifies JWT; API Gateway has **no** JWT authorizer

Deploy: `infra/sam/deploy.sh`, `deploy.env*.example`.

Example prod API shape: `https://<id>.execute-api.us-west-2.amazonaws.com`

---

## 7. Desktop agent architecture

### Identity

- Package: `alyson-pm-desktop-agent`
- `appId`: `com.alyson.work-time-agent`
- Product name: **Alyson PM**
- Entry: `desktop-agent/src/main.js` (large orchestration hub)

### Module map (`desktop-agent/src/modules/`)

| Folder | Responsibility |
|--------|----------------|
| `core/` | Tracking, session, startup, lifecycle, IPC map, window/config |
| `sync/` | `sync-manager.js` (Nest writes; method names still say “edge”), `enhanced-sync-manager.js` |
| `capture/` | Screenshots, app detection |
| `activity/` | Idle monitor, input, anti-cheat |
| `url/` | `UrlCaptureManager.js` |
| `auth/` | keytar credential managers |
| `ipc/` | Advanced IPC handlers |
| `ui/` | Tray, windows |
| `system/` | Permissions, force-updater, monitor |
| `utils/` | `backend-time-logs.js`, `backend-auth-fetch.js`, work-timezone, effective-time, today stats |

Platform code: `desktop-agent/src/platform/*`. Helpers: Swift (macOS), Python input monitors.

Security rules: BrowserWindows `nodeIntegration: false`, `contextIsolation: true`; credentials in **keytar** (not localStorage for secrets — Cognito session still uses renderer storage for tokens).

### Auth (desktop)

1. **Current:** `VITE_AUTH_PROVIDER=cognito` → Cognito → ID token → `GET /auth/me` → RDS profile.
2. **Legacy remnants:** Supabase clients / env still generated in places; sync is intended to go through Nest + API key.

### Config / env (desktop)

| Var | Role |
|-----|------|
| `VITE_AUTH_PROVIDER` | `cognito` (current) |
| `VITE_COGNITO_*` | Pool/client |
| `VITE_API_BASE_URL` | Nest base URL |
| `BACKEND_API_URL` | Full sync URL ending in `/sync/desktop-action` |
| `INTERNAL_API_KEY` | Sync auth |
| `WORK_TIMEZONE` | Override; default Pacific via code |

Build embeds config via `generate-env-config.js` → `env-config.js`.

---

## 8. Desktop time-recording pipeline (detailed)

This is the payroll clock path. **Read carefully when researching “silent eating.”**

### Product rules (intended)

1. Continuous work without idle-alert timeout → recorded time ≥ wall clock for that session (no silent cut).
2. Idle alert **shown** + countdown timeout → cut **exactly 10 minutes**, then stop.
3. Manual stop / break / quit → stop at **now**, no 10m cut.
4. Pacific midnight → UI “today” resets; prior day preserved in DB.
5. Tray clock and in-app clock must stay aligned; tray is authority while tracking.
6. Soft **pause** does **not** close the DB row (wall clock still accrues if `isTracking` stays true — verify behavior against `TrackingController` vs tray).
7. Sleep / screen lock must **not** auto-stop tracking (stopping on sleep previously “ate” hours).

### State flags

| Flag | Role |
|------|------|
| `global.isTracking` | Master gate |
| `global.sessionStartTime` | ISO start for elapsed |
| `global.currentTimeLogId` | Active `time_logs.id` or `temp-*` |
| `global.isPaused` | Soft pause |
| `global.isStopping` / `userExplicitlyStopped` | Block session recovery |
| `global._stopAuthorizedIdleCut` + `_idlePromptTimeCutSeconds` | One-shot 10m cut |
| `global._stopEndTimeOverride` | Frozen end moment |

### Start → tick → stop

```
IPC start-timer
  → TrackingManager.startTracking
  → permission health check (may block)
  → close_active_sessions (device-scoped)
  → create_time_log online OR queue offline with temp-* id
  → isTracking=true; start tray, idle monitor, screenshots, URL (staggered)
  → 60s local session checkpoint (must NOT write server end_time while active)

While tracking:
  sessionElapsed = wall seconds from max(sessionStart, Pacific midnight) → now
  todayLive = overlap-merged closed intervals today + sessionElapsed
  Tray 1Hz (+ smart IPC); renderer high-water prevents paint going backward

IPC stop-timer / idle timeout / quit
  → global.stopTracking
  → if authorized idle cut: end_time = now − 10m (clamped ≥ session start)
  → else end_time = now
  → GracefulShutdownManager.gracefulStop
  → update_time_log + always mirror offline-time-logs.json
```

Key files:

- `modules/core/tracking-manager.js` — start/stop, offline create/update queue
- `modules/core/graceful-shutdown-manager.js` — centralized stop, DB update, idle-cut end resolution
- `modules/activity/enhanced-idle-monitor.js` — idle logging + prompt + `_stopForIdle`
- `idle-prompt-manager.js` — UI prompt
- `modules/ui/tray-manager.js` — tray clock / day rollover
- `modules/utils/today-time-log-stats.js` — aggregate today seconds
- `modules/utils/work-timezone.js` — Pacific day
- `modules/utils/effective-time.js` / `today-effective-stats.js` — display effective
- `modules/utils/backend-time-logs.js` — Nest actions
- `modules/utils/session-recovery.js` — heal stale sessions
- `modules/system/force-updater.js` — in-app update (Windows silent relaunch as of 1.0.224)

### Idle: two different mechanisms

**A. Idle logging (does not cut payroll clock by itself)**

- OS idle via `powerMonitor` / unified input
- Detection threshold often ~300s (configurable)
- Chunks → `insert_idle_log` / offline idle queue
- May also set `time_logs.idle_seconds` on stop
- Ignore very short slices (~&lt;5s on desktop)

**B. Idle confirmation prompt (only authorized cut)**

1. OS idle ≥ **10 minutes** → show “still working?”
2. Countdown ~**60s**
3. Outcomes:
   - “I'm working” / input → continue, **no cut**
   - “On break” → stop at **now**, **no 10m cut**
   - **Timeout after prompt was shown** → `end_time = now − 10m`, `authorized_idle_cut: true`
4. If prompt UI fails to show → **no cut, no stop** (retry later)

Legacy `checkAutoStopConditions` (phantom idle / zero screenshots) exists for tests but is **not** wired into the live idle loop.

### Clocks & anti-rewind floors

| Surface | Formula / behavior |
|---------|-------------------|
| Tray / live UI | `closedBase + elapsedSinceWorkMidnight(sessionStart)` |
| Stopped UI | DB + offline total, floored by high-water / frozen stop snapshot |
| High-water | `tf_tracked_highwater_<YYYY-MM-DD>` in session/localStorage |
| Main floor | `holdTodayTrackedFloor` — same-day totals only move forward except authorized idle cut |
| Cap | Seconds since Pacific midnight + **120s** clock-skew slack |
| Inflated HW | If HW &gt; DB+60s when stopped → drop HW in favor of DB |

### Offline persistence

Base dir (macOS): `~/Library/Application Support/Alyson Work Time/`  
(Windows: `%APPDATA%/Alyson Work Time/`; Linux: `~/.config/Alyson Work Time/`)

| File | Contents |
|------|----------|
| `offline-queue.json` | Object buckets: screenshots, appLogs, urlLogs, idleLogs, timeLogs, fraudAlerts |
| `offline-time-logs.json` | **Array** of create/update time-log ops (must stay separate from object queue — legacy corruption risk) |
| `session-checkpoint.json` | Local crash floor (`checkpointAt`, `startTime`, `timeLogId`) — local only |
| `activity-stats.json` | Local activity stats |

Flush:

- Sync manager interval ~**10s** (+ initial delay); time logs never dropped (payroll)
- Tracking manager dedicated time-log queue; retry forever; post-sync UI grace ~**90s**
- Enhanced sync: batch size/flush tunable; screen-lock can defer URL/app flush

**Note:** Some docs mention Application Support path `alyson-pm-desktop-agent` for CPU perf logs; time offline queues historically use **`Alyson Work Time`**. Verify on disk when debugging.

### Desktop → API actions (time)

| Action | When |
|--------|------|
| `create_time_log` | Start (or offline flush) |
| `update_time_log` | Stop / patches; may include `authorized_idle_cut`, `idle_seconds`, `deducted_seconds` |
| `upsert_time_log` | Idempotent sync path |
| `close_active_sessions` | Pre-start / GSM |
| `get_today_time_logs` / `get_active_time_log` | Today stats / cross-midnight |
| `insert_idle_log` | Idle chunks |
| `insert_time_log_events` | Diagnostics (e.g. `cpu_sample`) — does not change hours |
| `reconcile_inflated_time_logs` | Called by agents; **backend stub returns reconciled: 0** |

Transport: `POST {BACKEND_API_URL}` with `Content-Type: application/json`, `x-api-key: INTERNAL_API_KEY`, body `{ action, data }`.

### Desktop effective time (UI only)

```
non_effective = min(total, low_activity_seconds + idle_seconds)
effective     = total - non_effective
```

Desktop inputs (differs from Pulse — see backend pipeline doc):

- Idle: primarily `time_logs.idle_seconds` (pro-rated across midnight)
- Low: **every** screenshot with `activity_percent < 10` × capture interval seconds
- Does **not** apply Pulse’s sustained-streak or meeting exclusion
- Must **not** reduce the main tracked clock (except authorized 10m cut)

---

## 9. Pacific work day

Canonical TZ: **`America/Los_Angeles`** (`WORK_TIMEZONE` env override).

Used for:

- Desktop “today” aggregation and midnight UI reset
- Pulse daily hours clipping / day keys
- `get_today_time_logs` default bounds when client omits them

Overnight open sessions: only the portion after Pacific midnight counts toward “today”; yesterday remains on prior date.

---

## 10. Capture subsystems (non-time but coupled)

| System | Notes |
|--------|-------|
| Screenshots | Interval from workspace settings / power profile (~60s default in power-profile); activity_percent drives low-activity; upload via presign |
| App detection | Adaptive intervals via `power-profile.js` |
| URL capture | Adaptive poll + CPU budget backoff |
| Anti-cheat | Pattern/deep/process/USB intervals from power-profile |
| Performance monitor | CPU samples to disk (default every 5m as of 1.0.224); DB samples opt-in `PERF_CPU_DB=1` |

Power profile defaults were lengthened in v1.0.224 to reduce energy impact (URL/app/IPC/anti-cheat).

---

## 11. Update / release

- GitHub Releases: `ItzAmeerHamza/alyson-pms`
- Mac: DMG/ZIP; stable self-signed cert when `MAC_CSC_*` secrets set (TCC persistence)
- Windows: NSIS `Alyson.PM.Setup.{version}.exe`
- In-app updater: `force-updater.js`
  - Mac: quitAndInstall / DMG path with restart prompt
  - Windows: Node download of Setup.exe + silent `/S`; **silent NSIS skips finish page** — v1.0.224 adds NSIS `customInstall` relaunch + bat chain-start

---

## 12. Dual-path / migration map (research hazards)

| Layer | Legacy | Current |
|-------|--------|---------|
| Frontend | `web/` + Supabase | Loveable / Palisade → Nest |
| Auth | Supabase JWT | Cognito ID token (+ optional app token) |
| Writes | Edge `desktop-sync` / anon client | Nest `/sync/desktop-action` + API key |
| Storage | Supabase Storage | S3 presigned |
| DB | `public.*` / Supabase | `time_doctor.*` + `tenant.*` |
| Docs | `system-architecture.md` | `README.md`, `backend/API.md`, these docs |
| Desktop code | Still imports Supabase in places | Sync manager forces Nest |

**Also:** README may say AI was removed, but SAM + `screenshot-ai` + migration `007` reintroduce DeepSeek via SQS — treat AI as **present**.

---

## 13. Key file index

| Concern | Path |
|---------|------|
| App module | `backend/src/app.module.ts` |
| Desktop sync API | `backend/src/sync/force-sync.controller.ts` |
| Pulse | `backend/src/pulse/pulse.service.ts`, `pulse.controller.ts` |
| Effective formula | `backend/src/lib/effective-time.ts` |
| Pacific TZ | `backend/src/lib/work-timezone.ts` |
| Interval merge | `backend/src/lib/time-merge.ts` |
| Schema | `db/migrations/002_time_doctor_schema.sql` |
| Audit events | `db/migrations/014_time_log_events.sql` |
| Tracking | `desktop-agent/src/modules/core/tracking-manager.js` |
| Stop / idle cut | `graceful-shutdown-manager.js`, `enhanced-idle-monitor.js` |
| Today stats | `today-time-log-stats.js` |
| Sync client | `desktop-agent/src/modules/sync/sync-manager.js` |
| API surface list | `backend/API.md` |
| Pipeline detail | `docs/BACKEND_PIPELINE.md` |

---

## 14. Research checklist for “missing / eaten time”

Classify the symptom first:

1. **Big clock / tray dropped while working** → tracked path (idle cut, high-water snap, offline flush gap, bad stop, midnight clip).
2. **Effective / Pulse cards low but tray OK** → low+idle inputs; desktop≠Pulse formulas.
3. **TimeDoctor length &lt; Pulse hours** → `deducted_seconds` (Pulse ignores; TD subtracts).
4. **Multi-device** → Pulse merges overlaps; raw SUM overcounts.
5. **Hours appear overnight / after laptop was closed** → orphan `time_logs` left `end_time NULL`, then closed at **NOW** on next start (classic sprawl). Detection: `session_heartbeats` + `stale_session_flagged`. Safe close: local durable checkpoint or employee/admin confirmation — **not** heartbeat-as-hard-stop (see `docs/BACKEND_PIPELINE.md`).

Then inspect:

- `time_logs.start_time` / `end_time` / `status` / `idle_seconds` / `deducted_seconds` / `device_id`
- `time_log_events` (`shortened`, `stale_session_flagged`, `local_checkpoint_confirmed_close`, `admin_confirmed_close`, `authorized_idle_cut`)
- `session_heartbeats.seen_at` (telemetry only — not an auto hard-stop)
- `idle_logs` for that day
- Desktop `offline-time-logs.json` / `offline-queue.json` / `session-checkpoint.json`
- Whether idle prompt was shown
- Pacific day boundaries vs user expectation (local TZ ≠ Pacific)
