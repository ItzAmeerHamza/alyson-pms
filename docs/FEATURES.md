# Feature guide — Pulse and Alyson PM

How **Pulse** (Palisade web + this API) and the **Alyson PM desktop agent** work together. Use this as the product map; formulas and footguns are in [BACKEND_PIPELINE.md](./BACKEND_PIPELINE.md).

| Piece | Where it lives | Users |
|-------|----------------|--------|
| Pulse UI | Palisade web (`AlysonPulse` pages) | Admins, managers, employees in the browser |
| Pulse API | `backend/` in this repo | JWT for the UI; API key for the agent |
| Alyson PM | `desktop-agent/` | Employees on Mac / Windows |

Work day is **America/Los_Angeles** unless the workspace timezone is changed. Overnight sessions split at that midnight.

---

## How a workday flows

```
Employee starts timer in Alyson PM
        │
        ├─ session row → time_doctor.time_logs
        ├─ idle chunks → time_doctor.idle_logs
        ├─ apps / URLs → app_logs / url_logs
        └─ screenshots → S3 + time_doctor.screenshots
                │
                ▼
        POST /sync/desktop-action   (x-api-key)
                │
                ▼
        Pulse UI reads /pulse/* and /data/*   (Cognito JWT)
```

**Tracked hours** come from merged session intervals (minus authorized idle cuts and screenshot deletions).  
**Idle hours** come from `idle_logs`.  
**Effective hours** = tracked − min(tracked, idle + low-activity).  
Low-activity uses screenshots below the workspace cutoff and **excludes video meetings** (Meet / Zoom / Teams / Webex) on the Pulse side.

The desktop clock is the live tray timer. Pulse is the report of record after sync.

---

## Roles and who sees what

Pulse role lives on `time_doctor.user_extensions.pulse_role`.

| Capability | Admin | Manager | Team lead | Employee | Delegated grant |
|------------|:-----:|:-------:|:---------:|:--------:|:---------------:|
| Org dashboard & team reports | ✓ | | | | team time / people / activity / screenshots for granted users |
| Adjust hours | ✓ | | | | |
| Invite users, assign projects | ✓ | ✓ | roster only | | |
| Access grants | ✓ | | | | |
| Workspace settings, AWS costs, leave, pacing, emails | ✓ | | | | |
| Own dashboard / reports / screenshots | ✓ | ✓ | ✓ | ✓ | ✓ |
| Download agent + FAQ | ✓ | ✓ | ✓ | ✓ | ✓ |

Managers **cannot** open team reports or change hours. Team leads see Team Management (their roster) plus their own “You” pages.

---

# Pulse — frontend

Routes under `/dashboard/alyson-pulse/…` in Palisade web. Every page talks to this API via `src/api/AlysonPulse`.

## Manage

### Dashboard

**Route:** `alyson-pulse/dashboard` · **API:** `GET /pulse/dashboard`, `/pulse/daily-hours`, `/pulse/activity-summary`, `/pulse/project-hours`, `/data/time-logs`

Org snapshot for a day / week / month:

- Team tracked hours, active vs offline, average activity
- Per-employee table for the period
- Team hours chart, top-5 employees, project time mix
- CSV export

### Team Management

**Route:** `alyson-pulse/team-management` · **API:** `GET /pulse/team`, `POST /pulse/users`, `PATCH /pulse/users/:id`, `DELETE /data/users/:id`, project assignment routes

- Roster: name, email, role, department, manager / lead, status, weekly hours
- Invite (Cognito `AdminCreateUser` + Pulse profile)
- Edit role (`employee` / `team_leader` / `manager` / `admin`), manager, department
- Assign projects to a person
- Delete user (admin)
- Search and CSV export

### Project Management

**Route:** `alyson-pulse/projects` · **API:** `/data/projects`, assignments

- Create / rename / delete projects
- Assign or remove people
- Used on the agent (optional project on a session) and on Pulse project-hours charts

### Access Grants

**Route:** `alyson-pulse/access-grants` · **API:** `/pulse/access-grants`

Admin gives a non-admin **delegated** visibility to named employees. That person then sees Team time, People, Activity, and Team screenshots for those targets only. Grants can be edited or revoked.

### Daily Check-in (Not tracking)

**Route:** `alyson-pulse/reports/not-tracking` · **API:** `GET /pulse/not-tracking`

Who has **zero hours** yesterday and/or today. Used for standup / “did they clock in?”

### Leave

**Route:** `alyson-pulse/leave` · **API:** `/pulse/leave/*`

- Scan inbox (email/calendar ingest) for a period
- Classify / assign / approve / reject
- Manual leave events and team-wide events
- Calendar and analytics
- Hours credited toward pacing (schema in `leave/leaveSchema.js`)

### Pacing

**Route:** `alyson-pulse/pacing` · **API:** `GET /pulse/pacing/weekly`, `/pulse/pacing/monthly`, `POST /pulse/pacing/send`

Weekly and monthly pace vs target (on track / behind / at risk / critical). Filter by status, export CSV, email a digest to configured HR addresses.

### AWS Costs

**Route:** `alyson-pulse/aws-costs` · **API:** `GET /pulse/aws-costs`

Admin-only cost rollup for a date range (Pulse cost explorer data, not employee time).

### Workspace Settings

**Route:** `alyson-pulse/workspace-settings` · **API:** `GET/PATCH /pulse/settings`, `POST /pulse/workspaces`

| Setting | Default | Effect |
|---------|---------|--------|
| Timezone | `America/Los_Angeles` | Report “today” |
| Hours threshold | 7 | Low-hours and “below threshold” flags |
| High activity % | 60 | Activity bands |
| Low activity % | 10 | Low-activity / effective-time (Pulse also clamps ≤10) |
| Screenshots per window | 2 | Agent capture count |
| Window minutes | 10 | Agent random window |
| Interval (derived) | 5 | Report math (`window / count`) |

Admins can also create another Pulse workspace (new org + slug).

### Email Reporting (low hours)

**Route:** `alyson-pulse/reports/low-hours-emails` · **API:** `/pulse/low-hours`, `/send`, `/history`, `/senders`

Preview who is under the hours (or pace) threshold, send SES mail to employee and optionally manager, review send history.

---

## Reports (admin or delegated)

### Team Time Report

**Route:** `alyson-pulse/reports/all-employee` · **API:** `/pulse/daily-hours`, `/pulse/project-hours`

Employee × day grid for day / week / month. Cells show tracked hours and below-threshold styling. Admins can **add or remove time** for a person × Pacific day (`TimeAdjustModal` → `POST /pulse/time-adjustments`). Adjustments are append-only; the day total is tracked + net adjustments, floored at 0. Charts and CSV included.

### Employee Detail

**Route:** `alyson-pulse/reports/individual-employee` · **API:** `/data/time-logs`, `app-logs`, `url-logs`, `idle-logs`, screenshots, project hours

One person, one period:

- Session list
- Apps and URLs
- Idle stretches
- Screenshots
- Project split

### Activity Report

**Route:** `alyson-pulse/reports/activity-summary` · **API:** `/pulse/activity-summary`, `/pulse/activity-levels`, `/pulse/ai-insights`

Per-employee screenshots, clicks, keystrokes, mouse movement, high/medium/low bands. AI tab uses screenshot analysis (description, activity type) when the AI pipeline has run.

### Screenshots (team)

**Route:** `alyson-pulse/screenshots` · **API:** `/data/screenshots`, `/data/screenshot-users`, `DELETE /data/screenshots/:id`

Gallery with period, employee filter, productivity filters (low / distraction / idle), sort (newest, least productive, lowest activity). Thumbnails, full image, AI panel. **Delete** deducts that capture’s interval from the session (`deducted_seconds`). CSV export of metadata.

---

## You (every signed-in Pulse user)

### My Dashboard

Own hours for day / week / month, hero stats, hourly chart for today, top apps / URLs, project mix. Same formulas as team reports, scoped to self.

### My Reports

Own sessions, apps, URLs, idle — the employee version of Employee Detail.

### My Screenshots

Own gallery only. Employees do not delete others’ captures here.

### FAQ

In-app help: tracking, screenshots, Mac/Windows permissions, audio (the agent does **not** record audio).

### Download Agent

Latest GitHub Release from `revcloud/alyson-pms` (falls back to a pinned version if the API is rate-limited). macOS arm64 / Intel DMG and Windows Setup `.exe`.

---

# Pulse — backend

NestJS in `backend/`. Local `:3000` or Lambda behind API Gateway. Guards: JWT (`AuthGuard`) for humans, `ApiKeyGuard` for the agent.

## Hours (source of truth)

Implemented in Pulse services + `backend/src/lib/effective-time.ts`.

1. Load `time_logs` that overlap the Pacific day.
2. Clip each session to that day; merge overlaps.
3. Subtract authorized 10-minute idle cuts and screenshot `deducted_seconds`.
4. Add admin time adjustments for that `userId` + `workDate`.
5. Idle = sum of `idle_logs.duration_seconds` in range.
6. Low-activity = screenshots with `activity_percent` below cutoff, **not** a video meeting, × capture interval.
7. `non_effective = min(tracked, idle + low_activity)`  
   `effective = tracked - non_effective`

Pulse **does not** use the `daily_activity_summary` SQL view (UTC buckets). Day keys are computed in application code.

## Desktop sync (`POST /sync/desktop-action`)

All agent writes. Important actions:

| Action | What it does |
|--------|----------------|
| `create_time_log` / `upsert_time_log` / `update_time_log` | Open and close sessions. Ends only move forward unless `authorized_idle_cut` |
| `close_active_sessions` | Close other open sessions on this device (needs a confirmed end) |
| `get_today_time_logs` / `get_active_time_log` | Agent “today” and recovery |
| `insert_idle_log` | Idle checkpoints (desktop starts after 60s) |
| `insert_app_logs` / `insert_url_logs` | Focus and browsing |
| `screenshot_upload_init` / `complete` | Presigned S3 PUT + metadata (+ thumb) |
| `get_workspace_settings` | Thresholds and screenshot N-in-M for the agent |

Time-log updates are **monotonic**: completed ends do not shrink; `idle_seconds` and `deducted_seconds` use `GREATEST`.

## Other API surfaces

| Prefix | Purpose |
|--------|---------|
| `/auth` | `me`, org by slug, token |
| `/pulse/*` | Dashboards, settings, team, emails, pacing, leave, AWS costs, user invite |
| `/data/*` | Users, projects, logs, screenshots, user delete |
| `/pulse/access-grants` | Delegated visibility |
| `/sync/screenshot-ai/*` | Worker claim / complete / fail |
| `/timedoctor/v1.1/*` | Compatibility reads (honors `deducted_seconds`) |
| `/health` | RDS ping |

## Screenshot AI (optional)

SQS workers OCR / classify screenshots. Admins can backfill or retry from Pulse (`/pulse/ai-analysis/*`). Insights show on Activity Report and screenshot tiles when `ai_status` is complete.

## Email

SES (or the SES Lambda). Low-hours and pacing digests. Sender allow-list from settings / `EMAIL_SENDERS`.

---

# Desktop app — Alyson PM

Electron app. `appId` is `com.alyson.work-time-agent`. Login is Cognito; sync is the API key.

## Tracking

- **Start** — permission check, close other active sessions on this device, create a `time_logs` row (or queue offline with a temp id), start tray clock, idle monitor, screenshots, URL/app capture.
- **Live clock** — wall time from session start (from Pacific midnight if the session crossed midnight). Tray and in-app stay aligned; totals only move forward except an authorized idle cut.
- **Pause** — soft pause in the UI; do not treat it as a closed payroll row unless the session is actually stopped.
- **Stop / break / quit** — end time = now (no 10-minute cut).
- **Sleep / lid close** — stops tracking and closes the session (Mac and Windows), even during a meeting. Screen lock alone does not stop.
- **Crash / relaunch** — session recovery from local checkpoint + server open row.
- **Stale sessions** — local recovery plus hourly `tasks` job (open > 12h).

## Idle

Two layers:

1. **Logging** — after ~60s with no input, write 60s idle checkpoints. Does not cut the clock by itself.
2. **Prompt** — after **10 minutes** idle, “Are you still working?” (~60s).  
   - Working / mouse / keyboard → continue, no cut  
   - On break → stop now, no cut  
   - Timeout after the prompt **was shown** → stop and set end = now − 10 minutes (`authorized_idle_cut`)  
   - Prompt failed to show → no cut, no stop

Meetings: video-call windows are treated as work so they are not scored as low-activity on Pulse.

## Screenshots

- Random **N shots in M minutes** from workspace settings (default 2 per 10 minutes).
- Activity % from clicks / keys / mouse in that window.
- Upload: presign → S3 original + `.thumb.jpg` → `screenshot_upload_complete`.
- Offline: stay in the local queue until the API is back.
- Admin delete in Pulse removes the file metadata and deducts time.

## Apps and URLs

- Foreground app + window title (`app_logs`)
- Browser URL capture on Mac and Windows (`url_logs`)
- Adaptive polling (slower when the machine is busy)
- Flush in batches; screen lock can defer URL/app flush

## Offline

Under Application Support / `%APPDATA%` (`Alyson Work Time`):

- `offline-time-logs.json` — payroll creates/updates (never dropped)
- `offline-queue.json` — screenshots, apps, URLs, idle
- `session-checkpoint.json` — crash floor

Sync retries on an interval (~10s). After reconnect, the UI allows a short grace so the clock does not jump.

## Auth and config

1. Cognito sign-in (password in OS keychain via keytar).
2. `GET /auth/me` for user id, workspace, role.
3. `get_workspace_settings` for screenshot schedule and thresholds.
4. Sync URL = `BACKEND_API_URL` (`…/sync/desktop-action`) with `INTERNAL_API_KEY`.

Dev/build embeds this via `generate-env-config.js` → `env-config.js`.

## Permissions

**macOS:** Screen Recording + Accessibility. Releases are **not notarized**. Production ZIPs are signed with the stable self-signed identity **Alyson PM Code Signing** so TCC survives in-app updates. Same `appId` + same cert required.

**Windows:** Installer may show SmartScreen (unsigned NSIS). Accessibility-style hooks need the user to allow the app if Windows prompts.

No microphone / camera / audio recording.

## Auto-update

- Checks GitHub Releases on `revcloud/alyson-pms`
- Mac: download ZIP, replace the `.app` in place, keep permissions
- Windows: silent Setup `/S`
- Manual installers: DMG (arm64 / x64) and `Alyson.PM.Setup.{ver}.exe`

## UI surfaces

- Login
- Timer (start / stop / pause, today hours, effective estimate)
- Tray (clock, start/stop)
- Idle prompt
- Optional project picker
- Force-update / “update required” when a newer GitHub release exists
- Diagnostics / permission status

Desktop “effective” is a **local estimate** (idle_seconds + every screenshot under 10% × interval). It does **not** apply Pulse’s meeting exclusion or sustained-streak rules. Trust Pulse for reviews.

## Platforms

| | |
|--|--|
| macOS 11+ Apple Silicon and Intel | Supported |
| Windows 10/11 x64 | Supported |
| Linux | Not a product target |

---

## Feature ↔ API cheat sheet

| User action | UI | API |
|-------------|----|-----|
| See team hours | Dashboard, Team Time | `GET /pulse/dashboard`, `/pulse/daily-hours` |
| Fix a missed clock-in | Team Time → Adjust | `POST /pulse/time-adjustments` |
| Invite someone | Team Management | `POST /pulse/users` |
| Change screenshot cadence | Workspace Settings | `PATCH /pulse/settings` |
| Review captures | Screenshots | `GET /data/screenshots` |
| Delete a bad capture | Screenshots | `DELETE /data/screenshots/:id` |
| Let a lead see two people | Access Grants | `POST /pulse/access-grants` |
| Email under-hours staff | Email Reporting | `POST /pulse/low-hours/send` |
| Start the day | Alyson PM Start | `create_time_log` |
| Go idle 10+ min and walk away | Idle prompt timeout | `update_time_log` + `authorized_idle_cut` |
| Browse / switch apps | Agent (background) | `insert_url_logs` / `insert_app_logs` |
| Download the agent | Download Agent | GitHub Releases `revcloud/alyson-pms` |

---

## Related docs

| Doc | Use when |
|-----|----------|
| [README.md](../README.md) | Repo map |
| [SETUP.md](../SETUP.md) | New machine + Palisade UI |
| [GLOSSARY.md](./GLOSSARY.md) | Hours vocabulary |
| [ENV.md](./ENV.md) | Env vars |
| [RUNBOOK.md](./RUNBOOK.md) | Breakage |
| [RELEASE.md](./RELEASE.md) | Ship the agent |
| [OPERATIONS.md](./OPERATIONS.md) | Privacy, devices, stage/prod |
| [PULSE_UI.md](./PULSE_UI.md) | New Pulse screen |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Auth, offline, recording pipeline |
| [BACKEND_PIPELINE.md](./BACKEND_PIPELINE.md) | Every sync action and formula |
| [backend/API.md](../backend/API.md) | Route table |
