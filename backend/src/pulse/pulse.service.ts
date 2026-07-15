import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { calculateMergedHoursByUser, mergeTimeIntervals } from '../lib/time-merge';
import {
  EMPLOYEE_USER_SELECT,
  ScopedAuthUser,
  TRACKABLE_PULSE_ROLES_SQL,
  parseTenantUserId,
  parseWorkspaceId,
  workspaceScope,
} from '../database/time-doctor-sql';
import { SCREENSHOT_IS_VIDEO_MEETING_SQL } from './meeting-context';

export interface OrgSettings {
  hours_threshold: number;
  high_activity_threshold: number;
  low_activity_threshold: number;
  screenshot_interval_minutes: number;
}

const DEFAULT_SETTINGS: OrgSettings = {
  hours_threshold: 7,
  high_activity_threshold: 60,
  low_activity_threshold: 20,
  screenshot_interval_minutes: 10,
};

function toDateKey(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

function parsedVisionFields(visionAnalysis: unknown, summary: string | null) {
  let raw = visionAnalysis;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  const parsed =
    raw && typeof raw === 'object' && 'parsed' in (raw as Record<string, unknown>)
      ? ((raw as Record<string, unknown>).parsed as Record<string, unknown>)
      : (raw as Record<string, unknown> | null);

  const description =
    (parsed?.description as string | undefined) || summary || null;
  const feedback = (parsed?.feedback_for_employee as string | undefined) || null;

  return {
    description,
    feedback: feedback && feedback !== description ? feedback : null,
    productivity_flag: (parsed?.productivity_flag as string | undefined) || null,
    vision_analysis: raw,
    vision_used:
      raw && typeof raw === 'object' && 'vision_used' in raw
        ? Boolean((raw as Record<string, unknown>).vision_used)
        : undefined,
  };
}

@Injectable()
export class PulseService {
  private readonly logger = new Logger(PulseService.name);
  private readonly resendApiKey: string;
  private readonly emailFrom: string;

  constructor(
    private readonly db: DatabaseService,
    config: ConfigService,
  ) {
    this.resendApiKey = config.get<string>('RESEND_API_KEY') || '';
    this.emailFrom =
      config.get<string>('EMAIL_FROM') || 'Alyson Pulse <noreply@ebdaadt.com>';
  }

  private workspaceId(user: ScopedAuthUser): number | null {
    return parseWorkspaceId(user.organization_id);
  }

  async getOrgSettings(user: ScopedAuthUser): Promise<OrgSettings & { organization_id: string | null }> {
    const wsId = this.workspaceId(user);
    if (!wsId) {
      return { ...DEFAULT_SETTINGS, organization_id: null };
    }
    const result = await this.db.query<{ settings: Record<string, unknown> }>(
      `SELECT settings FROM time_doctor.workspace_settings WHERE workspace_id = $1 LIMIT 1`,
      [wsId],
    );
    const raw = result.rows[0]?.settings ?? {};
    return {
      organization_id: String(wsId),
      hours_threshold: Number(raw.hours_threshold ?? DEFAULT_SETTINGS.hours_threshold),
      high_activity_threshold: Number(
        raw.high_activity_threshold ?? DEFAULT_SETTINGS.high_activity_threshold,
      ),
      low_activity_threshold: Number(
        raw.low_activity_threshold ?? DEFAULT_SETTINGS.low_activity_threshold,
      ),
      screenshot_interval_minutes: Number(
        raw.screenshot_interval_minutes ?? DEFAULT_SETTINGS.screenshot_interval_minutes,
      ),
    };
  }

  private async fetchTimeLogsInRange(
    user: ScopedAuthUser,
    start: string,
    end: string,
    userId?: string,
  ) {
    const scope = workspaceScope(user, 't');
    const params: unknown[] = [...scope.params, start, end];
    let userFilter = '';
    if (userId) {
      params.push(parseTenantUserId(userId));
      userFilter = `AND t.user_id = $${params.length}`;
    }
    const result = await this.db.query<{
      user_id: string;
      start_time: string;
      end_time: string | null;
      idle_seconds: number | null;
    }>(
      `SELECT t.user_id::text AS user_id, t.start_time, t.end_time, t.idle_seconds
       FROM time_doctor.time_logs t
       LEFT JOIN tenant."user" u ON u.id = t.user_id
       WHERE ${scope.clause}
         AND t.start_time >= $${scope.params.length + 1}::timestamptz
         AND t.start_time < $${scope.params.length + 2}::timestamptz
         ${userFilter}
         AND COALESCE(u.email, '') NOT ILIKE '%@example.com%'
       ORDER BY t.start_time`,
      params,
    );
    return result.rows;
  }

  private dailyHoursFromLogs(
    logs: Array<{ user_id: string; start_time: string | Date; end_time: string | Date | null }>,
  ): Map<string, Map<string, number>> {
    const byUserDay = new Map<string, Map<string, number>>();

    const byUser = new Map<string, Array<{ startMs: number; endMs: number; day: string }>>();
    for (const log of logs) {
      const startMs = new Date(log.start_time).getTime();
      const endMs = log.end_time ? new Date(log.end_time).getTime() : Date.now();
      if (endMs <= startMs) continue;
      const day = toDateKey(log.start_time);
      if (!byUser.has(log.user_id)) byUser.set(log.user_id, []);
      byUser.get(log.user_id)!.push({ startMs, endMs, day });
    }

    for (const [userId, entries] of byUser) {
      const dayMap = new Map<string, number>();
      const days = [...new Set(entries.map((e) => e.day))];
      for (const day of days) {
        const dayStart = new Date(`${day}T00:00:00.000Z`).getTime();
        const dayEnd = dayStart + 24 * 60 * 60 * 1000;
        const intervals = entries
          .map((e) => ({
            startMs: Math.max(e.startMs, dayStart),
            endMs: Math.min(e.endMs, dayEnd),
          }))
          .filter((i) => i.endMs > i.startMs);
        const merged = mergeTimeIntervals(intervals);
        let ms = 0;
        for (const i of merged) ms += i.endMs - i.startMs;
        dayMap.set(day, Math.round((ms / 3600000) * 10) / 10);
      }
      byUserDay.set(userId, dayMap);
    }
    return byUserDay;
  }

  private dailyIdleSecondsFromTimeLogs(
    logs: Array<{
      user_id: string;
      start_time: string | Date;
      idle_seconds: number | null;
    }>,
  ): Map<string, Map<string, number>> {
    const byUserDay = new Map<string, Map<string, number>>();

    for (const log of logs) {
      const seconds = log.idle_seconds ?? 0;
      if (seconds <= 0) continue;

      const day = toDateKey(log.start_time);
      const hours = Math.round((seconds / 3600) * 10) / 10;
      if (!byUserDay.has(log.user_id)) byUserDay.set(log.user_id, new Map());
      const dayMap = byUserDay.get(log.user_id)!;
      dayMap.set(day, (dayMap.get(day) ?? 0) + hours);
    }

    return byUserDay;
  }

  private async fetchIdleLogsInRange(
    user: ScopedAuthUser,
    start: string,
    end: string,
    userId?: string,
  ) {
    const scope = workspaceScope(user, 'ext');
    const params: unknown[] = [...scope.params, start, end];
    let userFilter = '';
    if (userId) {
      params.push(parseTenantUserId(userId));
      userFilter = `AND i.user_id = $${params.length}`;
    }
    const result = await this.db.query<{
      user_id: string;
      idle_start: string;
      idle_end: string | null;
      duration_seconds: number | null;
    }>(
      `SELECT i.user_id::text AS user_id, i.idle_start, i.idle_end, i.duration_seconds
       FROM time_doctor.idle_logs i
       JOIN tenant."user" u ON u.id = i.user_id
       JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
       WHERE ${scope.clause}
         AND i.idle_start >= $${scope.params.length + 1}::timestamptz
         AND i.idle_start < $${scope.params.length + 2}::timestamptz
         AND COALESCE(u.email, '') NOT ILIKE '%@example.com%'
         ${userFilter}
       ORDER BY i.idle_start`,
      params,
    );
    return result.rows;
  }

  private dailyLowActivityFromIdleLogs(
    logs: Array<{
      user_id: string;
      idle_start: string | Date;
      idle_end: string | Date | null;
      duration_seconds: number | null;
    }>,
  ): Map<string, Map<string, number>> {
    const byUserDay = new Map<string, Map<string, number>>();

    for (const log of logs) {
      const day = toDateKey(log.idle_start);
      let seconds = log.duration_seconds ?? 0;
      if (seconds <= 0 && log.idle_end) {
        const startMs = new Date(log.idle_start).getTime();
        const endMs = new Date(log.idle_end).getTime();
        if (endMs > startMs) seconds = Math.round((endMs - startMs) / 1000);
      }
      if (seconds <= 0) continue;

      const hours = Math.round((seconds / 3600) * 10) / 10;
      if (!byUserDay.has(log.user_id)) byUserDay.set(log.user_id, new Map());
      const dayMap = byUserDay.get(log.user_id)!;
      dayMap.set(day, (dayMap.get(day) ?? 0) + hours);
    }

    return byUserDay;
  }

  /** Idle hours per user/day — prefer idle_logs; fall back to time_logs.idle_seconds when no idle rows. */
  private dailyIdleHoursByUserDay(
    idleLogHours: Map<string, Map<string, number>>,
    idleSecondsHours: Map<string, Map<string, number>>,
  ): Map<string, Map<string, number>> {
    const merged = new Map<string, Map<string, number>>();
    const userIds = new Set<string>([
      ...idleLogHours.keys(),
      ...idleSecondsHours.keys(),
    ]);

    for (const userId of userIds) {
      const fromLogs = idleLogHours.get(userId) ?? new Map();
      const fromSessions = idleSecondsHours.get(userId) ?? new Map();
      const days = new Set<string>([...fromLogs.keys(), ...fromSessions.keys()]);
      const dayMap = new Map<string, number>();

      for (const day of days) {
        const logHours = fromLogs.get(day) ?? 0;
        const sessionHours = fromSessions.get(day) ?? 0;
        const hours = logHours > 0 ? logHours : sessionHours;
        if (hours > 0) dayMap.set(day, Math.round(hours * 10) / 10);
      }

      if (dayMap.size > 0) merged.set(userId, dayMap);
    }

    return merged;
  }

  /** Low-activity duration — only screenshots strictly below low_activity_threshold (excludes medium/high). */
  private async fetchLowActivityHoursFromScreenshots(
    user: ScopedAuthUser,
    start: string,
    end: string,
    lowActivityThreshold: number,
    intervalMinutes: number,
    userId?: string,
  ): Promise<Map<string, Map<string, number>>> {
    const scope = workspaceScope(user, 'ext');
    const params: unknown[] = [...scope.params, lowActivityThreshold, start, end];
    const thresholdIdx = scope.params.length + 1;
    const startIdx = scope.params.length + 2;
    const endIdx = scope.params.length + 3;
    let userFilter = '';
    if (userId) {
      params.push(parseTenantUserId(userId));
      userFilter = `AND s.user_id = $${params.length}`;
    }
    const intervalHours = intervalMinutes / 60;

    const result = await this.db.query<{
      user_id: string;
      activity_date: string;
      low_count: string;
    }>(
      `SELECT
         s.user_id::text AS user_id,
         DATE(s.captured_at AT TIME ZONE 'UTC')::text AS activity_date,
         COUNT(*) FILTER (
           WHERE s.activity_percent IS NOT NULL
             AND s.activity_percent < $${thresholdIdx}
             AND NOT ${SCREENSHOT_IS_VIDEO_MEETING_SQL}
         )::text AS low_count
       FROM time_doctor.screenshots s
       JOIN tenant."user" u ON u.id = s.user_id
       JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
       WHERE ${scope.clause}
         AND s.captured_at >= $${startIdx}::timestamptz
         AND s.captured_at < $${endIdx}::timestamptz
         AND COALESCE(u.email, '') NOT ILIKE '%@example.com%'
         ${userFilter}
       GROUP BY s.user_id, DATE(s.captured_at AT TIME ZONE 'UTC')`,
      params,
    );

    const byUserDay = new Map<string, Map<string, number>>();
    for (const row of result.rows) {
      const count = Number(row.low_count) || 0;
      if (count <= 0) continue;

      const hours = Math.round(count * intervalHours * 10) / 10;
      if (!byUserDay.has(row.user_id)) byUserDay.set(row.user_id, new Map());
      byUserDay.get(row.user_id)!.set(row.activity_date, hours);
    }

    return byUserDay;
  }

  private mergeLowActivityByUserDay(
    screenshotHours: Map<string, Map<string, number>>,
    idleSecondsHours: Map<string, Map<string, number>>,
    idleLogHours: Map<string, Map<string, number>>,
  ): Map<string, Map<string, number>> {
    const merged = new Map<string, Map<string, number>>();
    const userIds = new Set<string>([
      ...screenshotHours.keys(),
      ...idleSecondsHours.keys(),
      ...idleLogHours.keys(),
    ]);

    for (const userId of userIds) {
      const screenshotDays = screenshotHours.get(userId) ?? new Map();
      const idleSecondsDays = idleSecondsHours.get(userId) ?? new Map();
      const idleLogDays = idleLogHours.get(userId) ?? new Map();
      const days = new Set<string>([
        ...screenshotDays.keys(),
        ...idleSecondsDays.keys(),
        ...idleLogDays.keys(),
      ]);

      const dayMap = new Map<string, number>();
      for (const day of days) {
        const fromScreenshots = screenshotDays.get(day) ?? 0;
        const fromIdleSeconds = idleSecondsDays.get(day) ?? 0;
        const fromIdleLogs = idleLogDays.get(day) ?? 0;
        const hours =
          fromScreenshots > 0
            ? fromScreenshots
            : Math.max(fromIdleSeconds, fromIdleLogs);
        if (hours > 0) {
          dayMap.set(day, Math.round(hours * 10) / 10);
        }
      }

      if (dayMap.size > 0) merged.set(userId, dayMap);
    }

    return merged;
  }

  async getDashboard(user: ScopedAuthUser, days: number) {
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - days);
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    const scope = workspaceScope(user, 'ext');
    const usersResult = await this.db.query<{
      id: string;
      is_active: boolean;
      last_activity: string | null;
    }>(
      `${EMPLOYEE_USER_SELECT}
       WHERE ${scope.clause}
         AND ${TRACKABLE_PULSE_ROLES_SQL}
         AND u.email NOT ILIKE '%@example.com%'`,
      scope.params,
    );

    const timeScope = workspaceScope(user, 't');
    const activeSessions = await this.db.query<{ user_id: string }>(
      `SELECT DISTINCT t.user_id::text AS user_id
       FROM time_doctor.time_logs t
       WHERE ${timeScope.clause}
         AND t.end_time IS NULL
         AND t.start_time > NOW() - INTERVAL '12 hours'`,
      timeScope.params,
    );
    const onlineIds = new Set(activeSessions.rows.map((r) => r.user_id));
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    for (const u of usersResult.rows) {
      if (u.last_activity && new Date(u.last_activity).getTime() > fiveMinAgo) {
        onlineIds.add(u.id);
      }
    }

    const logs = await this.fetchTimeLogsInRange(user, startIso, endIso);
    const dailyByUser = this.dailyHoursFromLogs(logs);

    const dailyTotals = new Map<string, number>();
    for (const dayMap of dailyByUser.values()) {
      for (const [day, hours] of dayMap) {
        dailyTotals.set(day, (dailyTotals.get(day) ?? 0) + hours);
      }
    }

    const totalHours = [...dailyTotals.values()].reduce((a, b) => a + b, 0);
    const settings = await this.getOrgSettings(user);

    const shotScope = workspaceScope(user, 's');
    const activityParams = [...shotScope.params, startIso, endIso];
    const activityResult = await this.db.query<{ avg_activity: string }>(
      `SELECT COALESCE(AVG(s.activity_percent), 0)::text AS avg_activity
       FROM time_doctor.screenshots s
       WHERE ${shotScope.clause}
         AND s.captured_at >= $${shotScope.params.length + 1}::timestamptz
         AND s.captured_at <= $${shotScope.params.length + 2}::timestamptz`,
      activityParams,
    );

    const breakdown = [...dailyTotals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, hours]) => ({ date, hours: Math.round(hours * 10) / 10 }));

    return {
      total_hours: Math.round(totalHours * 10) / 10,
      active_users: onlineIds.size,
      offline_users: Math.max(0, usersResult.rows.length - onlineIds.size),
      average_activity_percent: Math.round(Number(activityResult.rows[0]?.avg_activity ?? 0)),
      hours_threshold: settings.hours_threshold,
      daily_breakdown: breakdown,
      period_days: days,
    };
  }

  async getDailyHours(user: ScopedAuthUser, start: string, end: string, restrictToUserId?: string) {
    const settings = await this.getOrgSettings(user);
    const scope = workspaceScope(user, 'ext');
    const userParams: unknown[] = [...scope.params];
    const userFilters = [
      scope.clause,
      TRACKABLE_PULSE_ROLES_SQL,
      `u.email NOT ILIKE '%@example.com%'`,
    ];
    if (restrictToUserId) {
      userParams.push(parseTenantUserId(restrictToUserId));
      userFilters.push(`u.id = $${userParams.length}`);
    }

    const usersResult = await this.db.query<{
      id: string;
      full_name: string | null;
      email: string;
      manager_id: string | null;
    }>(
      `${EMPLOYEE_USER_SELECT}
       WHERE ${userFilters.join(' AND ')}
       ORDER BY full_name ASC NULLS LAST`,
      userParams,
    );

    const endExclusive = new Date(end);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    const rangeEndIso = endExclusive.toISOString();
    const logs = await this.fetchTimeLogsInRange(user, start, rangeEndIso, restrictToUserId);
    const idleLogs = await this.fetchIdleLogsInRange(user, start, rangeEndIso, restrictToUserId);
    const dailyByUser = this.dailyHoursFromLogs(logs);
    const lowActivityCutoff = Math.min(settings.low_activity_threshold, 20);
    const lowActivityByUser = await this.fetchLowActivityHoursFromScreenshots(
      user,
      start,
      rangeEndIso,
      lowActivityCutoff,
      settings.screenshot_interval_minutes,
      restrictToUserId,
    );
    // Idle: no keyboard/mouse for 60s+ — from idle_logs checkpoints, else time_logs.idle_seconds.
    const idleByUser = this.dailyIdleHoursByUserDay(
      this.dailyLowActivityFromIdleLogs(idleLogs),
      this.dailyIdleSecondsFromTimeLogs(logs),
    );

    const managerIds = [
      ...new Set(usersResult.rows.map((u) => u.manager_id).filter(Boolean)),
    ] as string[];
    const managerEmails = new Map<string, string>();
    if (managerIds.length) {
      const mgrIds = managerIds.map((id) => parseTenantUserId(id));
      const mgr = await this.db.query<{ id: string; email: string }>(
        `SELECT u.id::text AS id, u.email
         FROM tenant."user" u
         WHERE u.id = ANY($1::int[])`,
        [mgrIds],
      );
      for (const m of mgr.rows) managerEmails.set(m.id, m.email);
    }

    const days: string[] = [];
    const cursor = new Date(start);
    const endDate = new Date(end);
    while (cursor <= endDate) {
      days.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return {
      hours_threshold: settings.hours_threshold,
      low_activity_threshold: settings.low_activity_threshold,
      low_activity_cutoff: Math.min(settings.low_activity_threshold, 20),
      high_activity_threshold: settings.high_activity_threshold,
      screenshot_interval_minutes: settings.screenshot_interval_minutes,
      start,
      end,
      employees: usersResult.rows.map((emp) => {
        const dayMap = dailyByUser.get(emp.id) ?? new Map();
        const lowActivityMap = lowActivityByUser.get(emp.id) ?? new Map();
        const idleMap = idleByUser.get(emp.id) ?? new Map();
        return {
          employee_id: emp.id,
          full_name: emp.full_name,
          email: emp.email,
          manager_email: emp.manager_id ? managerEmails.get(emp.manager_id) ?? null : null,
          days: days.map((date) => {
            const hoursWorked = dayMap.get(date) ?? 0;
            const lowRaw = lowActivityMap.get(date) ?? 0;
            const idleRaw = idleMap.get(date) ?? 0;
            const lowActivityHours =
              hoursWorked > 0 ? Math.min(lowRaw, hoursWorked) : lowRaw;
            const idleHours = hoursWorked > 0 ? Math.min(idleRaw, hoursWorked) : idleRaw;

            return {
              date,
              hours_worked: hoursWorked,
              low_activity_hours: Math.round(lowActivityHours * 10) / 10,
              idle_hours: Math.round(idleHours * 10) / 10,
              below_threshold: hoursWorked < settings.hours_threshold,
            };
          }),
        };
      }),
    };
  }

  async getActivityLevels(user: ScopedAuthUser, start: string, end: string) {
    const settings = await this.getOrgSettings(user);
    const scope = workspaceScope(user, 'ext');

    const result = await this.db.query<{
      user_id: string;
      full_name: string | null;
      email: string;
      activity_date: string;
      total_inputs: string;
      tracked_minutes: string;
      avg_activity_percent: string;
    }>(
      `SELECT
         s.user_id::text AS user_id,
         trim(both ' ' from coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) AS full_name,
         u.email,
         DATE(s.captured_at AT TIME ZONE 'UTC')::text AS activity_date,
         COALESCE(SUM(s.mouse_clicks + s.keystrokes), 0)::text AS total_inputs,
         GREATEST(COUNT(*) * 5, 1)::text AS tracked_minutes,
         COALESCE(AVG(s.activity_percent), 0)::text AS avg_activity_percent
       FROM time_doctor.screenshots s
       JOIN tenant."user" u ON u.id = s.user_id
       JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
       WHERE ${scope.clause}
         AND s.captured_at >= $${scope.params.length + 1}::timestamptz
         AND s.captured_at < ($${scope.params.length + 2}::date + INTERVAL '1 day')
         AND u.email NOT ILIKE '%@example.com%'
       GROUP BY s.user_id, u.first_name, u.last_name, u.email, DATE(s.captured_at AT TIME ZONE 'UTC')
       ORDER BY full_name, activity_date`,
      [...scope.params, start, end],
    );

    const byUser = new Map<
      string,
      {
        user_id: string;
        full_name: string | null;
        email: string;
        daily_scores: Array<{
          date: string;
          activity_score: number;
          level: 'high' | 'medium' | 'low';
        }>;
      }
    >();

    for (const row of result.rows) {
      if (!byUser.has(row.user_id)) {
        byUser.set(row.user_id, {
          user_id: row.user_id,
          full_name: row.full_name,
          email: row.email,
          daily_scores: [],
        });
      }
      const trackedMin = Number(row.tracked_minutes);
      const inputs = Number(row.total_inputs);
      const score =
        trackedMin > 0
          ? Math.round((inputs / trackedMin) * 10) / 10
          : Math.round(Number(row.avg_activity_percent));

      let level: 'high' | 'medium' | 'low' = 'medium';
      if (score >= settings.high_activity_threshold) level = 'high';
      else if (score < settings.low_activity_threshold) level = 'low';

      byUser.get(row.user_id)!.daily_scores.push({
        date: row.activity_date,
        activity_score: score,
        level,
      });
    }

    return {
      high_activity_threshold: settings.high_activity_threshold,
      low_activity_threshold: settings.low_activity_threshold,
      employees: [...byUser.values()],
    };
  }

  async getActivitySummary(user: ScopedAuthUser, start: string, end: string) {
    const scope = workspaceScope(user, 'ext');
    const usersResult = await this.db.query<{
      id: string;
      full_name: string | null;
      email: string;
      manager_id: string | null;
    }>(
      `${EMPLOYEE_USER_SELECT}
       WHERE ${scope.clause}
         AND ${TRACKABLE_PULSE_ROLES_SQL}
         AND u.email NOT ILIKE '%@example.com%'
       ORDER BY full_name ASC NULLS LAST`,
      scope.params,
    );

    const activityResult = await this.db.query<{
      user_id: string;
      screenshot_count: string;
      mouse_clicks: string;
      keystrokes: string;
      mouse_movements: string;
      avg_activity_percent: string;
      avg_focus_percent: string;
    }>(
      `SELECT
         s.user_id::text AS user_id,
         COUNT(*)::text AS screenshot_count,
         COALESCE(SUM(s.mouse_clicks), 0)::text AS mouse_clicks,
         COALESCE(SUM(s.keystrokes), 0)::text AS keystrokes,
         COALESCE(SUM(s.mouse_movements), 0)::text AS mouse_movements,
         COALESCE(AVG(s.activity_percent), 0)::text AS avg_activity_percent,
         COALESCE(AVG(s.focus_percent), 0)::text AS avg_focus_percent
       FROM time_doctor.screenshots s
       JOIN tenant."user" u ON u.id = s.user_id
       JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
       WHERE ${scope.clause}
         AND s.captured_at >= $${scope.params.length + 1}::timestamptz
         AND s.captured_at < ($${scope.params.length + 2}::date + INTERVAL '1 day')
         AND u.email NOT ILIKE '%@example.com%'
       GROUP BY s.user_id`,
      [...scope.params, start, end],
    );

    const activityByUser = new Map<
      string,
      {
        screenshot_count: number;
        mouse_clicks: number;
        keystrokes: number;
        mouse_movements: number;
        avg_activity_percent: number;
        avg_focus_percent: number;
      }
    >(
      activityResult.rows.map((row) => [
        row.user_id,
        {
          screenshot_count: Number(row.screenshot_count),
          mouse_clicks: Number(row.mouse_clicks),
          keystrokes: Number(row.keystrokes),
          mouse_movements: Number(row.mouse_movements),
          avg_activity_percent: Math.round(Number(row.avg_activity_percent)),
          avg_focus_percent: Math.round(Number(row.avg_focus_percent)),
        },
      ]),
    );

    const managerIds = [
      ...new Set(usersResult.rows.map((u) => u.manager_id).filter(Boolean)),
    ] as string[];
    const managerEmails = new Map<string, string>();
    if (managerIds.length) {
      const mgrIds = managerIds.map((id) => parseTenantUserId(id));
      const mgr = await this.db.query<{ id: string; email: string }>(
        `SELECT u.id::text AS id, u.email
         FROM tenant."user" u
         WHERE u.id = ANY($1::int[])`,
        [mgrIds],
      );
      for (const m of mgr.rows) managerEmails.set(m.id, m.email);
    }

    return {
      start,
      end,
      employees: usersResult.rows.map((emp) => {
        const activity = activityByUser.get(emp.id) ?? {
          screenshot_count: 0,
          mouse_clicks: 0,
          keystrokes: 0,
          mouse_movements: 0,
          avg_activity_percent: 0,
          avg_focus_percent: 0,
        };
        const totalInputs =
          activity.mouse_clicks + activity.keystrokes + activity.mouse_movements;

        return {
          employee_id: emp.id,
          full_name: emp.full_name,
          email: emp.email,
          manager_email: emp.manager_id ? managerEmails.get(emp.manager_id) ?? null : null,
          screenshot_count: activity.screenshot_count,
          mouse_clicks: activity.mouse_clicks,
          keystrokes: activity.keystrokes,
          mouse_movements: activity.mouse_movements,
          total_inputs: totalInputs,
          avg_activity_percent: activity.avg_activity_percent,
          avg_focus_percent: activity.avg_focus_percent,
        };
      }),
    };
  }

  /** Per-employee AI screenshot insights with activity breakdown and recent descriptions. */
  async getAiInsights(user: ScopedAuthUser, start: string, end: string) {
    const scope = workspaceScope(user, 'ext');
    const rangeParams = [...scope.params, start, end];

    const usersResult = await this.db.query<{
      id: string;
      full_name: string | null;
      email: string;
    }>(
      `${EMPLOYEE_USER_SELECT}
       WHERE ${scope.clause}
         AND ${TRACKABLE_PULSE_ROLES_SQL}
         AND u.email NOT ILIKE '%@example.com%'
       ORDER BY full_name ASC NULLS LAST`,
      scope.params,
    );

    const analyzedResult = await this.db.query<{
      user_id: string;
      activity_type: string | null;
      category: string | null;
      confidence_score: number | null;
      distraction_score: number | null;
      id: string;
      captured_at: string;
      description: string | null;
      vision_analysis: Record<string, unknown> | null;
    }>(
      `SELECT
         s.user_id::text AS user_id,
         s.activity_type,
         s.category,
         s.confidence_score,
         s.distraction_score,
         s.id::text AS id,
         s.captured_at,
         s.vision_summary AS description,
         s.vision_analysis
       FROM time_doctor.screenshots s
       JOIN tenant."user" u ON u.id = s.user_id
       JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
       WHERE ${scope.clause}
         AND s.captured_at >= $${scope.params.length + 1}::timestamptz
         AND s.captured_at <= $${scope.params.length + 2}::timestamptz
         AND s.ai_analysis_status = 'completed'
       ORDER BY s.user_id, s.captured_at DESC`,
      rangeParams,
    );

    const pipelineResult = await this.db.query<{ status: string; count: string }>(
      `SELECT s.ai_analysis_status AS status, COUNT(*)::text AS count
       FROM time_doctor.screenshots s
       JOIN tenant."user" u ON u.id = s.user_id
       JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
       WHERE ${scope.clause}
         AND s.captured_at >= $${scope.params.length + 1}::timestamptz
         AND s.captured_at <= $${scope.params.length + 2}::timestamptz
       GROUP BY s.ai_analysis_status`,
      rangeParams,
    );

    const pipeline: Record<string, number> = {};
    for (const row of pipelineResult.rows) {
      pipeline[row.status] = parseInt(row.count, 10) || 0;
    }

    const byUser = new Map<
      string,
      {
        analyzed_count: number;
        productive_count: number;
        distraction_count: number;
        confidence_total: number;
        activity_counts: Map<string, number>;
        recent_insights: Array<{
          screenshot_id: string;
          captured_at: string;
          description: string;
          feedback: string | null;
          activity_type: string | null;
          category: string | null;
          confidence_score: number | null;
          distraction_score: number | null;
          productivity_flag: string | null;
          vision_analysis: Record<string, unknown> | null;
          vision_used?: boolean;
        }>;
      }
    >();

    for (const row of analyzedResult.rows) {
      if (!byUser.has(row.user_id)) {
        byUser.set(row.user_id, {
          analyzed_count: 0,
          productive_count: 0,
          distraction_count: 0,
          confidence_total: 0,
          activity_counts: new Map(),
          recent_insights: [],
        });
      }
      const entry = byUser.get(row.user_id)!;
      entry.analyzed_count += 1;
      if (row.category === 'productive') entry.productive_count += 1;
      if (row.category === 'distraction') entry.distraction_count += 1;
      entry.confidence_total += row.confidence_score ?? 0;
      if (row.activity_type) {
        entry.activity_counts.set(
          row.activity_type,
          (entry.activity_counts.get(row.activity_type) ?? 0) + 1,
        );
      }
      if (entry.recent_insights.length < 3) {
        const fields = parsedVisionFields(row.vision_analysis, row.description);
        if (fields.description || fields.feedback) {
          entry.recent_insights.push({
            screenshot_id: row.id,
            captured_at: row.captured_at,
            description: fields.description || fields.feedback || '',
            feedback: fields.feedback,
            activity_type: row.activity_type,
            category: row.category,
            confidence_score: row.confidence_score,
            distraction_score: row.distraction_score,
            productivity_flag: fields.productivity_flag,
            vision_analysis: fields.vision_analysis as Record<string, unknown> | null,
            vision_used: fields.vision_used,
          });
        }
      }
    }

    return {
      start,
      end,
      pipeline,
      employees: usersResult.rows.map((emp) => {
        const stats = byUser.get(emp.id);
        let top_activity_type: string | null = null;
        if (stats?.activity_counts.size) {
          top_activity_type = [...stats.activity_counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
        }
        return {
          employee_id: emp.id,
          full_name: emp.full_name,
          email: emp.email,
          analyzed_count: stats?.analyzed_count ?? 0,
          productive_count: stats?.productive_count ?? 0,
          distraction_count: stats?.distraction_count ?? 0,
          avg_confidence: stats?.analyzed_count
            ? Math.round(stats.confidence_total / stats.analyzed_count)
            : 0,
          top_activity_type,
          recent_insights: stats?.recent_insights ?? [],
        };
      }),
    };
  }

  async getNotTracking(user: ScopedAuthUser, anchorDate?: string) {
    const settings = await this.getOrgSettings(user);
    const lowActivityCutoff = Math.min(settings.low_activity_threshold, 20);

    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    const todayKey = todayUtc.toISOString().slice(0, 10);

    const checkDate = anchorDate?.trim().slice(0, 10) || todayKey;
    const checkDay = new Date(`${checkDate}T00:00:00Z`);
    if (Number.isNaN(checkDay.getTime())) {
      throw new BadRequestException('Invalid date');
    }
    if (checkDate > todayKey) {
      throw new BadRequestException('date cannot be in the future');
    }

    const previousDay = new Date(checkDay);
    previousDay.setUTCDate(previousDay.getUTCDate() - 1);
    const previousKey = previousDay.toISOString().slice(0, 10);

    const endExclusive = new Date(checkDay);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

    const scope = workspaceScope(user, 'ext');
    const usersResult = await this.db.query<{
      id: string;
      full_name: string | null;
      email: string;
      manager_id: string | null;
      last_activity: string | null;
      paused_at: string | null;
      pause_reason: string | null;
    }>(
      `${EMPLOYEE_USER_SELECT}
       WHERE ${scope.clause}
         AND ${TRACKABLE_PULSE_ROLES_SQL}
         AND u.email NOT ILIKE '%@example.com%'
         AND ext.paused_at IS NULL
       ORDER BY full_name ASC NULLS LAST`,
      scope.params,
    );

    const logs = await this.fetchTimeLogsInRange(
      user,
      previousKey,
      endExclusive.toISOString(),
    );
    const idleLogs = await this.fetchIdleLogsInRange(
      user,
      previousKey,
      endExclusive.toISOString(),
    );
    const dailyByUser = this.dailyHoursFromLogs(logs);
    const lowActivityByUser = await this.fetchLowActivityHoursFromScreenshots(
      user,
      previousKey,
      endExclusive.toISOString(),
      lowActivityCutoff,
      settings.screenshot_interval_minutes,
    );
    const idleByUser = this.dailyIdleHoursByUserDay(
      this.dailyLowActivityFromIdleLogs(idleLogs),
      this.dailyIdleSecondsFromTimeLogs(logs),
    );

    const timeScope = workspaceScope(user, 't');
    const openSessions = await this.db.query<{ user_id: string }>(
      `SELECT DISTINCT t.user_id::text AS user_id
       FROM time_doctor.time_logs t
       WHERE ${timeScope.clause}
         AND t.end_time IS NULL
         AND t.start_time > NOW() - INTERVAL '12 hours'`,
      timeScope.params,
    );
    const openSessionIds = new Set(openSessions.rows.map((r) => r.user_id));

    const managerIds = [
      ...new Set(usersResult.rows.map((u) => u.manager_id).filter(Boolean)),
    ] as string[];
    const managerEmails = new Map<string, string>();
    if (managerIds.length) {
      const mgrIds = managerIds.map((id) => parseTenantUserId(id));
      const mgr = await this.db.query<{ id: string; email: string }>(
        `SELECT u.id::text AS id, u.email
         FROM tenant."user" u
         WHERE u.id = ANY($1::int[])`,
        [mgrIds],
      );
      for (const m of mgr.rows) managerEmails.set(m.id, m.email);
    }

    const isWeekend = (dateKey: string) => {
      const dow = new Date(`${dateKey}T12:00:00Z`).getUTCDay();
      return dow === 0 || dow === 6;
    };

    const dayMetrics = (
      empId: string,
      dateKey: string,
    ): {
      hours: number;
      low_activity_hours: number;
      idle_hours: number;
      below_threshold: boolean;
    } => {
      const hours = dailyByUser.get(empId)?.get(dateKey) ?? 0;
      const lowRaw = lowActivityByUser.get(empId)?.get(dateKey) ?? 0;
      const idleRaw = idleByUser.get(empId)?.get(dateKey) ?? 0;
      const lowActivityHours =
        hours > 0 ? Math.min(lowRaw, hours) : lowRaw;
      const idleHours = hours > 0 ? Math.min(idleRaw, hours) : idleRaw;
      return {
        hours,
        low_activity_hours: Math.round(lowActivityHours * 10) / 10,
        idle_hours: Math.round(idleHours * 10) / 10,
        below_threshold: !isWeekend(dateKey) && hours < settings.hours_threshold,
      };
    };

    const employees = usersResult.rows.map((emp) => {
      const previous = dayMetrics(emp.id, previousKey);
      const check = dayMetrics(emp.id, checkDate);
      const previousWeekend = isWeekend(previousKey);
      const checkWeekend = isWeekend(checkDate);

      const notTrackingPrevious =
        !previousWeekend && previous.hours <= 0;
      const notTrackingCheck = !checkWeekend && check.hours <= 0;

      return {
        employee_id: emp.id,
        full_name: emp.full_name,
        email: emp.email,
        manager_email: emp.manager_id ? managerEmails.get(emp.manager_id) ?? null : null,
        // New canonical keys
        check_date: checkDate,
        previous_date: previousKey,
        previous_hours: previous.hours,
        check_hours: check.hours,
        previous_low_activity_hours: previous.low_activity_hours,
        check_low_activity_hours: check.low_activity_hours,
        previous_idle_hours: previous.idle_hours,
        check_idle_hours: check.idle_hours,
        previous_below_threshold: previous.below_threshold,
        check_below_threshold: check.below_threshold,
        previous_is_weekend: previousWeekend,
        check_is_weekend: checkWeekend,
        not_tracking_previous: notTrackingPrevious,
        not_tracking_check: notTrackingCheck,
        not_tracking_either: notTrackingPrevious || notTrackingCheck,
        not_tracking_both: notTrackingPrevious && notTrackingCheck,
        has_open_session: checkDate === todayKey && openSessionIds.has(emp.id),
        last_activity: emp.last_activity,
        paused_at: emp.paused_at,
        pause_reason: emp.pause_reason,
        // Backward-compatible aliases (yesterday = previous, today = check)
        yesterday: previousKey,
        today: checkDate,
        yesterday_hours: previous.hours,
        today_hours: check.hours,
        not_tracking_yesterday: notTrackingPrevious,
        not_tracking_today: notTrackingCheck,
      };
    });

    const needsFollowUp = employees.filter((emp) => emp.not_tracking_either);

    return {
      date: checkDate,
      previous_date: previousKey,
      check_date: checkDate,
      yesterday: previousKey,
      today: checkDate,
      hours_threshold: settings.hours_threshold,
      low_activity_cutoff: lowActivityCutoff,
      employees,
      not_tracking_count: needsFollowUp.length,
      logged_check_count: employees.filter(
        (emp) => emp.check_hours > 0 || emp.has_open_session,
      ).length,
      logged_previous_count: employees.filter((emp) => emp.previous_hours > 0).length,
    };
  }

  async getTeam(user: ScopedAuthUser) {
    const scope = workspaceScope(user, 'ext');
    const weekStart = new Date();
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
    weekStart.setUTCHours(0, 0, 0, 0);

    const usersResult = await this.db.query<{
      id: string;
      full_name: string | null;
      email: string;
      role: string;
      department: string | null;
      location: string | null;
      is_active: boolean;
      manager_id: string | null;
    }>(
      `${EMPLOYEE_USER_SELECT}
       WHERE ${scope.clause}
         AND u.email NOT ILIKE '%@example.com%'
       ORDER BY full_name ASC NULLS LAST`,
      scope.params,
    );

    const logs = await this.fetchTimeLogsInRange(
      user,
      weekStart.toISOString(),
      new Date().toISOString(),
    );
    const weeklyHours = calculateMergedHoursByUser(logs);

    const leads = usersResult.rows.filter(
      (u) => u.role === 'admin' || u.role === 'manager' || u.role === 'team_leader',
    );

    const employees = usersResult.rows.filter((u) => u.role === 'employee');

    const reportsFor = (leadId: string) =>
      employees
        .filter((e) => e.manager_id === leadId)
        .map((e) => ({
          id: e.id,
          full_name: e.full_name,
          email: e.email,
          role: e.role,
          department: e.department,
          location: e.location,
          status: e.is_active ? 'active' : 'inactive',
          weekly_hours: weeklyHours.get(e.id) ?? 0,
        }));

    return {
      leads: leads.map((lead) => ({
        id: lead.id,
        full_name: lead.full_name,
        email: lead.email,
        role: lead.role,
        department: lead.department,
        location: lead.location,
        status: lead.is_active ? 'active' : 'inactive',
        direct_reports: reportsFor(lead.id),
      })),
      unassigned_employees: employees
        .filter((e) => !e.manager_id)
        .map((e) => ({
          id: e.id,
          full_name: e.full_name,
          email: e.email,
          weekly_hours: weeklyHours.get(e.id) ?? 0,
        })),
    };
  }

  async getLowHours(user: ScopedAuthUser, date: string) {
    const settings = await this.getOrgSettings(user);
    const dayStart = `${date}T00:00:00.000Z`;
    const dayEnd = new Date(date);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const logs = await this.fetchTimeLogsInRange(user, dayStart, dayEnd.toISOString());
    const dailyByUser = this.dailyHoursFromLogs(logs);
    const scope = workspaceScope(user, 'ext');

    const usersResult = await this.db.query<{
      id: string;
      full_name: string | null;
      email: string;
      manager_id: string | null;
    }>(
      `${EMPLOYEE_USER_SELECT}
       WHERE ${scope.clause}
         AND ${TRACKABLE_PULSE_ROLES_SQL}
         AND u.email NOT ILIKE '%@example.com%'`,
      scope.params,
    );

    const managerIds = [
      ...new Set(usersResult.rows.map((u) => u.manager_id).filter(Boolean)),
    ] as string[];
    const managerMap = new Map<string, { email: string; full_name: string | null }>();
    if (managerIds.length) {
      const mgrIds = managerIds.map((id) => parseTenantUserId(id));
      const mgr = await this.db.query<{ id: string; email: string; full_name: string | null }>(
        `SELECT u.id::text AS id, u.email,
                trim(both ' ' from coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) AS full_name
         FROM tenant."user" u
         WHERE u.id = ANY($1::int[])`,
        [mgrIds],
      );
      for (const m of mgr.rows) managerMap.set(m.id, { email: m.email, full_name: m.full_name });
    }

    const below = usersResult.rows
      .map((emp) => {
        const hours = dailyByUser.get(emp.id)?.get(date) ?? 0;
        const mgr = emp.manager_id ? managerMap.get(emp.manager_id) : null;
        return {
          employee_id: emp.id,
          full_name: emp.full_name,
          email: emp.email,
          hours_worked: hours,
          manager_email: mgr?.email ?? null,
          manager_name: mgr?.full_name ?? null,
          below_threshold: hours < settings.hours_threshold,
        };
      })
      .filter((e) => e.below_threshold);

    return {
      date,
      hours_threshold: settings.hours_threshold,
      employees: below,
    };
  }

  async sendLowHoursEmails(
    user: ScopedAuthUser,
    body: { date: string; employee_ids?: string[]; notify_manager?: boolean },
  ) {
    const lowHours = await this.getLowHours(user, body.date);
    let targets = lowHours.employees;
    if (body.employee_ids?.length) {
      const idSet = new Set(body.employee_ids);
      targets = targets.filter((e) => idSet.has(e.employee_id));
    }

    if (!this.resendApiKey) {
      this.logger.warn('RESEND_API_KEY not set — recording send intent only');
    }

    const sent: Array<{ employee_id: string; email: string; status: string }> = [];
    const wsId = this.workspaceId(user);

    for (const emp of targets) {
      const subject = `Low hours alert — ${body.date}`;
      const html = `<p>Hi ${emp.full_name ?? 'there'},</p>
        <p>Your tracked hours on <strong>${body.date}</strong> were <strong>${emp.hours_worked}h</strong>,
        below the ${lowHours.hours_threshold}h threshold.</p>
        <p>Please ensure your time tracker is running during work hours.</p>`;

      let status = 'logged';
      if (this.resendApiKey && emp.email) {
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.resendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: this.emailFrom,
              to: [emp.email],
              subject,
              html,
            }),
          });
          status = res.ok ? 'sent' : `failed:${res.status}`;
        } catch {
          status = 'failed';
        }
      }

      if (body.notify_manager && emp.manager_email && this.resendApiKey) {
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.resendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: this.emailFrom,
              to: [emp.manager_email],
              subject: `Team member low hours — ${emp.full_name} on ${body.date}`,
              html: `<p>${emp.full_name} logged ${emp.hours_worked}h on ${body.date} (threshold: ${lowHours.hours_threshold}h).</p>`,
            }),
          });
        } catch {
          /* manager notify is best-effort */
        }
      }

      await this.db.query(
        `INSERT INTO time_doctor.low_hours_email_log
          (workspace_id, employee_id, employee_email, manager_email, work_date,
           hours_worked, hours_threshold, sent_by, status)
         VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8,$9)`,
        [
          wsId,
          parseTenantUserId(emp.employee_id),
          emp.email,
          emp.manager_email,
          body.date,
          emp.hours_worked,
          lowHours.hours_threshold,
          parseTenantUserId(user.id),
          status,
        ],
      );

      sent.push({ employee_id: emp.employee_id, email: emp.email, status });
    }

    return { date: body.date, sent_count: sent.length, results: sent };
  }

  async getLowHoursHistory(user: ScopedAuthUser, limit: number) {
    const wsId = this.workspaceId(user);
    const cap = Math.max(1, Math.min(limit, 200));
    const params: unknown[] = [];
    let where = '1=1';
    if (!user.is_super_admin && wsId) {
      params.push(wsId);
      where = `l.workspace_id = $1`;
    }
    const result = await this.db.query(
      `SELECT l.id, l.employee_id::text AS employee_id, l.employee_email, l.manager_email,
              l.work_date, l.hours_worked, l.hours_threshold, l.status, l.created_at,
              trim(both ' ' from coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) AS employee_name
       FROM time_doctor.low_hours_email_log l
       LEFT JOIN tenant."user" u ON u.id = l.employee_id
       WHERE ${where}
       ORDER BY l.created_at DESC
       LIMIT ${cap}`,
      params,
    );
    return result.rows;
  }

  async updateUser(
    user: ScopedAuthUser,
    targetId: string,
    updates: {
      full_name?: string;
      role?: string;
      department?: string | null;
      location?: string | null;
      manager_id?: string | null;
      is_active?: boolean;
    },
  ) {
    const scope = workspaceScope(user, 'ext');
    const uid = parseTenantUserId(targetId);
    const params: unknown[] = [...scope.params, uid];
    const sets: string[] = ['updated_at = NOW()'];
    let idx = scope.params.length + 2;

    if (updates.role !== undefined) {
      sets.push(`pulse_role = $${idx++}`);
      params.push(updates.role);
    }
    if (updates.department !== undefined) {
      sets.push(`department = $${idx++}`);
      params.push(updates.department);
    }
    if (updates.location !== undefined) {
      sets.push(`location = $${idx++}`);
      params.push(updates.location);
    }
    if (updates.manager_id !== undefined) {
      sets.push(`manager_id = $${idx++}`);
      params.push(updates.manager_id ? parseTenantUserId(updates.manager_id) : null);
    }
    if (updates.is_active === false) {
      sets.push('paused_at = NOW()');
    } else if (updates.is_active === true) {
      sets.push('paused_at = NULL', 'pause_reason = NULL');
    }

    if (updates.full_name !== undefined) {
      const parts = updates.full_name.trim().split(/\s+/);
      await this.db.query(
        `UPDATE tenant."user" SET first_name = $2, last_name = $3 WHERE id = $1`,
        [uid, parts[0] ?? '', parts.slice(1).join(' ')],
      );
    }

    if (sets.length > 1) {
      await this.db.query(
        `UPDATE time_doctor.user_extensions ext
         SET ${sets.join(', ')}
         WHERE ${scope.clause}
           AND ext.user_id = $${scope.params.length + 1}`,
        params,
      );
    }

    const refreshed = await this.db.query(
      `${EMPLOYEE_USER_SELECT}
       WHERE ext.user_id = $1
       LIMIT 1`,
      [uid],
    );
    return refreshed.rows[0] ?? null;
  }
}
