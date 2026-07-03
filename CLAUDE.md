# Alyson Pulse

Monorepo for employee time tracking.

| Folder | Purpose |
|--------|---------|
| `backend/` | NestJS API — auth, data, pulse dashboards, desktop sync |
| `db/` | PostgreSQL schema and migrations |
| `tasks/` | Scheduled maintenance scripts |
| `desktop-agent/` | Electron desktop tracker |
| `infra/sam/` | AWS SAM (API Gateway + Lambda) |
| `scripts/` | Desktop release signing & GitHub uploads |

## Commands

```bash
npm run dev:backend      # API on :3000
npm run dev:desktop      # Electron agent
npm run build:backend
npm run db:migrate
```

Frontend is hosted on **Loveable** — not in this repo.
