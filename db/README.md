# Database

PostgreSQL (AWS RDS) schema for Alyson Pulse. Screenshot binaries are stored in **S3**; only metadata lives here.

## Greenfield install

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

## Migrate existing TimeFlow database

```bash
psql "$DATABASE_URL" -f db/migrations/001_pulse_additive.sql
```

## Tables

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

## Views

- `daily_activity_summary` — dashboard aggregates
