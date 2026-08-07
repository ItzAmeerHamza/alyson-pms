# Database

PostgreSQL (AWS RDS) for Alyson Pulse. Screenshot binaries are stored in **S3**; only metadata lives here.

**Current production shape (shared Palisade DB):** schema `time_doctor.*` + identity in `tenant.*` (not the standalone `public.users` greenfield docs below).

**Full column-level research doc:** [`docs/DB_SCHEMA.md`](../docs/DB_SCHEMA.md) (preferred over [`SCHEMA.md`](./SCHEMA.md), which uses legacy public naming).

## Production cutover (Palisade-shared DB)

Tables alone are not enough — you also need API grants, `workspace_settings`, Pulse admins, and a prod SAM stack pointed at the prod proxy.

See **[prod/README.md](prod/README.md)**:

```bash
export DATABASE_URL='postgresql://...@PROD_PROXY:5432/revclouddb?sslmode=require'
bash db/prod/apply_schema.sh
# edit db/prod/02_bootstrap_workspace.sql then:
psql "$DATABASE_URL" -f db/prod/02_bootstrap_workspace.sql
psql "$DATABASE_URL" -f db/prod/03_verify.sql
```

SAM prod env template: [`infra/sam/deploy.env.prod.example`](../infra/sam/deploy.env.prod.example).

Migrations used by the apply script (in order): `002`, `005_screenshot_interval`, `007`, `008`, `010`, `011`, then `prod/01_grants_api_role.sql`.  
**Skip** `001_pulse_additive.sql` on Palisade DBs. Do not paste QA seeds (`003`/`004`/`006`/`012`) without rewriting workspace ids.

## Greenfield install (legacy standalone schema)

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

## Migrate existing TimeFlow database (legacy)

```bash
psql "$DATABASE_URL" -f db/migrations/001_pulse_additive.sql
```

## Tables (legacy / SCHEMA.md naming)

| Table | Purpose |
|-------|---------|
| `organizations` | Company / tenant |
| `org_settings` | Hours threshold, activity bands |
| `users` | Employees, managers, Cognito link |
| `projects` | Time tracker projects |
| `employee_project_assignments` | Who can log to which project |
| `time_logs` | Work sessions |
| `screenshots` | Capture metadata + S3 key |
| `app_logs` | Application usage |
| `app_url_activity` | Browser URL slices |
| `idle_logs` | Idle periods |
| `low_hours_email_log` | Sent low-hours email history |

On the Palisade-shared DB these live under `time_doctor.*` with workspace/user FKs into `tenant.*`.

## Views

- `daily_activity_summary` — dashboard aggregates (`time_doctor.daily_activity_summary` on shared DB)
