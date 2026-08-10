# Background tasks

Small Node scripts for scheduled maintenance. Run via **AWS EventBridge → Lambda** or a cron host.

| Script | Schedule | What it does |
|--------|----------|--------------|
| `close-stale-sessions.mjs` | Hourly | Auto-close sessions open > 12h |
| `cleanup-screenshots.mjs` | Daily | Purge screenshots older than 90 days (RDS + S3) |
| `export-tracked-time-events.mjs` | Every 15 min | Incrementally export `time_log_events` to S3 as NDJSON (`tracked-time/time_log_events/dt=YYYY-MM-DD/`) for Athena |
| `export-time-logs.mjs` | Every 15 min (also SAM Lambda `TimeLogsExportFunction`) | Incrementally export `time_logs` to S3 as structured NDJSON (`tracked-time/time_logs/dt=YYYY-MM-DD/`) for Athena |

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
npm run export-tracked-time-events
npm run export-time-logs
```

## S3 layout (Athena)

```
s3://{bucket}/tracked-time/time_log_events/dt=YYYY-MM-DD/part-….ndjson
s3://{bucket}/tracked-time/time_log_events/_state/watermark.json   # NOT in table LOCATION

s3://{bucket}/tracked-time/time_logs/dt=YYYY-MM-DD/part-….ndjson
s3://{bucket}/tracked-time/time_logs/_state/watermark.json         # NOT in table LOCATION

s3://{bucket}/logs/dt=YYYY-MM-DD/workspace_id=…/user_id=…/device_id=….jsonl
```

See [`athena/README.md`](./athena/README.md) for Glue/Athena DDL and dedupe notes.

## EventBridge

Point each rule at a Lambda that runs the corresponding script, or invoke via `node tasks/export-time-logs.mjs` in a container task.
