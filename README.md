# Alyson Pulse

Minimal employee time tracking: **desktop agent** captures work data, **API** serves the Loveable dashboard, **RDS** stores relational data, **S3** stores screenshots.

## Repository layout

```
alyson-pulse/
├── backend/        NestJS REST API (Lambda-ready)
├── db/             PostgreSQL schema & migrations
├── tasks/          Scheduled jobs (stale sessions, screenshot cleanup)
├── desktop-agent/  Electron tracker for macOS / Windows
├── infra/          AWS SAM template (API Gateway + Lambda)
└── scripts/        Desktop app release & signing
```

## Quick start

### API (local)

```bash
cd backend
cp .env.example .env   # DATABASE_URL, Cognito, S3, INTERNAL_API_KEY
npm install
npm run start:dev
```

Swagger (dev): http://localhost:3000/api  
API reference: [backend/API.md](backend/API.md)

### Database

```bash
# New RDS
npm run db:schema

# Existing TimeFlow DB
npm run db:migrate
```

See [db/README.md](db/README.md).

### Desktop agent

```bash
cd desktop-agent
cp .env.example .env
npm install
npm start
```

### Background tasks

```bash
cd tasks && npm install
DATABASE_URL=... npm run close-stale-sessions
```

See [tasks/README.md](tasks/README.md).

## Deploy

- **API:** `infra/sam/template.yaml` — container Lambda + HTTP API
- **Frontend:** Loveable (separate project)
- **DB:** AWS RDS PostgreSQL
- **Screenshots:** S3 private bucket with presigned URLs

## What was removed

- Legacy web portal (`web/`)
- Supabase edge functions & migrations
- AI / vision analysis pipeline
- Bull/Redis workers, GraphQL, HR/payroll modules
