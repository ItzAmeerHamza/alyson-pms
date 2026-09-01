# Alyson Pulse — Backend Pipeline (Research Doc)

> Companion to `docs/ARCHITECTURE.md`. Exhaustive Nest sync + Pulse + time math for LLM/research use.
> Focus: how desktop payloads become DB rows, how hours are computed, and every known mismatch / footgun.

---

## 1. Entry points

| Route | Auth | Purpose |
|-------|------|---------|
| `POST /sync/desktop-action` | `ApiKeyGuard` (`x-api-key` = `INTERNAL_API_KEY`) | Canonical desktop writes/reads |
| `POST /sync/force-url-insert` | API key | Standalone URL insert |
| `POST /sync/force-app-insert` | API key | Standalone app insert |
| `POST /sync/check-connectivity` | API key | Connectivity probe |
| `POST /sync/sync-queue-stats` | API key | Queue stats |
| `POST /sync/screenshot-ai/*` | API key | AI worker claim/complete/fail |
| `GET/POST /pulse/*` | Cognito JWT / app token | Dashboards, low-hours, team |
| `GET/PATCH/DELETE /data/*` | JWT | Admin/employee data CRUD |
| `/timedoctor/v1.1/*` | `TdAuthGuard` | TD-shaped API (subtracts `deducted_seconds`) |
| `GET /health` | None | RDS ping |

**Controller:** `backend/src/sync/force-sync.controller.ts`  
**Body shape for desktop-action:** `{ action: string, data: any }`  
Throttle: global 120/min; **sync skips** throttle.

### Shared helpers (force-sync)

| Helper | Behavior |
|--------|----------|
| `resolveWorkspaceId` | Payload `organization_id` / `workspace_id`, else `user_extensions.workspace_id` |
| `resolveTimeLogId` | Must look like UUID; if missing in RDS → `null` (continues without FK) |
| `resolveProjectId` | Unknown project → `null` (warn, ignore) — does not fail the request |
| `toScreenshotInt` | `Math.round` for activity/focus/input ints |

---

## 2. Full `desktop-action` catalog

### Apps / URLs / idle

| Action | Behavior | Nuances |
|--------|----------|---------|
| `insert_app_logs` | Batch → each `forceAppInsert` | Requires `user_id`, `app_name`; timestamps default now |
| `insert_url_logs` | Batch → `forceUrlInsert` | Requires `user_id`, `site_url` |
| `close_open_app_logs` | Close open focus rows | `ended_at = GREATEST(started_at, $ended)`; only open rows with `started_at <= ended` |
| `close_open_url_logs` | Same for URLs | Optional `site_url` filter |
| `insert_idle_log` | `INSERT idle_logs` | Duration from `idle_duration_seconds \|\| idle_seconds \|\| duration_seconds` — **field-name aliases**; logging/code paths may prefer different aliases |

### Time logs (payroll-critical)

| Action | Behavior | Monotonic / payroll rules |
|--------|----------|---------------------------|
| `create_time_log` | INSERT new session | `id` = client or `randomUUID()`; **no ON CONFLICT** |
| `upsert_time_log` | INSERT … ON CONFLICT | **start** = `LEAST`; **end** never shortens (`NULL` keep / `GREATEST`); **status** sticky `completed`; **idle_seconds** / **deducted_seconds** = `GREATEST`; project/workspace/device coalesce |
| `update_time_log` | Patch | Default: `end_time` only moves **forward**; if already `completed`, end frozen. **`authorized_idle_cut: true`**: allows earlier end = `GREATEST(start + 30s, clientEnd)`. idle/deducted still `GREATEST` |
| `close_active_sessions` | Close open sessions | Without `end_time`: **inspect/flag only** (no mutation). With `end_time`: requires `confirm_with_local_checkpoint`, `admin_confirmed`, or `allow_unconfirmed_end`. **Never invents end from heartbeat.** |
| `inspect_open_sessions` / `reconcile_open_sessions` | Recover if fresh; flag if stale | Heartbeat/evidence for freshness only. Writes `stale_session_flagged` events. **Does not change `time_logs.end_time`.** |
| `confirm_stale_session_close` | Confirmed close of one session | Requires `end_time` + (`confirm_with_local_checkpoint` \| `admin_confirmed`). Records `local_checkpoint_confirmed_close` / `admin_confirmed_close`. |
| `insert_session_heartbeat` / `upsert_session_heartbeat` | Append-only liveness telemetry | Does not mutate `time_logs`. Alias `upsert_*` kept for older agents. |
| `reconcile_inflated_time_logs` | **Stub** | Always `{ success: true, reconciled: 0 }` |

### Time log reads

| Action | Behavior |
|--------|----------|
| `get_active_time_log` | `end_time IS NULL AND status='active'`, optional device, latest start |
| `get_today_time_logs` | Overlap: `start < endOfDay AND COALESCE(end,NOW()) > startOfDay`; day bounds from client or `work-timezone` Pacific defaults |
| `get_time_logs_in_range` | Filter on `start_time`; limit 1–10000 (default 5000); includes `deducted_seconds` |

### Settings / projects

| Action | Behavior |
|--------|----------|
| `get_workspace_settings` | Org thresholds; defaults if missing: `hours_threshold=7`, `high_activity=60`, `low_activity=10`, `screenshot_count_per_window=2`, `screenshot_window_minutes=10`, derived `screenshot_interval_minutes=5` |
| `list_user_projects` | Assignments ⋈ projects |
| `list_app_logs` / `list_url_logs` | Reads; limit 1–5000 (default 500) |

### Screenshots

| Action | Behavior |
|--------|----------|
| `screenshot_upload_init` | Presign PUT; returns `id`, `s3_key`, `upload_url`, `content_type` |
| `screenshot_upload_complete` | INSERT/UPSERT RDS row; sets AI pending; fire-and-forget enqueue |
| `list_screenshots` | Gallery thumbs (`thumb_url` only unless `full=1` or no thumb); HTTP `GET /data/screenshots` default limit 200. `GET /data/screenshots/:id` signs the original for lightbox |
| `estimate_screenshot_deduction` | Preview only (midpoint formula); ownership check if `user_id` |
| `delete_screenshot` | S3 best-effort delete; **add** to `deducted_seconds`; DELETE row |
| `upload_screenshot` | **HTTP 410 Gone** (deprecated) |

### Audit / diagnostics

| Action | Behavior |
|--------|----------|
| `insert_time_log_events` | Append-only `time_log_events`; max **50**/request; does **not** mutate `time_logs` duration |

---

## 3. Screenshot pipeline

### Upload (desktop → S3 → RDS)

File: `desktop-agent/src/modules/utils/screenshot-storage.js`

1. `screenshot_upload_init` → `{ id, s3_key, upload_url, content_type }`
2. Client HTTP `PUT` to presigned URL
3. `screenshot_upload_complete` with metadata — desktop retries **3×** with backoff
4. Failure mode: **S3 object may exist without RDS row** (orphans)

**S3 key** (`backend/src/lib/screenshot-s3-key.ts`):

```
{prefix}/{UTC_yyyy}/{mm}/{dd}/organization_{org|none}/user_{userId}/{screenshotId}.{ext}
```

Default prefix: `alyson-td-screenshots` (`AWS_S3_SCREENSHOTS_PREFIX`).

**Presign TTLs** (`s3.service.ts`): PUT default **300s**; GET **3600s** (env overridable).

### Deduction formula (delete screenshot)

Shared by sync `delete_screenshot` and `data.service.deleteScreenshot`.

Constants:

- `MAX_SCREENSHOT_DEDUCTION_SECONDS = 240`
- No-session fallback ≈ `min(200, MAX)`

```
intervalStart = prevShot ? midpoint(prev, this) : session.start
intervalEnd   = nextShot ? midpoint(this, next) : session.end|now
clamp to [session.start, max(session.end, target+60s)]
seconds = min(round((intervalEnd - intervalStart) / 1000), 240)
```

On delete:

```
deducted_seconds = COALESCE(deducted_seconds, 0) + seconds   -- ADDITIVE
```

Contrast: upsert/update from client use **GREATEST** for `deducted_seconds` (can raise, not lower via those paths).

### Who respects `deducted_seconds`?

| Consumer | Subtracts deducted? |
|----------|---------------------|
| Pulse `hours_worked` / effective | **No** — wall merged intervals only |
| TimeDoctor `/timedoctor/v1.1` worklogs `length` | **Yes** — `epoch(end-start) - deducted_seconds` |
| Desktop big clock | **No** (by product rule) |

---

## 4. Server payroll invariants (sync)

1. Prefer **lengthening** sessions; never trust client to shrink wall duration except:
   - `authorized_idle_cut: true` on `update_time_log` (still ≥ start + 30s)
   - Admin `PATCH /data/time-logs/:id` close (see §8 — **weaker guards**)
2. `idle_seconds` / client `deducted_seconds` on upsert/update: **GREATEST** (monotonic up).
3. Screenshot delete: **additive** deduction.
4. `reconcile_inflated_time_logs`: **does nothing**.
5. Checkpoints on desktop must not write `end_time` while active — that would freeze a forward-only end and block a later legitimate idle cut or correct close.

---

## 5. Pacific timezone helpers

**File:** `backend/src/lib/work-timezone.ts`  
Default: `WORK_TIMEZONE = process.env.WORK_TIMEZONE || 'America/Los_Angeles'`

| Helper | Role |
|--------|------|
| `workDateKey` | `YYYY-MM-DD` in Pacific |
| `workDayBoundsMs` / `workDateRangeToUtcIso` | Inclusive Pacific days → UTC `[start, endExclusive)` |
| `startOfWorkDayIso` / `endOfWorkDayExclusiveIso` | Single-day bounds |
| `eachWorkDateKey` | Enumerate days |
| `sqlWorkDate(col)` | `(col AT TIME ZONE 'America/Los_Angeles')::date` |

DST-safe: dual offset solve for local midnight. Pulse responses include `timezone: 'America/Los_Angeles'`.

---

## 6. Tracked hours (Pulse)

**File:** `backend/src/pulse/pulse.service.ts` — `dailyHoursFromLogs` (+ merge)

Algorithm:

1. Load `time_logs` overlapping UTC window with **~3-day lookback** (overnight / long opens).
2. Clip each session to each Pacific calendar day.
3. **Merge overlapping intervals per user/day** (`mergeTimeIntervals` in `lib/time-merge.ts`) — multi-device de-dupe.
4. Hours = merged ms / 3600, round **1 decimal**.
5. Open sessions use `NOW()` as end.

**Not subtracted:** `idle_seconds`, `deducted_seconds`.

### Contrast: `getProjectHours`

SQL `SUM(EPOCH(clip))` **without** interval merge → can **over-count** multi-device overlap vs daily-hours.

### Contrast: TimeDoctor length

Wall seconds − `deducted_seconds` (idle not subtracted there either).

---

## 7. Idle hours (Pulse)

| Rule | Value |
|------|-------|
| Prefer source | `idle_logs` via `dailyLowActivityFromIdleLogs` (name is historical; this is idle) |
| Min duration for reporting | **`MIN_IDLE_REPORT_SECONDS = 300`** (5 minutes) — shorter idle_logs ignored |
| Duration | Prefer `idle_end − idle_start`; may use `duration_seconds` if longer |
| Clip | To Pacific days |
| Fallback | If a day has **no** idle_log hours → use `time_logs.idle_seconds` attributed to **Pacific day of `start_time` only** (not pro-rated across midnight) |
| Cap | `idleHours = min(idleRaw, hoursWorked)` when hours &gt; 0 |
| Exclusions | Emails matching `%@example.com%` excluded from some Pulse queries |

### Desktop mismatch (important)

| Aspect | Desktop UI effective | Pulse |
|--------|----------------------|-------|
| Primary idle source | `time_logs.idle_seconds` | Prefer `idle_logs` ≥ 5m |
| Midnight | Pro-rates idle across days | Fallback puts all session idle on start day |
| Short idle | Desktop may log short slices; Pulse drops &lt;5m from idle_logs | |

Doc mismatch: some API docs say desktop idle checkpoints after **60s**; Pulse reporting filters **≥5 min**.

---

## 8. Low-activity hours (Pulse)

**Function:** `fetchLowActivityHoursFromScreenshots` (and related)

| Rule | Detail |
|------|--------|
| Cutoff | `lowActivityCutoffPercent = min(max(settings.low_activity_threshold, 0), 10)` — **never looser than 10%** |
| is_low | `activity_percent < cutoff` AND **not** video meeting |
| Meetings excluded | `SCREENSHOT_IS_VIDEO_MEETING_SQL` — Meet / Zoom / Teams / Webex (`meeting-context.ts`) |
| Sustained streak | `SUSTAINED_LOW_MINUTES = 3`; `N = ceil(3 / screenshot_interval_minutes)` (1-min interval → 3 shots; 10-min → 1 shot) |
| Credit | Each qualifying LOW shot in a streak adds `intervalMinutes / 60` hours |
| Cap | `min(lowRaw, hoursWorked)` |
| Dead code | `mergeLowActivityByUserDay` defined but **never called** |

### Meeting floor (related, activity display)

`MEETING_ACTIVITY_FLOOR_PERCENT = 50` — meeting screenshots floored to ≥50% activity for some displays; low-hours path **excludes** meetings entirely from low.

### Desktop mismatch

Desktop `today-effective-stats.js`:

- Counts **every** shot with `activity_percent < 10` (no streak)
- Does **not** exclude meetings
- Uses live capture interval seconds

→ Desktop non-effective can be **much higher** than Pulse for the same day.

---

## 9. Effective / non-effective formula

**Canonical:** `backend/src/lib/effective-time.ts`  
**Desktop mirror (seconds):** `desktop-agent/src/modules/utils/effective-time.js`

```
non_effective = min(total, low_activity + idle)
effective     = total - non_effective
```

Hours rounded to **1 decimal** on backend.

### Critical nuance: double-count

Low and idle are **summed** then capped by total. They are **not** disjoint partitions. Overlapping “idle stretch” and “low activity screenshots” can inflate non-effective up to `total`.

Per Pulse day after capping inputs:

```
hours_worked   = merged wall-clock (Pacific)
low_activity_h = min(screenshot_low_h, hours_worked)
idle_h         = min(idle_h, hours_worked)
→ computeEffectiveTime(hours_worked, low_activity_h, idle_h)
```

---

## 10. Pulse HTTP API map

**Controller:** `backend/src/pulse/pulse.controller.ts`  
**Auth:** Cognito JWT (`AuthGuard`) + role/visibility checks

| Method | Path | Typical gate | Service |
|--------|------|--------------|---------|
| GET | `/pulse/dashboard?days=` | org admin | `getDashboard` (days 1–90, default 7) |
| GET | `/pulse/daily-hours?start&end` | self / team / delegate | `getDailyHours` |
| GET | `/pulse/project-hours?start&end&userId?` | same | `getProjectHours` |
| GET | `/pulse/activity-levels?start&end` | team | `getActivityLevels` |
| GET | `/pulse/activity-summary?start&end` | team | `getActivitySummary` |
| GET | `/pulse/ai-insights?start&end` | team | `getAiInsights` |
| GET | `/pulse/not-tracking?date?` | team | `getNotTracking` |
| GET | `/pulse/team` | canViewTeam | `getTeam` |
| GET | `/pulse/settings` | org admin | `getOrgSettings` |
| GET | `/pulse/low-hours?...` | org admin | `getLowHours` |
| GET | `/pulse/low-hours/senders` | org admin | `getEmailSenders` |
| POST | `/pulse/low-hours/send` | org admin | `sendLowHoursEmails` |
| GET | `/pulse/low-hours/history?limit` | org admin | `getLowHoursHistory` |
| PATCH | `/pulse/users/:id` | manage users | `updateUser` |
| POST | `/pulse/users` | provision | `users.controller` |
| * | `/pulse/access-grants/*` | delegated visibility | access-grants module |
| * | `/pulse/ai-analysis/*` | AI ops | screenshot-ai |

**Visibility:** `visibleEmployeeIds` — admin/super → all; else access-grant targets + self; else self.

### Activity levels score (extra)

```
tracked_minutes = GREATEST(COUNT(*) * 5, 1)   // assumes ~5 min per screenshot
score = (clicks + keys) / tracked_minutes
high  if score ≥ high_activity_threshold (default 60)
low   if score < low_activity_threshold (after clamp ≤10)
else medium
```

Uses **clamped** low threshold from org settings.

---

## 11. Low-hours emails

**Service:** `getLowHours` / `sendLowHoursEmails`  
**Templates:** `low-hours-email-templates.ts`  
**Log table:** `time_doctor.low_hours_email_log` (period fields in `011`, widened hours in `013`)

### Who appears on the list? → **tracked** hours only

| Period | Default target | Listed when |
|--------|----------------|-------------|
| `day` | **8h** (`resolveDailyHoursThreshold`; ignores org `hours_threshold` unless override 1–8) | `hours_worked < 8` |
| `week` | **40h** (override 1–40) | tracked &lt; threshold |
| `pace` (default) | Week N of month: **N × 35h** from first Monday through Fri of week N (capped at today); cutoff = `threshold × pace_percent/100` (pace 50–100, default 100) | `hours_worked < cutoff` |

### What the email body optimizes toward → often **effective**

- `DAILY_EFFECTIVE_TARGET_HOURS = 7`
- Day emails: remaining/pace use **effective vs 7h** (`useEffectiveGoal: true`)
- Week/pace emails: remaining vs **tracked** expected (35/70/… or 40), but day rows may still show effective vs 7h On track/Behind
- Copy may state payroll ≈ tracked − non-effective; salary eligibility ≈ **7h effective/day**

### Threshold inconsistency matrix (footgun)

| Concept | Default | Metric |
|---------|---------|--------|
| Workspace `hours_threshold` | **7** | Tracked — daily grid / not-tracking `below_threshold` |
| Day low-hours **list** | **8** | Tracked |
| Day email **goal** | **7** | Effective |
| Pace week N | **35 × N** | Tracked |
| Sync settings default `low_activity` | **10** | Percent (migration JSON may say 30; Pulse clamps ≤10) |

An employee can be **off** the low-hours list (tracked ≥ cutoff) yet appear “Behind” on effective if included by other means — list filter is tracked-only.

CC patterns (templates/service): e.g. `alysonclient@cintara.ai`, `mohita@cintara.ai`, optional manager.

---

## 12. Admin mutations via `/data` (weaker than sync)

| Path | Mutation | Guard difference |
|------|----------|------------------|
| `PATCH /data/time-logs/:id` → `closeTimeLog` | Set `end_time` + `completed` for open logs | Admin; **no GREATEST / no 30s floor** — can differ from sync semantics |
| `GET /data/screenshots` | List: `thumb_url` only unless `full=1` or no thumb; default limit 200 | JWT |
| `GET /data/screenshots/:id` | Original `image_url` for lightbox | JWT |
| `DELETE /data/screenshots/:id` | Deduct + delete (same midpoint formula, MAX 240) | JWT |
| `DELETE /data/projects/:id` | Nulls `time_logs.project_id` / idle project FK | Durations unchanged |
| Project assignment CRUD | Assignments only | — |

Reads: `listTimeLogs`, `listTimeLogEvents` (audit with before/after deducted, etc.).

---

## 13. `time_log_events` audit (migration 014)

- Trigger on `time_logs` INSERT/UPDATE → audit rows (`create`, `update`, `close`, …)
- Flags when wall duration **shortens**: `shortened`, `duration_delta_seconds`
- Desktop may also insert breadcrumbs (`cpu_sample`, etc.) via `insert_time_log_events`
- List API supports filtering (e.g. `?action=cpu_sample`)

Use this table when investigating silent cuts: look for shortened sessions and `authorized_idle_cut` metadata in desktop updates.

---

## 14. Time-merge algorithm

**File:** `backend/src/lib/time-merge.ts`

- Sort intervals by start
- Merge if overlapping or adjacent (`current.start <= last.end`)
- Open sessions: end = `Date.now()`
- Skip invalid `end <= start`
- Hours to 1 decimal

Purpose: multi-device double-count protection for Pulse daily hours.

---

## 15. Desktop offline queue behavior (backend implications)

If offline flush fails or is delayed:

- Server may be missing sessions that the tray already showed
- Later upsert lengthens (`GREATEST` end) — usually safe
- Later create with new UUID can **duplicate** if client regenerates id incorrectly
- Temp IDs (`temp-*`) must be remapped on successful create — failures leave local-only history
- Empty remote `get_today_time_logs` must not rewind desktop floors (desktop guards this)

Sync manager never drops time-log queue items (payroll). Enhanced sync may pressure-shed non-time buckets.

---

## 16. Formula cheat sheet

```text
# Effective (canonical)
non_effective_hours = min(total_hours, low_activity_hours + idle_hours)
effective_hours     = total_hours - non_effective_hours

# Tracked (Pulse daily)
Σ merge( clip(session, PacificDay) ) / 3600

# Low activity (Pulse)
count(sustained LOW shots) × (screenshot_interval_minutes / 60)
where activity_percent < min(settings.low_activity_threshold, 10)
  and not video_meeting

# Idle (Pulse)
prefer idle_logs duration ≥ 300s, clipped by Pacific day
else sum(time_logs.idle_seconds) on session start day

# Authorized idle cut (desktop → update_time_log)
end_time = max(session_start, now - 10 minutes)
authorized_idle_cut = true
server: end = GREATEST(start + 30s, clientEnd)  # may shorten vs prior end

# Screenshot delete deduction
midpoint interval seconds, capped at 240, ADDED to deducted_seconds

# Pace low-hours list
MTD Mon₁…Fri_N hours_worked < (N × 35) × (pace_percent / 100)
```

---

## 17. Known mismatch / risk register

1. **Pulse ignores `deducted_seconds`** for hours/effective; TimeDoctor and screenshot delete do not.
2. **Desktop effective ≠ Pulse effective** (idle source, 5m floor, streak, meetings).
3. **Idle attribution across midnight** differs (desktop pro-rate vs Pulse start-day dump).
4. **Non-effective double-count** (low + idle summed).
5. **Threshold soup:** settings 7 vs day list 8 vs effective goal 7 vs pace 35×N.
6. **Project hours** vs **daily hours** (raw sum vs merge).
7. **`daily_activity_summary` UTC** vs Pacific reporting.
8. **Sync default `low_activity_threshold: 10`** vs older migration JSON `30` (Pulse clamps ≤10).
9. **Open sessions** inflate “today” until closed; 3-day lookback can still miss very long abandoned sessions depending on query.
10. **`reconcile_inflated_time_logs` no-op** — no server auto-heal for inflation.
11. **Admin closeTimeLog** bypasses sync monotonic helpers.
12. **API-key sync trust model** — agent asserts `user_id`; compromise of key = forge hours.
13. **Orphan S3 screenshots** if complete fails after PUT.
14. **`insert_idle_log` duration field aliases** — wrong field name → 0 duration rows.
15. **Soft pause** may confuse users who expect accrual to stop.
16. **Windows silent update** historically left app closed (fixed relaunch in 1.0.224 installer + bat) — looks like “tracking stopped” after update.
17. **High-water snap-down** when inflated local HW discarded — feels like silent eating even when DB was “correct.”
18. **Checkpoint writing end_time while active** (if ever reintroduced) blocks later idle cut.
19. **Orphan open session closed at NOW on next start** (historical bug): agent died ~01:50, row stayed open until 16:05 start → 14h+ credited. Mitigation: append-only `session_heartbeats` + `stale_session_flagged`; close only via local checkpoint / admin confirmation — **never auto-hard-stop from heartbeat alone**.

---

## 18. Env vars (backend pipeline)

| Var | Role |
|-----|------|
| `DATABASE_*` / `DATABASE_URL` | RDS / Proxy |
| `INTERNAL_API_KEY` | Desktop + AI workers |
| `COGNITO_*` | JWT verify / admin |
| `AWS_S3_SCREENSHOTS_BUCKET` / `PREFIX` / `AWS_REGION` | Screenshots |
| `AWS_S3_PRESIGN_PUT_TTL_SEC` | Presign PUT TTL |
| `ALLOWED_ORIGINS` | CORS |
| `WORK_TIMEZONE` | Default Pacific |
| `EMAIL_FROM` / `EMAIL_SENDERS` / `SES_EMAIL_FUNCTION_NAME` | Low-hours mail |
| `SCREENSHOT_AI_QUEUE_URL` / `SCREENSHOT_AI_ENABLED` | AI pipeline |
| `SERVERLESS_MODE=1` | Lambda |

---

## 19. Related docs

- `docs/ARCHITECTURE.md` — system + desktop recording
- `backend/API.md` — Loveable-oriented endpoint list (may lag code)
- `backend/docs/SCREENSHOT_AI_PIPELINE.md` — AI path
- `infra/sam/README.md` — deploy
- `db/README.md` / `db/prod/README.md` — migrations apply order
- `desktop-agent/docs/PERFORMANCE_SAFEGUARDS.md` — CPU safeguards

**Do not use as current truth:** root `system-architecture.md` (Supabase era).
