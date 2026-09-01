# Alyson Pulse

See [README.md](../README.md) for the product overview, [SETUP.md](../SETUP.md) for a new-machine setup, and [backend/API.md](../backend/API.md) for REST endpoints.

## Research docs (feed to GPT / investigators)

| Doc | Contents |
|-----|----------|
| [FEATURES.md](./FEATURES.md) | Pulse UI + API + Alyson PM feature guide |
| [GLOSSARY.md](./GLOSSARY.md) | Tracked / effective / idle / deductions |
| [ENV.md](./ENV.md) | Environment variables |
| [RUNBOOK.md](./RUNBOOK.md) | Support / debug |
| [RELEASE.md](./RELEASE.md) | Desktop release one-pager |
| [OPERATIONS.md](./OPERATIONS.md) | Privacy, devices, staging vs prod |
| [PULSE_UI.md](./PULSE_UI.md) | Add a Pulse page (Palisade-web) |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Monorepo, auth split, DB overview, desktop recording, idle cut, offline queues, dual-path hazards |
| [BACKEND_PIPELINE.md](./BACKEND_PIPELINE.md) | Full `desktop-action` catalog, screenshot deduction, Pulse/effective/idle/low-hours formulas, mismatch register |
| [DB_SCHEMA.md](./DB_SCHEMA.md) | Full `time_doctor` + `tenant` FK inventory, columns, indexes, triggers, migrations, research SQL |

## AWS RDS

Canonical production schemas are `time_doctor.*` + `tenant.*` (see [DB_SCHEMA.md](./DB_SCHEMA.md) and `db/migrations/002_time_doctor_schema.sql`).  
`db/schema.sql` / `db/SCHEMA.md` are legacy greenfield sketches — not what Nest sync writes.

Connection via `DATABASE_URL` or `DATABASE_HOST` + `DATABASE_PASSWORD` in the API Lambda.

## Lambda deployment

See [infra/sam/README.md](../infra/sam/README.md).
