# Production DB cutover

Cognito can stay shared with QA. **Do not copy QA `user_id`s or workspace `511` blindly** — prod has its own integers.

## What tables alone miss

| Layer | Script |
|--------|--------|
| Schema + FKs | `apply_schema.sh` (migrations 002→011) |
| API grants | `01_grants_api_role.sql` |
| Settings + admin + project | `02_bootstrap_workspace.sql` |
| Verify | `03_verify.sql` |

Skip `migrations/001_pulse_additive.sql` (legacy TimeFlow `public.users`).

Do **not** run QA seeds (`003`, `004`, `006`, `012`) unchanged. Prefer Pulse UI invites after bootstrap. Adapt `012` only if an admin exists in Cognito but lacks `tenant.user` on **this** DB (look up Cognito `sub` with `admin-get-user`).

## Steps

### 1. Schema + grants

From repo root (VPN / bastion required for RDS Proxy):

```bash
export DATABASE_URL='postgresql://postgres:SECRET@PROD_PROXY_HOST:5432/revclouddb?sslmode=require'
bash db/prod/apply_schema.sh
```

Or in DBeaver (as owner), run in order:

1. `migrations/002_time_doctor_schema.sql`
2. `migrations/005_screenshot_interval_5min.sql`
3. `migrations/007_screenshot_ai_analysis.sql`
4. `migrations/008_access_grants.sql`
5. `migrations/010_project_delete_fk_actions.sql`
6. `migrations/011_low_hours_email_period.sql`
7. `db/prod/01_grants_api_role.sql`

### 2. Bootstrap workspace

1. Find prod workspace id: `SELECT id, name FROM tenant.workspace ORDER BY id;`
2. Edit `02_bootstrap_workspace.sql` — set `v_workspace_id`, `v_admin_email`, `v_project_name`
3. Run the file as a role that can write `time_doctor` + read `tenant`

Admin email must already exist in `tenant.user` with `profile_workspace` on that workspace.

### 3. Verify

```bash
psql "$DATABASE_URL" -f db/prod/03_verify.sql
```

### 4. Point API at prod DB

Copy [`infra/sam/deploy.env.prod.example`](../../infra/sam/deploy.env.prod.example) → `deploy.env` (or a separate prod env file), fill prod proxy / VPC / S3 / origins, then:

```bash
export STACK_NAME=alyson-time-doctor-api-prod
export ENVIRONMENT_NAME=prod
# ... then infra/sam/deploy.sh
```

Confirm `COGNITO_USER_POOL_ID` matches the shared pool. Point the production frontend at the new `ApiEndpoint`.

### 5. Smoke test

1. Login (shared Cognito)
2. Open Alyson Pulse for the bootstrapped workspace
3. Invite one user from User Management
4. Optional: desktop agent sync

Then bulk-onboard via UI.

## Do not copy from QA

- `time_logs`, screenshots, idle, email history
- Hard-coded workspace `511` / QA-only emails
