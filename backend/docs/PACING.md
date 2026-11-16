# Alyson Pulse — Weekly & Monthly Pacing

Implements Alyson HR Time Dashboard pacing math on Pulse data (time_logs + leave ledger).

## Formulas (do not mix)

| | Weekly | Monthly |
|--|--------|---------|
| Target | 35h, minus 7h per public-holiday weekday (prorated if mid-week `started_on`) | required weekdays × **7h** (a public holiday is not required) |
| Worked | tracked + personal leave×**8** + non-leave adjustments. Hours tracked on a holiday still count. | same |
| Sample | Mon…min(Thu, rollup). A holiday with no tracked time is left out; a worked holiday stays in. | elapsed required weekdays, same holiday rule |
| Projected | `sum(sample) + avg(sample)` | `worked + avg × remainingWeekdays` |

Status: `target_met` \| `on_track` \| `behind` \| `at_risk` \| `critical` (same thresholds as HR).

## API

- `GET /pulse/pacing/weekly?day=YYYY-MM-DD`
- `GET /pulse/pacing/monthly?month=YYYY-MM` or `?start=&end=`

Admin/manager only. Company work TZ from `workspace_settings`.

## Leave credit

Pacing leave credit = **8h × leave weekday fraction** for personal leave and non-holiday team leave.

A public holiday is not a leave credit. It removes that weekday from the target (7h). Hours tracked on the holiday still count as worked. Weekly and monthly pacing emails use each row's adjusted target.

Team Time does not add the old flat holiday adjustment. Personal leave adjustments stay at **7h**. Pacing does **not** re-add `source_type=leave` adjustments (avoids double-count).

## UI

- `/dashboard/alyson-pulse/pacing/weekly`
- `/dashboard/alyson-pulse/pacing/monthly`
