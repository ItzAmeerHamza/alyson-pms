# Alyson Pulse — Weekly & Monthly Pacing

Implements Alyson HR Time Dashboard pacing math on Pulse data (time_logs + leave ledger).

## Formulas (do not mix)

| | Weekly | Monthly |
|--|--------|---------|
| Target | 35h (prorated if mid-week `started_on`) | weekdays in period × **7h** |
| Worked | tracked + leave×**8** + non-leave adjustments | same |
| Sample | Mon…min(Thu, rollup) | all elapsed weekdays |
| Projected | `sum(sample) + avg(sample)` | `worked + avg × remainingWeekdays` |

Status: `target_met` \| `on_track` \| `behind` \| `at_risk` \| `critical` (same thresholds as HR).

## API

- `GET /pulse/pacing/weekly?day=YYYY-MM-DD`
- `GET /pulse/pacing/monthly?month=YYYY-MM` or `?start=&end=`

Admin/manager only. Company work TZ from `workspace_settings`.

## Leave credit

Pacing leave credit = **8h × leave weekday fraction** from `leave_events` + matching `team_leave_events`.

Team Time still uses leave **adjustments at 7h** — pacing does **not** re-add `source_type=leave` adjustments (avoids double-count).

## UI

- `/dashboard/alyson-pulse/pacing/weekly`
- `/dashboard/alyson-pulse/pacing/monthly`
