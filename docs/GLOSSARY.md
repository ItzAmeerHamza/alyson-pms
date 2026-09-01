# Glossary

Terms used in Pulse reports, the API, and Alyson PM. When two surfaces disagree, **Pulse (this API) is the report of record**.

| Term | Meaning |
|------|---------|
| **Session / time log** | One `time_doctor.time_logs` row: start, optional end, status (`active`, `paused`, `completed`, `auto_closed`). There is no separate sessions table. |
| **Tracked hours** | Wall-clock overlap of sessions on a **work day**, after authorized idle cuts and screenshot deductions, plus admin **adjustments**. This is “hours on the clock.” |
| **Idle hours** | Sum of `idle_logs.duration_seconds` in range. Desktop starts logging after ~60s with no input. Idle logging alone does **not** cut tracked time. |
| **Authorized idle cut** | Only if the “still working?” prompt was shown and timed out. Session `end_time` = now − 10 minutes. Flag: `authorized_idle_cut`. |
| **Low-activity hours** | Time attributed to screenshots whose `activity_percent` is below the workspace cutoff (Pulse clamps this to ≤10%). Video meetings are **excluded** on Pulse. |
| **Non-effective** | `min(tracked, idle + low-activity)`. Idle and low-activity can overlap; they are not two disjoint buckets. |
| **Effective hours** | `tracked − non-effective`. Used for pace / “was this productive?” — not a second payroll clock. |
| **Desktop effective** | Local estimate on the agent: `idle_seconds` on the time log + every screenshot under 10% × interval. **Does not** exclude meetings. Often harsher than Pulse. |
| **Deducted seconds** | Time removed when an admin deletes a screenshot (capture interval). Sync uses `GREATEST` so it never shrinks. |
| **Time adjustment** | Admin-only append-only add/remove for one employee × Pacific day (`/pulse/time-adjustments`). Day total = tracked + net adjustments, floored at 0. |
| **Work day / Pacific day** | Calendar day in the workspace timezone (default `America/Los_Angeles`). Overnight sessions split at that midnight. Not UTC. |
| **Activity %** | Clicks / keys / mouse in the screenshot window, 0–100, stored on the screenshot row. |
| **High / medium / low activity** | Bands from workspace `high_activity_threshold` (default 60) and `low_activity_threshold` (default 10). |
| **Hours threshold** | Default **7h** tracked per day. Flags “below threshold” and feeds low-hours email. |
| **Screenshot N-in-M** | Random **N** captures in **M** minutes (default 2 per 10). Derived interval ≈ `M / N` (5 min) for report math. |
| **Workspace** | Palisade/Pulse org. Settings live in `time_doctor.workspace_settings`. |
| **Pulse role** | `admin`, `manager`, `team_leader`, `employee` on `user_extensions.pulse_role`. |
| **Access grant** | Admin delegates visibility of named employees to a non-admin (team time, people, activity, screenshots). |
| **Device id** | Per-install id on the agent. Multi-device: each machine has its own sessions. |
| **Offline queue** | Local JSON until `POST /sync/desktop-action` succeeds. Time logs are never dropped. |
| **API key vs JWT** | Agent writes with `x-api-key` (`INTERNAL_API_KEY`). Palisade UI reads with Cognito (or Palisade) JWT. |
| **appId** | `com.alyson.work-time-agent`. Changing it resets Mac TCC permissions. |
| **Stable signing identity** | Self-signed **Alyson PM Code Signing**. Same cert across releases → Screen Recording / Accessibility persist. Not Apple notarized. |
