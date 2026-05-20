# TimeFlow — System Architecture

This document describes the **high-level architecture** and **technical nuances** of the TimeFlow monorepo: desktop agent (Electron), web admin (React), NestJS backend, and Supabase (database, auth, storage, realtime, edge functions).

---

## 1. Purpose and scope

**TimeFlow** is an employee time-tracking and productivity monitoring system. It collects **time sessions**, **screenshots**, **application focus**, **URL activity**, **input activity**, and optional **idle** signals from a desktop agent, persists them in **Supabase Postgres** and **object storage**, and surfaces them to administrators through a **web admin** dashboard with **near-real-time** updates.

The **NestJS backend** is a complementary service for **queues**, **cron-style scheduling** (historically Nest `ScheduleModule`; production scheduling may lean on Supabase/pg_cron per code comments), **GraphQL/API** integrations, **AI analysis orchestration**, and **notifications**.

---

## 2. Logical architecture (high level)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Employee workstation                              │
│  ┌──────────────────────┐                                                    │
│  │  Desktop Agent       │  Captures screenshots, apps, URLs, idle, input      │
│  │  (Electron / Node)    │                                                    │
│  └──────────┬───────────┘                                                    │
└─────────────┼───────────────────────────────────────────────────────────────┘
              │
              │  HTTPS + Supabase Auth (JWT) + anon key
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Supabase (hosted)                                   │
│  • Postgres (canonical data + RLS)                                            │
│  • Storage (screenshot blobs, bucket typically `screenshots`)                  │
│  • Auth (users/sessions; JWT for clients)                                     │
│  • Realtime (postgres_changes → browser)                                     │
│  • Edge Functions (secure writes, AI, reports, cron hooks, …)                   │
└─────────────┬───────────────────────────────┬───────────────────────────────┘
              │                               │
              │  supabase-js (authenticated)    │  service role inside Edge Fn only
              ▼                               ▼
┌─────────────────────────────┐     ┌─────────────────────────────────────────┐
│  Web Admin (SPA)             │     │  NestJS Backend (optional / parallel)    │
│  React + Vite + TanStack Query│     │  Bull/Redis queues, REST/GraphQL,       │
│  Direct Postgres reads/writes │     │  invokes Edge Functions for heavy AI      │
│  via RLS-scoped user session │     │                                         │
└─────────────────────────────┘     └────────────────────────────────────────────┘
```

**Important nuance:** Most **day-to-day CRUD and reporting** in the web app talks to **Supabase directly** with the logged-in user’s JWT. The **Nest backend** is **not** in the hot path for every page load; it handles **asynchronous and privileged** workflows (queues, some AI triggers, integrations).

---

## 3. Repository layout (physical)

| Path | Role |
|------|------|
| `/web` | Web portal — React + Vite (`web/src`), shadcn/ui, Supabase client |
| `/desktop-agent` | Electron app — capture, sync, IPC, platform code under `src/platform/*` |
| `/backend` | NestJS API — modules, Bull workers, GraphQL schema |
| `/supabase` | Migrations, Edge Functions (`supabase/functions`), config (shared) |
| `/tests` | Cross-cutting tests (including desktop-oriented specs where present) |

---

## 4. Supabase — the system of record

### 4.1 Postgres

Core tables include (non-exhaustive; names evolve with migrations):

- **`time_logs`** — work sessions (`start_time` / `end_time`, idle flags, project linkage).
- **`screenshots`** — metadata row per capture: `user_id`, `time_log_id`, `captured_at`, `image_url`, `file_path`, activity percentages, perceptual hash fields (when used), AI/vision flags, etc.
- **`app_logs`** — foreground application / window context over time.
- **`app_url_activity`** (and sometimes legacy **`url_logs`** naming in code paths) — browser URL activity.
- **`tracking_status_logs`** — granular tracking/idle transitions for live UI.
- **`users`**, **`projects`**, **`organizations`** — multi-tenant and RBAC-related data (see migrations such as `multi_tenant_organizations`).

**Row Level Security (RLS)** is the **authoritative** access control. The web app may filter by organization in TypeScript for UX, but **policies on the database** determine what each role can read/write.

### 4.2 Storage

Screenshot **bytes** live in a Storage bucket (commonly named **`screenshots`**). The **`screenshots`** table stores a **public URL** and/or **storage path** so the UI can render or request a **signed URL** when needed.

### 4.3 Realtime

The web portal subscribes to **`postgres_changes`** on specific tables (e.g. `screenshots`, `app_logs`, `app_url_activity`, `tracking_status_logs`, `time_logs`) filtered by `user_id`, so new rows appear without a full page reload. Implementation lives under `src/integrations/supabase/live.ts` and hooks such as `src/hooks/live/useLiveTracking.ts`.

**Nuance:** Realtime targets **tables**, not views — comments in code warn that views do not stream the same way.

### 4.4 Edge Functions

Functions under `supabase/functions/*` implement:

- **Secure server-side writes** for the desktop (e.g. **`desktop-sync`**) — validates the user JWT, then uses **service role** only on the server to upload storage and insert rows.
- **AI and analysis** (e.g. **`ai-screenshot-analyzer`**, batch/session flows).
- **Email / reports / alerts** (e.g. **`email-reports`**, **`auto-send-reports`**, **`daily-hours-alert`**).
- **Operational** endpoints (e.g. **`system-health`**, cleanup).

CORS and origin allowlists follow the `ALLOWED_ORIGINS` pattern documented in security rules.

**Deployment nuance:** The repo lists many functions; some names are **invoked** from backend or web (e.g. `ai-session-analyst`) that may exist only on the **hosted** Supabase project if not committed here—verify deployed function names against `supabase functions list` for your project.

---

## 5. Desktop agent — how it works

### 5.1 Runtime and responsibilities

- **Electron** main process coordinates **tracking**, **permissions**, **screenshot capture** (platform-specific modules), **app/URL detection**, **anti-cheat / idle** logic, and **Supabase auth session** handling.
- **Renderer** process is locked down per security rules (`nodeIntegration: false`, `contextIsolation: true`); communication via **IPC**.
- **Credentials** must not live in `localStorage`; use OS keychain patterns (e.g. keytar) where applicable.

### 5.2 Auth and configuration

The agent is configured with **Supabase URL** and **anon key** (from generated `env-config` / build pipeline). Employees sign in; the **access token** is used for authenticated calls.

### 5.3 Data capture pipeline

1. **Capture subsystems** produce buffers and metadata (timestamps, app name, window title, input aggregates, blur flags, etc.).
2. **`SyncManager`** (see `desktop-agent/src/modules/sync/sync-manager.js`) maintains an **offline queue** on disk (`offline-queue.json` under the app data directory) for resilience.
3. On a timer (e.g. ~10s sync loop), queued items are flushed:
   - **Preferred path:** HTTP `POST` to **`/functions/v1/desktop-sync`** with `Authorization: Bearer <access_token>` and JSON `{ action, data }`.
   - Actions include **`upload_screenshot`**, **`insert_app_logs`**, **`insert_url_logs`**, **`insert_idle_log`**, **`upsert_time_log`**, **`update_time_log`**, **`insert_fraud_alert`**, **`insert_activity_stats`**, etc.

### 5.4 Screenshot persistence (two patterns to know)

1. **Edge-mediated (primary intent for security):** `desktop-sync` decodes Base64, **uploads** to Storage bucket `screenshots`, builds **public URL**, **inserts** into `screenshots` with metadata. **Service role never ships inside the Electron binary.**

2. **Direct client upload (legacy / alternate modules):** `desktop-agent/src/modules/utils/screenshot-storage.js` can call `storage.from('screenshots').upload(...)` then `from('screenshots').insert(...)`. Whether this runs in production depends on **which screenshot manager** path is wired; the sync-manager commentary explicitly favors **edge** writes.

### 5.5 Ordering and FK constraints

The sync pipeline **prioritizes `time_logs`** so dependent rows referencing `time_log_id` are less likely to hit foreign-key failures; retries and drops are logged when queues exceed retry limits.

### 5.6 Networking hardening

`main.js` includes **DNS workarounds** (custom resolver ordering, fallback) to reduce Electron-specific connectivity failures in the field—a **deployment/reliability nuance**, not business logic.

---

## 6. Web admin — how data reaches the UI

### 6.1 Primary transport: Supabase JS client

- **Single client:** `src/integrations/supabase/client` (aggregates env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
- Pages and hooks overwhelmingly use **`supabase.from(...).select/insert/update`** under domain conventions (`src/domains/**` services for new work; legacy pages may call Supabase inline).

### 6.2 Server state

**TanStack React Query** wraps many reads (`useQuery` / `useMutation`) for caching, refetch, and staleness policies.

### 6.3 Live / “real-time” dashboards

For **today’s snapshot** patterns:

1. **Initial load:** `fetchTodaySnapshot` aggregates queries across `screenshots`, `app_logs`, `app_url_activity`, `tracking_status_logs`, and `time_logs` (`src/integrations/supabase/live.ts`).
2. **Streaming updates:** `subscribeLiveToday` opens a Supabase Realtime channel and pushes inserts/updates into React state (`useLiveTracking`).
3. **Worked time smoothing:** **`time_logs`** changes trigger **refetch**; a **30s interval** may also refresh totals so ongoing sessions tick forward without overloaded realtime payloads.

### 6.4 Invoking Edge Functions from the browser

Some admin features call **`supabase.functions.invoke('function-name', { body })`** (e.g. health, email/report actions, aggregate analysis endpoints). Those execute **server-side Deno functions** but are triggered from the SPA with user auth context per function design.

### 6.5 Optional Nest backend from the SPA

Few places use **`fetch('/api/...')`** relative URLs (e.g. email report history stubs). Static hosts (see `vercel.json`) **do not** define a default proxy to Nest—those routes require a **reverse proxy**, **serverless adapter**, or **direct absolute URL** to the API host in production. Treat **Supabase** as the **primary** integration surface unless you explicitly wire the Nest origin in your deployment.

### 6.6 Security expectations (web)

- Sanitize user-provided strings before render or downstream calls (`sanitizeInput` patterns per project rules).
- Avoid `dangerouslySetInnerHTML` with untrusted content.
- CSP / security headers appear in `vercel.json`, `netlify.toml`, and related deployment configuration.

---

## 7. NestJS backend — how it works

### 7.1 Process and modules

- Entry: `backend/src/main.ts` — **Helmet**, **CORS allowlist** via `ALLOWED_ORIGINS`, **ValidationPipe** (`whitelist`, `forbidNonWhitelisted`), **Swagger** only outside production.
- **GraphQL** (Apollo) can be disabled in tests via `DISABLE_GRAPHQL=1`.
- **Bull** connects to **Redis** (`REDIS_HOST`, `REDIS_PORT`, …) for job queues.
- Feature modules include **AI analysis**, **screenshots**, **insights**, **notifications**, **reports**, **workers**, **cron** (compatibility), **auth**, **common** (Supabase service wrapper, pub/sub).

### 7.2 Workers and queues

Processors under `backend/src/workers/**` handle jobs such as:

- **AI screenshot analysis** — often **`supabase.functions.invoke('ai-screenshot-analyzer', …)`** (and batch/session helpers).
- **Activity / anomaly / duplicate detection pipelines.**
- **Notification pushing.**

**Architectural nuance:** Heavy **model inference** for AI usually runs inside **Supabase Edge** (or external APIs called from Edge), **not** on the Nest CPU, unless you add separate inference services. Nest is frequently the **orchestrator** and **retry** layer.

### 7.3 Redis pub/sub

`PubSubService` uses **ioredis** with a test/offline bypass (`SKIP_REDIS` / test env). This supports scalable fan-out patterns distinct from Postgres Realtime consumed by browsers.

### 7.4 Scheduling comment

`app.module.ts` notes that **`ScheduleModule`** remains for compatibility while **scheduled tasks may be delegated to Supabase pg_cron** in production operations—verify which environment owns each schedule before changing behavior.

### 7.5 Local backend topology

`backend/docker-compose.yml` runs **`api`** + **`redis`** containers; Supabase remains an **external** dependency configured via `.env`.

---

## 8. AI and analysis (cross-cutting)

Typical chain:

1. Screenshot lands in Storage + **`screenshots`** row.
2. Flags like **`needs_vision_validation`** may route rows throughvalidators / duplicate logic (desktop or backend processors).
3. **Edge function** **`ai-screenshot-analyzer`** (large implementation in repo) analyzes image/content and persists derived fields — exact columns depend on migrations.
4. **Backend queue** may enqueue backlog/retry analysis controlled by **`ai-analysis`** module and cron-like schedulers.

**Scale nuance:** cost and latency concentrate in **Edge + external APIs** + **storage egress**, not purely in Postgres row size.

---

## 9. Multi-tenancy and roles

Organizations and roles are modeled in Postgres (see migrations under `supabase/migrations/`). Typical pattern:

- **`users.organization_id`** links employees to tenants.
- **Admin vs manager vs employee** capabilities enforced with RLS referencing **`public.users`**, **not** writable `auth` metadata (security rule).

---

## 10. Build, release, and operations

### 10.1 Web admin

- Dev: `npm run dev` from repo root (runs `web/` on port **8080** by convention).
- Build: static output in `dist/` suitable for CDN hosting.

### 10.2 Desktop agent

- Scripts for **Mac DMG**, **Windows EXE**, **Linux AppImage** via electron-builder.
- **Signing / notarization** (macOS) and **EV signing** (Windows) are mandated for production distribution (see project release documentation under `.cursor/rules` and scripts).

### 10.3 Backend

- `npm run start:dev` — watch mode.
- Production: Node process exposing **PORT** (default **3000**).

---

## 11. Environment variables (conceptual groups)

### Web (`VITE_*`)

- **`VITE_SUPABASE_URL`**, **`VITE_SUPABASE_ANON_KEY`** — required for build/runtime.
- **`VITE_ADMIN_ONLY`** — optional build mode gate.

### Desktop agent

- Supabase URL/key via generated config; never embed **service_role** in shipped builds.

### Backend

- **`ALLOWED_ORIGINS`**, **`PORT`**, Redis settings, **`NODE_ENV`**, **`DISABLE_GRAPHQL`**, **`SKIP_REDIS`**, Supabase **`SUPABASE_URL` / keys** as used by server-side SDK and `functions.invoke`.

### Edge Functions

- **`ALLOWED_ORIGINS`**, **`SUPABASE_URL`**, **`SUPABASE_ANON_KEY`**, **`SUPABASE_SERVICE_ROLE_KEY`** (server-only inside function), integration secrets for AI/email providers via Supabase secrets UI.

Exact names should be validated against `.env.example` files per component.

---

## 12. Security model (summary)

| Layer | Responsibility |
|------|----------------|
| **Supabase Auth** | Identity; JWT for browsers and desktop |
| **RLS policies** | Enforce tenant/role data access |
| **`desktop-sync` Edge** | Trusted writes without shipping service credentials to clients |
| **Nest guards / validation** | API hardening when backend exposed |
| **Storage policies** | Who may read/write screenshot objects |

Operational rule of thumb:** treat any **RLS regression** as a severity issue; UX-side filtering is not sufficient.

---

## 13. Known technical nuances / footguns

1. **Dual screenshot upload paths:** Edge (`desktop-sync`) vs direct Storage upload helper—know which executor your production bundle uses.

2. **Schema drift tolerance:** Frontend helpers (e.g. `coalesceTimestamp`, dual column names such as `captured_at` vs `started_at`) exist because **historic migrations** diversified column naming; prefer aligning schema over long-term plural fallbacks.

3. **Realtime vs views:** Subscribe to tables, not dashboard views.

4. **Cron ownership:** Confirm whether Nest `ScheduleModule`, Supabase schedules, or external workers trigger each nightly job.

5. **Relative `/api/*` frontend calls:** require infrastructure to forward to Nest; default static hosting configs may not.

6. **Function inventory:** Repo count of Edge Functions may differ from **deployed** project; validate `invoke` targets exist in production Supabase.

---

## 14. When to read what next

| Question | Starting point |
|----------|----------------|
| Offline sync & queue semantics | `desktop-agent/src/modules/sync/sync-manager.js` |
| Secure desktop writes | `supabase/functions/desktop-sync/index.ts` |
| Portal live feed | `src/integrations/supabase/live.ts`, `src/hooks/live/useLiveTracking.ts` |
| AI queue orchestration | `backend/src/workers/*.processor.ts`, `backend/src/cron/` |
| DB truth & policies | `supabase/migrations/**` |

---

## 15. Document maintenance

Update this file when:

- You add a new **transport** between UI and backend (e.g. explicit `VITE_API_URL`).
- You change **cron ownership** or retire Nest scheduling.
- You consolidate screenshot upload paths.
- You materially change **RLS** or **multi-tenant** rules affecting all three clients.

---

*Generated for the TimeFlow monorepo. For security-sensitive database work, follow `.cursor/rules/supabase-security.mdc` and migrate with tracked, reviewed SQL.*
