import type { Handler } from 'aws-lambda';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { DatabaseService } from '../database/database.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
})
class CloseStaleSessionsAppModule {}

let db: DatabaseService | null = null;

async function getDb(): Promise<DatabaseService> {
  if (!db) {
    const app = await NestFactory.createApplicationContext(CloseStaleSessionsAppModule, {
      logger: ['error', 'warn', 'log'],
    });
    db = app.get(DatabaseService);
  }
  return db;
}

interface OpenRow {
  id: string;
  user_id: number;
  workspace_id: number | null;
  device_id: string | null;
  start_time: Date | string;
  last_liveness: Date | string;
}

/**
 * EventBridge sweep: close open sessions whose agent stopped proving it was alive.
 *
 * This is the only close path that does not run on the employee's machine. A
 * slept, crashed or offline agent cannot report itself broken — before this,
 * such rows stayed open and were later closed at NOW, billing the entire gap.
 *
 * SAFETY: this job can destroy real payroll if the liveness signal itself breaks
 * (heartbeat endpoint down, agents offline en masse, client clock skew). Three
 * guards, in order of importance:
 *
 *  1. Circuit breaker — if an implausible share of open sessions look stale, the
 *     signal is broken, not the sessions. Abort and report; touch nothing.
 *  2. No-evidence guard — a session whose only timestamp is its own start_time
 *     tells us nothing. Never collapse it to start+grace; leave it for a human.
 *  3. Per-run cap — bounded blast radius if the first two are wrong.
 */
export const handler: Handler = async () => {
  const database = await getDb();
  const staleMinutes = Math.max(15, Number(process.env.STALE_AFTER_MINUTES) || 20);
  const graceSeconds = Math.max(30, Number(process.env.LIVENESS_GRACE_SECONDS) || 120);
  const maxCloses = Math.max(1, Number(process.env.MAX_CLOSES_PER_RUN) || 25);
  const breakerPct = Math.min(100, Math.max(1, Number(process.env.STALE_RATIO_ABORT_PCT) || 50));
  // Default to reporting only. Closing must be switched on deliberately.
  const dryRun = process.env.DRY_RUN !== 'false';

  const open = await database.query<OpenRow>(
    `SELECT t.id, t.user_id, t.workspace_id, t.device_id, t.start_time,
            COALESCE(t.last_alive_at, t.start_time) AS last_liveness
     FROM time_doctor.time_logs t
     WHERE t.end_time IS NULL
     ORDER BY t.start_time ASC
     LIMIT 500`,
  );

  const staleCutoff = Date.now() - staleMinutes * 60_000;
  const stale = open.rows.filter(
    (r) => new Date(r.last_liveness).getTime() < staleCutoff,
  );

  // Guard 1: fleet-wide staleness means our own signal died. Never mass-close.
  const staleRatio = open.rowCount ? (stale.length / open.rowCount) * 100 : 0;
  if (open.rowCount >= 4 && staleRatio >= breakerPct) {
    const msg =
      `ABORT: ${stale.length}/${open.rowCount} open sessions (${staleRatio.toFixed(0)}%) look stale — ` +
      `treating this as a liveness-signal outage, not dead sessions. Nothing was modified.`;
    console.error(msg);
    return {
      ok: false,
      aborted: 'circuit_breaker',
      message: msg,
      scanned: open.rowCount,
      stale: stale.length,
      stale_ratio_pct: Math.round(staleRatio),
      threshold_pct: breakerPct,
      closed: 0,
    };
  }

  const closed: Array<Record<string, unknown>> = [];
  const skipped: Array<Record<string, unknown>> = [];
  let minutesPrevented = 0;

  for (const row of stale) {
    if (closed.length >= maxCloses) {
      skipped.push({ id: row.id, reason: 'max_closes_per_run' });
      continue;
    }

    const liveMs = new Date(row.last_liveness).getTime();
    const startMs = new Date(row.start_time).getTime();

    // Guard 2: zero evidence since start. Could be a genuinely dead session, or
    // an agent that never managed to report at all. Closing it to start+grace
    // would erase a whole day's work, so flag it and move on.
    if (liveMs - startMs < 1000) {
      skipped.push({
        id: row.id,
        user_id: String(row.user_id),
        reason: 'no_evidence_since_start',
        start_time: new Date(startMs).toISOString(),
        note: 'Needs manual review — refusing to collapse to start_time',
      });
      continue;
    }

    // What closing at NOW (the old behaviour) would have billed beyond real work.
    const prevented = Math.max(0, Math.round((Date.now() - liveMs) / 60000));

    if (dryRun) {
      closed.push({
        id: row.id,
        user_id: String(row.user_id),
        last_liveness: new Date(liveMs).toISOString(),
        dead_for_minutes: prevented,
        applied: false,
      });
      minutesPrevented += prevented;
      continue;
    }

    const upd = await database.query<{ end_time: Date | string }>(
      `UPDATE time_doctor.time_logs t
       SET end_time = LEAST(
             NOW(),
             GREATEST(
               t.start_time,
               COALESCE(t.last_alive_at, t.start_time),
               COALESCE((SELECT MAX(h.seen_at) FROM time_doctor.session_heartbeats h
                          WHERE h.time_log_id = t.id), t.start_time),
               COALESCE((SELECT MAX(s.captured_at) FROM time_doctor.screenshots s
                          WHERE s.time_log_id = t.id), t.start_time),
               COALESCE((SELECT MAX(COALESCE(a.ended_at, a.started_at, a.timestamp))
                          FROM time_doctor.app_logs a WHERE a.time_log_id = t.id), t.start_time),
               COALESCE((SELECT MAX(COALESCE(u.ended_at, u.started_at))
                          FROM time_doctor.url_logs u WHERE u.time_log_id = t.id), t.start_time)
             )
           ),
           status = 'auto_closed',
           updated_at = NOW()
       WHERE t.id = $1 AND t.end_time IS NULL
       RETURNING t.end_time`,
      [row.id],
    );
    if (!upd.rows[0]) continue;

    try {
      await database.query(
        `INSERT INTO time_doctor.time_log_events
           (user_id, time_log_id, workspace_id, action, source, device_id, meta,
            new_end_time, new_status, shortened)
         VALUES ($1,$2,$3,'stale_session_auto_closed','close-stale-sessions-sweep',$4,$5::jsonb,$6,'auto_closed',TRUE)`,
        [
          row.user_id,
          row.id,
          row.workspace_id,
          row.device_id,
          JSON.stringify({
            reason: 'closed_at_last_liveness',
            last_liveness: new Date(liveMs).toISOString(),
            dead_for_minutes: prevented,
            grace_seconds: graceSeconds,
          }),
          upd.rows[0].end_time,
        ],
      );
    } catch (_) {
      /* audit is best-effort */
    }

    minutesPrevented += prevented;
    closed.push({
      id: row.id,
      user_id: String(row.user_id),
      session_minutes: Math.round((liveMs - startMs) / 60000),
      last_liveness: new Date(liveMs).toISOString(),
      end_time: upd.rows[0].end_time,
      dead_for_minutes: prevented,
      applied: true,
    });
  }

  return {
    ok: true,
    mode: dryRun ? 'dry_run' : 'close_at_last_liveness',
    stale_after_minutes: staleMinutes,
    grace_seconds: graceSeconds,
    scanned: open.rowCount,
    stale: stale.length,
    closed: closed.length,
    skipped: skipped.length,
    minutes_prevented: minutesPrevented,
    sessions: closed,
    needs_review: skipped,
  };
};
