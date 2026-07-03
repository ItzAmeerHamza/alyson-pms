# Background tasks

Small Node scripts for scheduled maintenance. Run via **AWS EventBridge → Lambda** or a cron host.

| Script | Schedule | What it does |
|--------|----------|--------------|
| `close-stale-sessions.mjs` | Hourly | Auto-close sessions open > 12h |
| `cleanup-screenshots.mjs` | Daily | Purge screenshots older than 90 days (RDS + S3) |

## Setup

```bash
cd tasks && npm install
```

## Run locally

```bash
export DATABASE_URL=postgresql://...
export AWS_S3_SCREENSHOTS_BUCKET=your-bucket
npm run close-stale-sessions
npm run cleanup-screenshots
```

## EventBridge

Point each rule at a Lambda that runs the corresponding script, or invoke via `node tasks/close-stale-sessions.mjs` in a container task.
