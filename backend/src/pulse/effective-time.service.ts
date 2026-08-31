/**
 * The rules that decide which tracked minutes count as effective.
 *
 * These lived only inside PulseService, and the desktop agent carried its own
 * separate implementation. The two drifted: the agent counted every isolated
 * low-activity screenshot, counted video meetings against you, and treated any
 * pause over a minute as idle, none of which the web does. The same employee
 * read 24m non-effective on the web and 1h16m on the desktop on the same day.
 *
 * Worse, when idle and its own screenshots were found to be double-counted, the
 * bug had to be fixed twice because it existed independently in both places.
 *
 * One implementation, two consumers: PulseService for team reporting and
 * ForceSyncController for the desktop agent.
 */

import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { parseTenantUserId } from '../database/time-doctor-sql';
import {
  normalizeWorkTimezone,
  sqlWorkDate,
  workDateKey,
  workDayBoundsMs,
} from '../lib/work-timezone';
import { SCREENSHOT_IS_VIDEO_MEETING_SQL } from './meeting-context';
import { SCREENSHOT_IS_AI_CONFIRMED_PRODUCTIVE_SQL } from './ai-activity-floor';
import {
  intervalContains,
  mergeCapturedAtsIntoIntervals,
  subtractIntervals,
  type TimeInterval,
} from './meeting-intervals';

/**
 * Which workspace to restrict to, or null for no restriction (super admins, and
 * callers that have already narrowed to a single user). Mirrors what
 * workspaceScope() produces from a JWT, without requiring one.
 */
export interface WorkspaceFilter {
  workspaceId: number | null;
}

export interface IdleAndLowActivity {
  idleSeconds: number;
  lowActivitySeconds: number;
}

export type IdleLogRow = {
  user_id: string;
  idle_start: string | Date;
  idle_end: string | Date | null;
  duration_seconds: number | null;
};

export type ScreenshotActivityRow = {
  user_id: string;
  activity_date: string;
  captured_at: string;
  activity_percent: number | null;
  is_meeting: boolean;
  is_low: boolean;
};

@Injectable()
export class EffectiveTimeService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Idle shorter than this is a pause, not idle time, and is ignored.
   * The desktop agent starts *recording* idle after 60s so the raw periods
   * exist, but only sustained absence should count against someone.
   */
  static readonly MIN_IDLE_REPORT_SECONDS = 5 * 60;

  /**
   * Sustained quiet required before a low screenshot counts toward LOW hours.
   * At 1-min intervals, N=3 (three consecutive quiet minutes). At 10-min, N=1.
   */
  static readonly SUSTAINED_LOW_MINUTES = 3;

  sustainedLowStreakNeeded(intervalMinutes: number): number {
    const interval = Math.max(1, Number(intervalMinutes) || 1);
    return Math.max(1, Math.ceil(EffectiveTimeService.SUSTAINED_LOW_MINUTES / interval));
  }

  private scope(filter: WorkspaceFilter, alias: string): { clause: string; params: unknown[] } {
    if (!filter.workspaceId) return { clause: '1=1', params: [] };
    return { clause: `${alias}.workspace_id = $1`, params: [filter.workspaceId] };
  }

  /** Idle hours per user/day from time_logs.idle_seconds, bucketed by session start. */
  idleHoursFromTimeLogs(
    logs: Array<{ user_id: string; start_time: string | Date; idle_seconds: number | null }>,
    tz?: string,
  ): Map<string, Map<string, number>> {
    const workTz = normalizeWorkTimezone(tz);
    const byUserDay = new Map<string, Map<string, number>>();

    for (const log of logs) {
      const seconds = log.idle_seconds ?? 0;
      if (seconds <= 0) continue;

      const day = workDateKey(
        log.start_time instanceof Date ? log.start_time : new Date(log.start_time),
        workTz,
      );
      const hours = seconds / 3600;
      if (!byUserDay.has(log.user_id)) byUserDay.set(log.user_id, new Map());
      const dayMap = byUserDay.get(log.user_id)!;
      dayMap.set(day, (dayMap.get(day) ?? 0) + hours);
    }

    return byUserDay;
  }

  /**
   * Idle hours per user/day from idle_logs, clipped to work-day boundaries.
   * Periods shorter than MIN_IDLE_REPORT_SECONDS are dropped.
   */
  idleHoursFromIdleLogs(
    logs: Array<{
      user_id: string;
      idle_start: string | Date;
      idle_end: string | Date | null;
      duration_seconds: number | null;
    }>,
    tz?: string,
    meetingIntervalsByUser?: Map<string, TimeInterval[]>,
  ): Map<string, Map<string, number>> {
    const workTz = normalizeWorkTimezone(tz);
    const byUserDay = new Map<string, Map<string, number>>();

    for (const log of logs) {
      const startMs = new Date(log.idle_start).getTime();
      // Never end an open row at Date.now() — every Pulse poll would grow
      // non-effective, then a checkpoint with a real duration would snap it down.
      let endMs = log.idle_end ? new Date(log.idle_end).getTime() : NaN;
      if (log.duration_seconds && log.duration_seconds > 0) {
        const fromDuration = startMs + log.duration_seconds * 1000;
        if (!Number.isFinite(endMs) || fromDuration > endMs) endMs = fromDuration;
      }
      if (!(endMs > startMs)) continue;

      // Stamp the day even when every minute is later clipped as a meeting.
      // mergeIdleHours treats "key present" as "idle_logs exist"; a missing key
      // falls back to time_logs.idle_seconds, which still includes meeting idle.
      {
        let cursor = startMs;
        while (cursor < endMs) {
          const day = workDateKey(new Date(cursor), workTz);
          const { endMs: dayEnd } = workDayBoundsMs(day, workTz);
          if (!byUserDay.has(log.user_id)) byUserDay.set(log.user_id, new Map());
          const dayMap = byUserDay.get(log.user_id)!;
          if (!dayMap.has(day)) dayMap.set(day, 0);
          cursor = dayEnd;
        }
      }

      const meetings = meetingIntervalsByUser?.get(log.user_id) ?? [];
      const remaining = subtractIntervals({ startMs, endMs }, meetings);
      for (const piece of remaining) {
        const totalSeconds = Math.round((piece.endMs - piece.startMs) / 1000);
        if (totalSeconds < EffectiveTimeService.MIN_IDLE_REPORT_SECONDS) continue;

        let cursor = piece.startMs;
        while (cursor < piece.endMs) {
          const day = workDateKey(new Date(cursor), workTz);
          const { startMs: dayStart, endMs: dayEnd } = workDayBoundsMs(day, workTz);
          const clipStart = Math.max(piece.startMs, dayStart);
          const clipEnd = Math.min(piece.endMs, dayEnd);
          if (clipEnd > clipStart) {
            const hours = (clipEnd - clipStart) / 3600000;
            if (!byUserDay.has(log.user_id)) byUserDay.set(log.user_id, new Map());
            const dayMap = byUserDay.get(log.user_id)!;
            dayMap.set(day, (dayMap.get(day) ?? 0) + hours);
          }
          cursor = dayEnd;
        }
      }
    }

    return byUserDay;
  }

  async meetingIntervalsByUser(
    filter: WorkspaceFilter,
    start: string,
    end: string,
    intervalMinutes: number,
    userId?: string,
  ): Promise<Map<string, TimeInterval[]>> {
    const scope = this.scope(filter, 'ext');
    const params: unknown[] = [...scope.params, start, end];
    const startIdx = scope.params.length + 1;
    const endIdx = scope.params.length + 2;
    let userFilter = '';
    if (userId) {
      params.push(parseTenantUserId(userId));
      userFilter = `AND s.user_id = $${params.length}`;
    }
    const result = await this.db.query<{ user_id: string; captured_at: string }>(
      `SELECT s.user_id::text AS user_id, s.captured_at
       FROM time_doctor.screenshots s
       JOIN tenant."user" u ON u.id = s.user_id
       JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
       WHERE ${scope.clause}
         AND s.captured_at >= $${startIdx}::timestamptz
         AND s.captured_at < $${endIdx}::timestamptz
         AND ${SCREENSHOT_IS_VIDEO_MEETING_SQL}
         AND COALESCE(u.email, '') NOT ILIKE '%@example.com%'
         ${userFilter}
       ORDER BY s.user_id, s.captured_at ASC`,
      params,
    );
    const coverageMs = Math.max(1, Number(intervalMinutes) || 1) * 60 * 1000;
    const byUser = new Map<string, number[]>();
    for (const row of result.rows) {
      const ms = new Date(row.captured_at).getTime();
      if (!Number.isFinite(ms)) continue;
      if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
      byUser.get(row.user_id)!.push(ms);
    }
    const out = new Map<string, TimeInterval[]>();
    for (const [uid, times] of byUser) {
      out.set(uid, mergeCapturedAtsIntoIntervals(times, coverageMs));
    }
    return out;
  }

  /**
   * Idle windows this report counts (≥ 5 min). Matches the old per-screenshot
   * SQL overlap test so a low shot inside idle is not charged twice.
   */
  countedIdleIntervalsByUser(logs: IdleLogRow[]): Map<string, TimeInterval[]> {
    const byUser = new Map<string, TimeInterval[]>();
    for (const log of logs) {
      const startMs = new Date(log.idle_start).getTime();
      let endMs = log.idle_end ? new Date(log.idle_end).getTime() : NaN;
      if (log.duration_seconds && log.duration_seconds > 0) {
        const fromDuration = startMs + log.duration_seconds * 1000;
        if (!Number.isFinite(endMs) || fromDuration > endMs) endMs = fromDuration;
      }
      if (!Number.isFinite(endMs) || endMs <= startMs) continue;
      if ((endMs - startMs) / 1000 < EffectiveTimeService.MIN_IDLE_REPORT_SECONDS) continue;
      if (!byUser.has(log.user_id)) byUser.set(log.user_id, []);
      byUser.get(log.user_id)!.push({ startMs, endMs });
    }
    return byUser;
  }

  meetingIntervalsFromRows(
    rows: ScreenshotActivityRow[],
    intervalMinutes: number,
  ): Map<string, TimeInterval[]> {
    const meetingTimes = new Map<string, number[]>();
    for (const row of rows) {
      if (!row.is_meeting) continue;
      const ms = new Date(row.captured_at).getTime();
      if (!Number.isFinite(ms)) continue;
      if (!meetingTimes.has(row.user_id)) meetingTimes.set(row.user_id, []);
      meetingTimes.get(row.user_id)!.push(ms);
    }
    const coverageMs = Math.max(1, Number(intervalMinutes) || 1) * 60 * 1000;
    const out = new Map<string, TimeInterval[]>();
    for (const [uid, times] of meetingTimes) {
      out.set(uid, mergeCapturedAtsIntoIntervals(times, coverageMs));
    }
    return out;
  }

  lowActivityHoursFromRows(
    rows: ScreenshotActivityRow[],
    idleLogs: IdleLogRow[],
    intervalMinutes: number,
    tz?: string,
  ): Map<string, Map<string, number>> {
    const workTz = normalizeWorkTimezone(tz);
    const intervalHours = Math.max(1, Number(intervalMinutes) || 1) / 60;
    const streakNeeded = this.sustainedLowStreakNeeded(intervalMinutes);
    const meetingIv = this.meetingIntervalsFromRows(rows, intervalMinutes);
    const idleIv = this.countedIdleIntervalsByUser(idleLogs);

    type Shot = { activity_date: string; captured_at_ms: number; is_low: boolean };
    const byUserShots = new Map<string, Shot[]>();
    for (const row of rows) {
      const capturedMs = new Date(row.captured_at).getTime();
      const inMeeting =
        Boolean(row.is_meeting) ||
        (Number.isFinite(capturedMs) &&
          intervalContains(capturedMs, meetingIv.get(row.user_id) ?? []));
      const inIdle =
        Number.isFinite(capturedMs) &&
        intervalContains(capturedMs, idleIv.get(row.user_id) ?? []);
      if (!byUserShots.has(row.user_id)) byUserShots.set(row.user_id, []);
      byUserShots.get(row.user_id)!.push({
        activity_date: row.activity_date || workDateKey(new Date(row.captured_at), workTz),
        captured_at_ms: capturedMs,
        is_low: Boolean(row.is_low) && !inMeeting && !inIdle,
      });
    }

    const byUserDay = new Map<string, Map<string, number>>();
    for (const [uid, shots] of byUserShots) {
      let i = 0;
      while (i < shots.length) {
        if (!shots[i].is_low) {
          i += 1;
          continue;
        }
        let j = i;
        while (j < shots.length && shots[j].is_low) j += 1;
        if (j - i >= streakNeeded) {
          for (let k = i; k < j; k += 1) {
            const day = shots[k].activity_date;
            if (!byUserDay.has(uid)) byUserDay.set(uid, new Map());
            const dayMap = byUserDay.get(uid)!;
            dayMap.set(day, (dayMap.get(day) ?? 0) + intervalHours);
          }
        }
        i = j;
      }
    }
    return byUserDay;
  }

  /** Prefer idle_logs; fall back to time_logs.idle_seconds when no idle rows exist. */
  mergeIdleHours(
    idleLogHours: Map<string, Map<string, number>>,
    idleSecondsHours: Map<string, Map<string, number>>,
  ): Map<string, Map<string, number>> {
    const merged = new Map<string, Map<string, number>>();
    const userIds = new Set<string>([...idleLogHours.keys(), ...idleSecondsHours.keys()]);

    for (const userId of userIds) {
      const fromLogs = idleLogHours.get(userId) ?? new Map<string, number>();
      const fromSeconds = idleSecondsHours.get(userId) ?? new Map<string, number>();
      const days = new Set<string>([...fromLogs.keys(), ...fromSeconds.keys()]);

      const dayMap = new Map<string, number>();
      for (const day of days) {
        const logHours = fromLogs.get(day) ?? 0;
        const secondsHours = fromSeconds.get(day) ?? 0;
        const hours = fromLogs.has(day) ? logHours : secondsHours;
        if (hours > 0) dayMap.set(day, hours);
      }

      if (dayMap.size > 0) merged.set(userId, dayMap);
    }

    return merged;
  }

  async loadScreenshotActivityRows(
    filter: WorkspaceFilter,
    start: string,
    end: string,
    lowActivityThreshold: number,
    userId?: string,
    tz?: string,
  ): Promise<ScreenshotActivityRow[]> {
    const workTz = normalizeWorkTimezone(tz);
    const scope = this.scope(filter, 'ext');
    const params: unknown[] = [...scope.params, lowActivityThreshold, start, end];
    const thresholdIdx = scope.params.length + 1;
    const startIdx = scope.params.length + 2;
    const endIdx = scope.params.length + 3;
    let userFilter = '';
    if (userId) {
      params.push(parseTenantUserId(userId));
      userFilter = `AND s.user_id = $${params.length}`;
    }

    const result = await this.db.query<ScreenshotActivityRow>(
      `SELECT
         s.user_id::text AS user_id,
         ${sqlWorkDate('s.captured_at', workTz)}::text AS activity_date,
         s.captured_at,
         s.activity_percent,
         (${SCREENSHOT_IS_VIDEO_MEETING_SQL}) AS is_meeting,
         (
           s.activity_percent IS NOT NULL
           AND s.activity_percent < $${thresholdIdx}
           AND NOT ${SCREENSHOT_IS_VIDEO_MEETING_SQL}
           AND NOT ${SCREENSHOT_IS_AI_CONFIRMED_PRODUCTIVE_SQL}
         ) AS is_low
       FROM time_doctor.screenshots s
       JOIN tenant."user" u ON u.id = s.user_id
       JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
       WHERE ${scope.clause}
         AND s.captured_at >= $${startIdx}::timestamptz
         AND s.captured_at < $${endIdx}::timestamptz
         AND COALESCE(u.email, '') NOT ILIKE '%@example.com%'
         ${userFilter}
       ORDER BY s.user_id, s.captured_at ASC`,
      params,
    );
    return result.rows;
  }

  /**
   * Low-activity duration from screenshots below threshold.
   * Only counts low shots that sit in a consecutive streak of length >= N
   * (interval-aware), so 1/min capture does not treat every brief pause as LOW.
   * Idle overlap is applied in memory so month ranges do not run a per-row
   * idle_logs lookup (that is what blew the 29s API Gateway budget).
   */
  async lowActivityHoursFromScreenshots(
    filter: WorkspaceFilter,
    start: string,
    end: string,
    lowActivityThreshold: number,
    intervalMinutes: number,
    userId?: string,
    tz?: string,
    idleLogs?: IdleLogRow[],
  ): Promise<Map<string, Map<string, number>>> {
    const [rows, idle] = await Promise.all([
      this.loadScreenshotActivityRows(filter, start, end, lowActivityThreshold, userId, tz),
      idleLogs
        ? Promise.resolve(idleLogs)
        : this.fetchIdleLogsForRange(filter, start, end, userId),
    ]);
    return this.lowActivityHoursFromRows(rows, idle, intervalMinutes, tz);
  }

  private async fetchIdleLogsForRange(
    filter: WorkspaceFilter,
    start: string,
    end: string,
    userId?: string,
  ): Promise<IdleLogRow[]> {
    const scope = this.scope(filter, 'ext');
    const params: unknown[] = [...scope.params, start, end];
    let userFilter = '';
    if (userId) {
      params.push(parseTenantUserId(userId));
      userFilter = `AND i.user_id = $${params.length}`;
    }
    const result = await this.db.query<IdleLogRow>(
      `SELECT i.user_id::text AS user_id, i.idle_start, i.idle_end, i.duration_seconds
       FROM time_doctor.idle_logs i
       JOIN tenant."user" u ON u.id = i.user_id
       JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
       WHERE ${scope.clause}
         AND i.idle_start < $${scope.params.length + 2}::timestamptz
         AND COALESCE(i.idle_end, NOW()) > $${scope.params.length + 1}::timestamptz
         AND i.idle_start >= ($${scope.params.length + 1}::timestamptz - INTERVAL '3 days')
         AND COALESCE(u.email, '') NOT ILIKE '%@example.com%'
         ${userFilter}
       ORDER BY i.idle_start`,
      params,
    );
    return result.rows;
  }

  /**
   * Idle and low-activity seconds for one person over one span, under exactly
   * the rules the web reports use. The desktop agent asks for these two numbers
   * and applies non_effective = min(total, idle + low) against the total it is
   * already showing, so the figures agree without the agent's clock depending on
   * a network round trip.
   */
  async idleAndLowActivitySecondsForUser(opts: {
    userId: string | number;
    workspaceId: number | null;
    startIso: string;
    endIso: string;
    lowActivityThreshold: number;
    intervalMinutes: number;
    tz?: string;
  }): Promise<IdleAndLowActivity> {
    const userIdText = String(parseTenantUserId(String(opts.userId)));
    const filter: WorkspaceFilter = { workspaceId: opts.workspaceId };

    const idleRows = await this.db.query<{
      user_id: string;
      idle_start: string;
      idle_end: string | null;
      duration_seconds: number | null;
    }>(
      `SELECT i.user_id::text AS user_id, i.idle_start, i.idle_end, i.duration_seconds
       FROM time_doctor.idle_logs i
       WHERE i.user_id = $1
         AND i.idle_start < $3::timestamptz
         AND COALESCE(i.idle_end, NOW()) > $2::timestamptz
       ORDER BY i.idle_start`,
      [userIdText, opts.startIso, opts.endIso],
    );

    const timeLogRows = await this.db.query<{
      user_id: string;
      start_time: string;
      idle_seconds: number | null;
    }>(
      `SELECT t.user_id::text AS user_id, t.start_time, t.idle_seconds
       FROM time_doctor.time_logs t
       WHERE t.user_id = $1
         AND t.start_time < $3::timestamptz
         AND COALESCE(t.end_time, t.last_alive_at, NOW()) > $2::timestamptz
       ORDER BY t.start_time`,
      [userIdText, opts.startIso, opts.endIso],
    );

    const meetings = await this.meetingIntervalsByUser(
      filter,
      opts.startIso,
      opts.endIso,
      opts.intervalMinutes,
      userIdText,
    );
    const idleByDay = this.mergeIdleHours(
      this.idleHoursFromIdleLogs(idleRows.rows, opts.tz, meetings),
      this.idleHoursFromTimeLogs(timeLogRows.rows, opts.tz),
    );
    const lowByDay = await this.lowActivityHoursFromScreenshots(
      filter,
      opts.startIso,
      opts.endIso,
      opts.lowActivityThreshold,
      opts.intervalMinutes,
      userIdText,
      opts.tz,
      idleRows.rows,
    );

    const sumHours = (m: Map<string, Map<string, number>>) => {
      let total = 0;
      for (const day of m.get(userIdText)?.values() ?? []) total += day;
      return total;
    };

    return {
      idleSeconds: Math.max(0, Math.round(sumHours(idleByDay) * 3600)),
      lowActivitySeconds: Math.max(0, Math.round(sumHours(lowByDay) * 3600)),
    };
  }
}
