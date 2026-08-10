# Athena / Glue for tracked-time S3 exports

Exclude `_state/` from every table `LOCATION` — those keys are watermarks only.

Prod bucket: **`alyson-pm`**

## `time_logs` (canonical sessions)

**Location:** `s3://alyson-pm/tracked-time/time_logs/`  
**Format:** NDJSON (`.ndjson`) — one structured JSON object per line  
**Partition:** `dt` = UTC date of `updated_at`  
**Writer:** Lambda `alyson-time-doctor-time-logs-export-prod` every 15 minutes (also `tasks/export-time-logs.mjs`)

Example line:

```json
{"id":"…","user_id":1195,"workspace_id":511,"project_id":"…","device_id":"…","start_time":"2026-08-10T05:00:00.000Z","end_time":"2026-08-10T06:00:00.000Z","status":"completed","idle_seconds":0,"deducted_seconds":0,"duration_seconds":3600,"created_at":"…","updated_at":"…"}
```

Rows are mutable. The same `id` may appear in multiple partitions after updates.
Use the latest `updated_at` per `id` for hours queries:

```sql
CREATE EXTERNAL TABLE IF NOT EXISTS alyson_time_logs (
  id string,
  user_id bigint,
  workspace_id bigint,
  project_id string,
  device_id string,
  start_time string,
  end_time string,
  status string,
  idle_seconds int,
  deducted_seconds int,
  duration_seconds int,
  created_at string,
  updated_at string
)
PARTITIONED BY (dt string)
ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
LOCATION 's3://alyson-pm/tracked-time/time_logs/'
TBLPROPERTIES ('has_encrypted_data'='false');

MSCK REPAIR TABLE alyson_time_logs;

-- Latest snapshot per session (dedupe updates)
CREATE OR REPLACE VIEW alyson_time_logs_latest AS
SELECT *
FROM (
  SELECT
    t.*,
    row_number() OVER (PARTITION BY id ORDER BY updated_at DESC) AS rn
  FROM alyson_time_logs t
) x
WHERE rn = 1;

-- Hours recorded per user (completed / closed sessions)
SELECT
  user_id,
  round(sum(greatest(coalesce(duration_seconds, 0) - coalesce(idle_seconds, 0) - coalesce(deducted_seconds, 0), 0)) / 3600.0, 2) AS hours
FROM alyson_time_logs_latest
WHERE status IN ('completed', 'auto_closed')
GROUP BY user_id
ORDER BY hours DESC;
```

After new partitions appear, re-run `MSCK REPAIR TABLE alyson_time_logs;` (or add partitions via Glue crawler).

## `time_log_events` (append-only audit)

**Location:** `s3://alyson-pm/tracked-time/time_log_events/`  
**Format:** NDJSON (`.ndjson`)

```sql
CREATE EXTERNAL TABLE IF NOT EXISTS alyson_time_log_events (
  id bigint,
  created_at string,
  user_id bigint,
  time_log_id string,
  workspace_id bigint,
  action string,
  source string,
  device_id string,
  agent_version string,
  request_id string,
  old_start_time string,
  old_end_time string,
  old_status string,
  old_idle_seconds int,
  old_deducted_seconds int,
  new_start_time string,
  new_end_time string,
  new_status string,
  new_idle_seconds int,
  new_deducted_seconds int,
  duration_delta_seconds int,
  shortened boolean,
  meta string
)
PARTITIONED BY (dt string)
ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
LOCATION 's3://alyson-pm/tracked-time/time_log_events/'
TBLPROPERTIES ('has_encrypted_data'='false');

MSCK REPAIR TABLE alyson_time_log_events;
```

## Desktop diagnostic logs (JSONL)

**Location:** `s3://alyson-pm/logs/`  
**Format:** one JSON object per line (`.jsonl`)

```sql
CREATE EXTERNAL TABLE IF NOT EXISTS alyson_desktop_logs (
  ts string,
  level string,
  message string,
  user_id string,
  device_id string,
  workspace_id string,
  agent_version string,
  category string
)
PARTITIONED BY (
  dt string,
  workspace_id_part string,
  user_id_part string,
  device_id_part string
)
ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
LOCATION 's3://alyson-pm/logs/'
TBLPROPERTIES ('has_encrypted_data'='false');
```

Hive key layout from the desktop uploader:

`logs/dt={YYYY-MM-DD}/workspace_id={ws}/user_id={uid}/device_id={dev}/{agentVersion}.jsonl`

After adding partitions via crawler or `MSCK REPAIR`, map partition columns to query filters (`dt`, `user_id_part`, …). Body fields also include `user_id` / `device_id` for convenience.
