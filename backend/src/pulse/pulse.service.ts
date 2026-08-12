import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { calculateMergedHoursByUser, mergeTimeIntervals } from '../lib/time-merge';
import {
  EMPLOYEE_USER_SELECT,
  ScopedAuthUser,
  TRACKABLE_PULSE_ROLES_SQL,
  isPulseAdmin,
  parseTenantUserId,
  parseWorkspaceId,
  workspaceScope,
} from '../database/time-doctor-sql';
import { AccessGrantsService } from '../access-grants/access-grants.service';
import { SesEmailService } from '../common/ses-email.service';
import {
  buildApprovedPaceEmail,
  buildPaceEmailMetrics,
  DAILY_EFFECTIVE_TARGET_HOURS,
} from './low-hours-email-templates';
import { SCREENSHOT_IS_VIDEO_MEETING_SQL } from './meeting-context';
import { SCREENSHOT_IS_AI_CONFIRMED_PRODUCTIVE_SQL } from './ai-activity-floor';
import {
  eachWorkDateKey,
  normalizeWorkTimezone,
  sqlWorkDate,
  workDateKey,
  workDateRangeToUtcIso,
  workDayBoundsMs,
} from '../lib/work-timezone';
import { computeEffectiveTime } from '../lib/effective-time';
import {
  nextDayTotalHours,
  resolveAdjustmentDeltaSeconds,
} from './time-adjustment.util';

export interface OrgSettings {
  hours_threshold: number;
  high_activity_threshold: number;
  low_activity_threshold: number;
  screenshot_interval_minutes: number;
  /** IANA company/work-day TZ (match Time Doctor Company Time Zone, e.g. America/Chicago). */
  timezone: string;
}

const DEFAULT_SETTINGS: OrgSettings = {
  hours_threshold: 7,
  high_activity_threshold: 60,
  /** Below this activity_percent a screenshot counts as LOW (was 20 — too noisy). */
  low_activity_threshold: 10,
  screenshot_interval_minutes: 10,
  timezone: normalizeWorkTimezone(null),
};

/** Effective LOW cutoff for hours: never looser than 10% (stricter = less LOW on reports). */
function lowActivityCutoffPercent(settings: OrgSettings): number {
  const raw = Number(settings.low_activity_threshold);
  const threshold = Number.isFinite(raw) ? raw : DEFAULT_SETTINGS.low_activity_threshold;
  return Math.min(Math.max(threshold, 0), 10);
}

/** Calendar day in the workspace work timezone. */
function toDateKey(value: string | Date, tz?: string): string {
  return workDateKey(value instanceof Date ? value : new Date(value), tz);
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

  constructor(
    private readonly db: DatabaseService,
    private readonly accessGrants: AccessGrantsService,
    private readonly sesEmail: SesEmailService,
  ) {}

  private workspaceId(user: ScopedAuthUser): number | null {
    return parseWorkspaceId(user.organization_id);
  }

  /**
   * Employee ids visible in team reports.
   * null = entire workspace (admin). Delegated grantees = self + assigned employees.
   * Everyone else = self only.
   */
  private async visibleEmployeeIds(user: ScopedAuthUser): Promise<string[] | null> {
    if (isPulseAdmin(user) || user.is_super_admin) {
      return null;
    }
    try {
      const granted = await this.accessGrants.getGrantedTargetIds(user);
      if (granted.length) {
        // Grants add access to others — never strip the caller's own data.
        return [...new Set([...granted.map(String), String(user.id)])];
      }
    } catch {
      /* migration not applied yet */
    }
    return [String(user.id)];
  }

  async hasDelegatedAccess(user: ScopedAuthUser): Promise<boolean> {
    try {
      const granted = await this.accessGrants.getGrantedTargetIds(user);
      return granted.length > 0;
    } catch {
      return false;
    }
  }

  private applyVisibleUserFilter(
    visibleIds: string[] | null,
    params: unknown[],
    column = 'u.id',
  ): string {
    if (!visibleIds) return '';
    params.push(visibleIds.map((id) => parseTenantUserId(id)));
    return ` AND ${column} = ANY($${params.length}::int[])`;
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
    const settings: OrgSettings = {
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
      timezone: normalizeWorkTimezone(
        typeof raw.timezone === 'string' ? raw.timezone : DEFAULT_SETTINGS.timezone,
      ),
    };
    // Normalize so reports / engagement use the stricter LOW bar (≤10%).
    settings.low_activity_threshold = lowActivityCutoffPercent(settings);
    return { organization_id: String(wsId), ...settings };
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
      // Overlap the range (not start_time-only) so day mode includes sessions that
      // began before Pacific midnight but still have time on that day. Lookback
      // avoids pulling ancient never-closed sessions into every day query.
      `SELECT t.user_id::text AS user_id, t.start_time, t.end_time, t.idle_seconds
       FROM time_doctor.time_logs t
       LEFT JOIN tenant."user" u ON u.id = t.user_id
       WHERE ${scope.clause}
         AND t.start_time < $${scope.params.length + 2}::timestamptz
         AND COALESCE(t.end_time, NOW()) > $${scope.params.length + 1}::timestamptz
         AND t.start_time >= ($${scope.params.length + 1}::timestamptz - INTERVAL '3 days')
         ${userFilter}
         AND COALESCE(u.email, '') NOT ILIKE '%@example.com%'
       ORDER BY t.start_time`,
      params,
    );
    return result.rows;
  }

  private dailyHoursFromLogs(
    logs: Array<{ user_id: string; start_time: string | Date; end_time: string | Date | null }>,
    tz?: string,
  ): Map<string, Map<string, number>> {
    const workTz = normalizeWorkTimezone(tz);
    const byUserDay = new Map<string, Map<string, number>>();

    const byUser = new Map<string, Array<{ startMs: number; endMs: number }>>();
    for (const log of logs) {
      const startMs = new Date(log.start_time).getTime();
      const endMs = log.end_time ? new Date(log.end_time).getTime() : Date.now();
      if (endMs <= startMs) continue;
      if (!byUser.has(log.user_id)) byUser.set(log.user_id, []);
      byUser.get(log.user_id)!.push({ startMs, endMs });
    }

    for (const [userId, entries] of byUser) {
      const dayIntervals = new Map<string, Array<{ startMs: number; endMs: number }>>();
      for (const entry of entries) {
        let cursor = entry.startMs;
        while (cursor < entry.endMs) {
          const day = workDateKey(new Date(cursor), workTz);
          const { startMs: dayStart, endMs: dayEnd } = workDayBoundsMs(day, workTz);
          const clipStart = Math.max(entry.startMs, dayStart);
          const clipEnd = Math.min(entry.endMs, dayEnd);
          if (clipEnd > clipStart) {
            if (!dayIntervals.has(day)) dayIntervals.set(day, []);
            dayIntervals.get(day)!.push({ startMs: clipStart, endMs: clipEnd });
          }
          cursor = dayEnd;
        }
      }

      const dayMap = new Map<string, number>();
      for (const [day, intervals] of dayIntervals) {
        const merged = mergeTimeIntervals(intervals);
        let ms = 0;
        for (const i of merged) ms += i.endMs - i.startMs;
        dayMap.set(day, Math.round((ms / 3600000) * 10) / 10);
      }
      byUserDay.set(userId, dayMap);
    }
    return byUserDay;
  }

  /**
   * Net admin adjustments (hours) per user_id → work_date (Pacific).
   */
  private async fetchAdjustmentHoursInRange(
    user: ScopedAuthUser,
    startKey: string,
    endKey: string,
    restrictToUserId?: string,
  ): Promise<Map<string, Map<string, number>>> {
    const scope = workspaceScope(user, 'a');
    const params: unknown[] = [...scope.params, startKey, endKey];
    let userFilter = '';
    if (restrictToUserId) {
      params.push(parseTenantUserId(restrictToUserId));
      userFilter = `AND a.user_id = $${params.length}`;
    } else {
      const visibleIds = await this.visibleEmployeeIds(user);
      userFilter = this.applyVisibleUserFilter(visibleIds, params, 'a.user_id');
    }

    const result = await this.db.query<{
      user_id: string;
      work_date: string;
      delta_seconds: string | number;
    }>(
      `SELECT a.user_id::text AS user_id,
              a.work_date::text AS work_date,
              SUM(a.delta_seconds)::bigint AS delta_seconds
         FROM time_doctor.time_adjustments a
        WHERE ${scope.clause}
          AND a.work_date >= $${scope.params.length + 1}::date
          AND a.work_date <= $${scope.params.length + 2}::date
          ${userFilter}
        GROUP BY a.user_id, a.work_date`,
      params,
    );

    const byUser = new Map<string, Map<string, number>>();
    for (const row of result.rows) {
      const secs = Number(row.delta_seconds) || 0;
      const hours = Math.round((secs / 3600) * 10) / 10;
      if (!byUser.has(row.user_id)) byUser.set(row.user_id, new Map());
      byUser.get(row.user_id)!.set(String(row.work_date).slice(0, 10), hours);
    }
    return byUser;
  }

  async listTimeAdjustments(user: ScopedAuthUser, userId: string, workDate: string) {
    const targetId = parseTenantUserId(userId);
    const dayKey = String(workDate).slice(0, 10);
    const scope = workspaceScope(user, 'a');
    const params: unknown[] = [...scope.params, targetId, dayKey];

    const result = await this.db.query<{
      id: string;
      user_id: string;
      work_date: string;
      delta_seconds: number;
      reason: string;
      created_by: string;
      created_by_email: string | null;
      created_by_name: string | null;
      created_at: string;
    }>(
      `SELECT a.id::text AS id,
              a.user_id::text AS user_id,
              a.work_date::text AS work_date,
              a.delta_seconds,
              a.reason,
              a.created_by::text AS created_by,
              u.email AS created_by_email,
              trim(both ' ' from coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) AS created_by_name,
              a.created_at::text AS created_at
         FROM time_doctor.time_adjustments a
         LEFT JOIN tenant."user" u ON u.id = a.created_by
        WHERE ${scope.clause}
          AND a.user_id = $${scope.params.length + 1}
          AND a.work_date = $${scope.params.length + 2}::date
        ORDER BY a.created_at DESC`,
      params,
    );

    return {
      user_id: String(targetId),
      work_date: dayKey,
      adjustments: result.rows.map((r) => ({
        id: r.id,
        user_id: r.user_id,
        work_date: String(r.work_date).slice(0, 10),
        delta_seconds: Number(r.delta_seconds) || 0,
        delta_hours: Math.round(((Number(r.delta_seconds) || 0) / 3600) * 100) / 100,
        reason: r.reason,
        created_by: r.created_by,
        created_by_email: r.created_by_email,
        created_by_name: r.created_by_name || r.created_by_email,
        created_at: r.created_at,
      })),
    };
  }

  async createTimeAdjustment(
    user: ScopedAuthUser,
    input: {
      userId: string;
      workDate: string;
      deltaSeconds?: number;
      hours?: number;
      deltaMinutes?: number;
      reason: string;
    },
  ) {
    const targetId = parseTenantUserId(input.userId);
    const adminId = parseTenantUserId(user.id);
    const workDate = String(input.workDate).slice(0, 10);
    const reason = String(input.reason || '').trim();
    if (reason.length < 3) {
      throw new BadRequestException('reason must be at least 3 characters');
    }

    const deltaSeconds = resolveAdjustmentDeltaSeconds(input);
    if (!deltaSeconds) {
      throw new BadRequestException('Provide a non-zero hours, deltaMinutes, or deltaSeconds');
    }
    if (Math.abs(deltaSeconds) > 86400) {
      throw new BadRequestException('Adjustment cannot exceed 24 hours per action');
    }

    const wsId = parseWorkspaceId(user.organization_id);
    if (!user.is_super_admin && !wsId) {
      throw new BadRequestException('Workspace context required');
    }

    // Target must be a trackable employee in this workspace.
    const targetParams: unknown[] = [targetId];
    let targetSql = `
      SELECT u.id, ext.workspace_id
        FROM tenant."user" u
        JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
       WHERE u.id = $1
         AND ${TRACKABLE_PULSE_ROLES_SQL}`;
    if (!user.is_super_admin && wsId) {
      targetParams.push(wsId);
      targetSql += ` AND ext.workspace_id = $2`;
    }
    const target = await this.db.query<{ id: number; workspace_id: number }>(
      targetSql,
      targetParams,
    );
    if (!target.rows[0]) {
      throw new BadRequestException('Employee not found in this workspace');
    }
    const workspaceId = target.rows[0].workspace_id;

    const orgSettings = await this.getOrgSettings(user);
    const workTz = orgSettings.timezone;
    const { startIso, endExclusiveIso } = workDateRangeToUtcIso(workDate, workDate, workTz);
    const logs = await this.fetchTimeLogsInRange(user, startIso, endExclusiveIso, String(targetId));
    const trackedMap = this.dailyHoursFromLogs(logs, workTz);
    const trackedHours = trackedMap.get(String(targetId))?.get(workDate) ?? 0;

    const netResult = await this.db.query<{ net: string | number }>(
      `SELECT COALESCE(SUM(delta_seconds), 0)::bigint AS net
         FROM time_doctor.time_adjustments
        WHERE user_id = $1
          AND work_date = $2::date
          AND workspace_id = $3`,
      [targetId, workDate, workspaceId],
    );
    const currentNetSec = Number(netResult.rows[0]?.net) || 0;
    const nextNetSec = currentNetSec + deltaSeconds;
    const nextTotalHours = nextDayTotalHours(trackedHours, currentNetSec, deltaSeconds);
    if (nextTotalHours == null) {
      throw new BadRequestException(
        `Adjustment would make the day total negative (tracked ${trackedHours.toFixed(1)}h, ` +
          `current adjustments ${(currentNetSec / 3600).toFixed(1)}h)`,
      );
    }

    const inserted = await this.db.query<{
      id: string;
      delta_seconds: number;
      created_at: string;
    }>(
      `INSERT INTO time_doctor.time_adjustments
         (workspace_id, user_id, work_date, delta_seconds, reason, created_by)
       VALUES ($1, $2, $3::date, $4, $5, $6)
       RETURNING id::text AS id, delta_seconds, created_at::text AS created_at`,
      [workspaceId, targetId, workDate, deltaSeconds, reason, adminId],
    );

    try {
      await this.db.query(
        `INSERT INTO time_doctor.time_log_events
           (user_id, workspace_id, action, source, duration_delta_seconds, meta)
         VALUES ($1, $2, 'admin_time_adjustment', 'pulse-admin', $3, $4::jsonb)`,
        [
          targetId,
          workspaceId,
          deltaSeconds,
          JSON.stringify({
            work_date: workDate,
            reason,
            created_by: adminId,
            adjustment_id: inserted.rows[0]?.id,
          }),
        ],
      );
    } catch (err) {
      this.logger.warn(
        `time_log_events audit for adjustment failed: ${(err as Error)?.message || err}`,
      );
    }

    const row = inserted.rows[0];
    return {
      success: true,
      adjustment: {
        id: row.id,
        user_id: String(targetId),
        work_date: workDate,
        delta_seconds: Number(row.delta_seconds) || deltaSeconds,
        delta_hours: Math.round((deltaSeconds / 3600) * 100) / 100,
        reason,
        created_by: String(adminId),
        created_at: row.created_at,
      },
      tracked_hours: trackedHours,
      adjustment_hours: Math.round((nextNetSec / 3600) * 10) / 10,
      hours_worked: Math.max(0, Math.round(nextTotalHours * 10) / 10),
    };
  }

  private dailyIdleSecondsFromTimeLogs(
    logs: Array<{
      user_id: string;
      start_time: string | Date;
      idle_seconds: number | null;
    }>,
    tz?: string,
  ): Map<string, Map<string, number>> {
    const workTz = normalizeWorkTimezone(tz);
    const byUserDay = new Map<string, Map<string, number>>();

    for (const log of logs) {
      const seconds = log.idle_seconds ?? 0;
      if (seconds <= 0) continue;

      const day = toDateKey(log.start_time, workTz);
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
   * Idle periods shorter than this are ignored on the dashboard.
   * Aligns historical idle_logs with the desktop rule: idle starts after 5 minutes
   * of OS inactivity (reading / short pauses should not count).
   */
  private static readonly MIN_IDLE_REPORT_SECONDS = 5 * 60;

  private dailyLowActivityFromIdleLogs(
    logs: Array<{
      user_id: string;
      idle_start: string | Date;
      idle_end: string | Date | null;
      duration_seconds: number | null;
    }>,
    tz?: string,
  ): Map<string, Map<string, number>> {
    const workTz = normalizeWorkTimezone(tz);
    const byUserDay = new Map<string, Map<string, number>>();

    for (const log of logs) {
      const startMs = new Date(log.idle_start).getTime();
      let endMs = log.idle_end ? new Date(log.idle_end).getTime() : Date.now();
      if (log.duration_seconds && log.duration_seconds > 0) {
        const fromDuration = startMs + log.duration_seconds * 1000;
        if (!log.idle_end || fromDuration > endMs) endMs = fromDuration;
      }
      if (!(endMs > startMs)) continue;

      const totalSeconds = Math.round((endMs - startMs) / 1000);
      // Approximate Option B on history: drop sub-5-minute idle stretches.
      if (totalSeconds < PulseService.MIN_IDLE_REPORT_SECONDS) continue;

      let cursor = startMs;
      while (cursor < endMs) {
        const day = workDateKey(new Date(cursor), workTz);
        const { startMs: dayStart, endMs: dayEnd } = workDayBoundsMs(day, workTz);
        const clipStart = Math.max(startMs, dayStart);
        const clipEnd = Math.min(endMs, dayEnd);
        if (clipEnd > clipStart) {
          const hours = Math.round(((clipEnd - clipStart) / 3600000) * 10) / 10;
          if (!byUserDay.has(log.user_id)) byUserDay.set(log.user_id, new Map());
          const dayMap = byUserDay.get(log.user_id)!;
          dayMap.set(day, Math.round(((dayMap.get(day) ?? 0) + hours) * 10) / 10);
        }
        cursor = dayEnd;
      }
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

  /**
   * Sustained quiet required before a low screenshot counts toward LOW hours.
   * At 1-min intervals, N=3 (three consecutive quiet minutes). At 10-min, N=1.
   */
  private static readonly SUSTAINED_LOW_MINUTES = 3;

  private sustainedLowStreakNeeded(intervalMinutes: number): number {
    const interval = Math.max(1, Number(intervalMinutes) || 1);
    return Math.max(1, Math.ceil(PulseService.SUSTAINED_LOW_MINUTES / interval));
  }

  /**
   * Low-activity duration from screenshots below threshold.
   * Only counts low shots that sit in a consecutive streak of length >= N
   * (interval-aware), so 1/min capture does not treat every brief pause as LOW.
   */
  private async fetchLowActivityHoursFromScreenshots(
    user: ScopedAuthUser,
    start: string,
    end: string,
    lowActivityThreshold: number,
    intervalMinutes: number,
    userId?: string,
    tz?: string,
  ): Promise<Map<string, Map<string, number>>> {
    const workTz = normalizeWorkTimezone(tz);
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
    const intervalHours = Math.max(1, Number(intervalMinutes) || 1) / 60;
    const streakNeeded = this.sustainedLowStreakNeeded(intervalMinutes);

    const result = await this.db.query<{
      user_id: string;
      activity_date: string;
      captured_at: string;
      activity_percent: number | null;
      is_low: boolean;
    }>(
      `SELECT
         s.user_id::text AS user_id,
         ${sqlWorkDate('s.captured_at', workTz)}::text AS activity_date,
         s.captured_at,
         s.activity_percent,
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

    type Shot = { activity_date: string; is_low: boolean };
    const byUserShots = new Map<string, Shot[]>();
    for (const row of result.rows) {
      if (!byUserShots.has(row.user_id)) byUserShots.set(row.user_id, []);
      byUserShots.get(row.user_id)!.push({
        activity_date: row.activity_date,
        is_low: Boolean(row.is_low),
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
        const streakLen = j - i;
        if (streakLen >= streakNeeded) {
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

    for (const dayMap of byUserDay.values()) {
      for (const [day, hours] of dayMap) {
        dayMap.set(day, Math.round(hours * 10) / 10);
      }
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
    } else {
      const visibleIds = await this.visibleEmployeeIds(user);
      const visibleFilter = this.applyVisibleUserFilter(visibleIds, userParams);
      if (visibleFilter) userFilters.push(visibleFilter.replace(/^\s*AND\s+/i, ''));
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

    const startKey = String(start).slice(0, 10);
    const endKey = String(end).slice(0, 10);
    const workTz = settings.timezone;
    const { startIso, endExclusiveIso } = workDateRangeToUtcIso(startKey, endKey, workTz);
    const logs = await this.fetchTimeLogsInRange(user, startIso, endExclusiveIso, restrictToUserId);
    const idleLogs = await this.fetchIdleLogsInRange(user, startIso, endExclusiveIso, restrictToUserId);
    const dailyByUser = this.dailyHoursFromLogs(logs, workTz);
    const adjustmentByUser = await this.fetchAdjustmentHoursInRange(
      user,
      startKey,
      endKey,
      restrictToUserId,
    );
    const lowActivityCutoff = lowActivityCutoffPercent(settings);
    const lowActivityByUser = await this.fetchLowActivityHoursFromScreenshots(
      user,
      startIso,
      endExclusiveIso,
      lowActivityCutoff,
      settings.screenshot_interval_minutes,
      restrictToUserId,
      workTz,
    );
    // Idle: OS inactivity stretches ≥ 5 min (idle_logs); short periods ignored.
    // Fallback time_logs.idle_seconds only when no idle_logs exist for that day.
    const idleByUser = this.dailyIdleHoursByUserDay(
      this.dailyLowActivityFromIdleLogs(idleLogs, workTz),
      this.dailyIdleSecondsFromTimeLogs(logs, workTz),
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

    const days = eachWorkDateKey(startKey, endKey, workTz);

    return {
      hours_threshold: settings.hours_threshold,
      low_activity_threshold: settings.low_activity_threshold,
      low_activity_cutoff: lowActivityCutoff,
      high_activity_threshold: settings.high_activity_threshold,
      screenshot_interval_minutes: settings.screenshot_interval_minutes,
      timezone: workTz,
      start: startKey,
      end: endKey,
      employees: usersResult.rows.map((emp) => {
        const dayMap = dailyByUser.get(emp.id) ?? new Map();
        const adjMap = adjustmentByUser.get(emp.id) ?? new Map();
        const lowActivityMap = lowActivityByUser.get(emp.id) ?? new Map();
        const idleMap = idleByUser.get(emp.id) ?? new Map();
        return {
          employee_id: emp.id,
          full_name: emp.full_name,
          email: emp.email,
          manager_email: emp.manager_id ? managerEmails.get(emp.manager_id) ?? null : null,
          days: days.map((date) => {
            const trackedHours = dayMap.get(date) ?? 0;
            const adjustmentHours = adjMap.get(date) ?? 0;
            const hoursWorked = Math.max(
              0,
              Math.round((trackedHours + adjustmentHours) * 10) / 10,
            );
            const lowRaw = lowActivityMap.get(date) ?? 0;
            const idleRaw = idleMap.get(date) ?? 0;
            // Idle/low-activity stay based on tracked sessions only.
            const lowActivityHours =
              trackedHours > 0 ? Math.min(lowRaw, trackedHours) : lowRaw;
            const idleHours = trackedHours > 0 ? Math.min(idleRaw, trackedHours) : idleRaw;
            const effective = computeEffectiveTime(
              hoursWorked,
              lowActivityHours,
              idleHours,
            );

            return {
              date,
              tracked_hours: trackedHours,
              adjustment_hours: adjustmentHours,
              hours_worked: hoursWorked,
              low_activity_hours: Math.round(lowActivityHours * 10) / 10,
              idle_hours: Math.round(idleHours * 10) / 10,
              non_effective_hours: effective.non_effective_hours,
              effective_hours: effective.effective_hours,
              below_threshold: hoursWorked < settings.hours_threshold,
            };
          }),
        };
      }),
    };
  }

  /**
   * Hours tracked per project in the Pacific work-date range.
   * Same visibility rules as daily-hours (admin/delegates → visible set; else self).
   */
  async getProjectHours(
    user: ScopedAuthUser,
    start: string,
    end: string,
    restrictToUserId?: string,
  ) {
    const settings = await this.getOrgSettings(user);
    const workTz = settings.timezone;
    const startKey = String(start).slice(0, 10);
    const endKey = String(end).slice(0, 10);
    const { startIso, endExclusiveIso } = workDateRangeToUtcIso(startKey, endKey, workTz);
    const scope = workspaceScope(user, 't');
    const params: unknown[] = [...scope.params, startIso, endExclusiveIso];
    const startIdx = scope.params.length + 1;
    const endIdx = scope.params.length + 2;

    let userFilter = '';
    if (restrictToUserId) {
      params.push(parseTenantUserId(restrictToUserId));
      userFilter = `AND t.user_id = $${params.length}`;
    } else {
      const visibleIds = await this.visibleEmployeeIds(user);
      userFilter = this.applyVisibleUserFilter(visibleIds, params, 't.user_id');
    }

    const result = await this.db.query<{
      project_id: string;
      name: string;
      hours: number;
    }>(
      `SELECT
         COALESCE(p.id::text, 'none') AS project_id,
         COALESCE(NULLIF(TRIM(p.name), ''), 'No project') AS name,
         ROUND((
           SUM(
             EXTRACT(EPOCH FROM (
               LEAST(COALESCE(t.end_time, NOW()), $${endIdx}::timestamptz)
               - GREATEST(t.start_time, $${startIdx}::timestamptz)
             ))
           ) / 3600.0
         )::numeric, 1)::float8 AS hours
       FROM time_doctor.time_logs t
       LEFT JOIN time_doctor.projects p ON p.id = t.project_id
       LEFT JOIN tenant."user" u ON u.id = t.user_id
       WHERE ${scope.clause}
         AND t.start_time < $${endIdx}::timestamptz
         AND COALESCE(t.end_time, NOW()) > $${startIdx}::timestamptz
         AND t.start_time >= ($${startIdx}::timestamptz - INTERVAL '3 days')
         AND LEAST(COALESCE(t.end_time, NOW()), $${endIdx}::timestamptz)
             > GREATEST(t.start_time, $${startIdx}::timestamptz)
         ${userFilter}
         AND COALESCE(u.email, '') NOT ILIKE '%@example.com%'
       GROUP BY 1, 2
       HAVING SUM(
         EXTRACT(EPOCH FROM (
           LEAST(COALESCE(t.end_time, NOW()), $${endIdx}::timestamptz)
           - GREATEST(t.start_time, $${startIdx}::timestamptz)
         ))
       ) > 0
       ORDER BY hours DESC, name ASC`,
      params,
    );

    return {
      start: startKey,
      end: endKey,
      timezone: workTz,
      projects: result.rows.map((row) => ({
        project_id: row.project_id,
        name: row.name,
        hours: Number(row.hours) || 0,
      })),
    };
  }

  async getActivityLevels(user: ScopedAuthUser, start: string, end: string) {
    const settings = await this.getOrgSettings(user);
    const scope = workspaceScope(user, 'ext');
    const { startIso, endExclusiveIso } = workDateRangeToUtcIso(
      String(start).slice(0, 10),
      String(end).slice(0, 10),
      settings.timezone,
    );
    const params: unknown[] = [...scope.params, startIso, endExclusiveIso];
    const visibleIds = await this.visibleEmployeeIds(user);
    const visibleFilter = this.applyVisibleUserFilter(visibleIds, params);

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
         ${sqlWorkDate('s.captured_at')}::text AS activity_date,
         COALESCE(SUM(s.mouse_clicks + s.keystrokes), 0)::text AS total_inputs,
         GREATEST(COUNT(*) * 5, 1)::text AS tracked_minutes,
         COALESCE(AVG(s.activity_percent), 0)::text AS avg_activity_percent
       FROM time_doctor.screenshots s
       JOIN tenant."user" u ON u.id = s.user_id
       JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
       WHERE ${scope.clause}
         AND s.captured_at >= $${scope.params.length + 1}::timestamptz
         AND s.captured_at < $${scope.params.length + 2}::timestamptz
         AND u.email NOT ILIKE '%@example.com%'
         ${visibleFilter}
       GROUP BY s.user_id, u.first_name, u.last_name, u.email, ${sqlWorkDate('s.captured_at')}
       ORDER BY full_name, activity_date`,
      params,
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
    const userParams: unknown[] = [...scope.params];
    const visibleIds = await this.visibleEmployeeIds(user);
    const visibleFilter = this.applyVisibleUserFilter(visibleIds, userParams);
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
         ${visibleFilter}
       ORDER BY full_name ASC NULLS LAST`,
      userParams,
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
    const userParams: unknown[] = [...scope.params];
    const visibleIds = await this.visibleEmployeeIds(user);
    const visibleFilter = this.applyVisibleUserFilter(visibleIds, userParams);
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
         ${visibleFilter}
       ORDER BY full_name ASC NULLS LAST`,
      userParams,
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
    const lowActivityCutoff = lowActivityCutoffPercent(settings);

    const todayKey = workDateKey(new Date());

    // Clamp to Pacific today so local calendars ahead of PT don't 400.
    let checkDate = anchorDate?.trim().slice(0, 10) || todayKey;
    if (checkDate > todayKey) {
      checkDate = todayKey;
    }
    let checkBounds: { startMs: number; endMs: number };
    try {
      checkBounds = workDayBoundsMs(checkDate);
    } catch {
      throw new BadRequestException('Invalid date');
    }

    const previousKey = workDateKey(new Date(checkBounds.startMs - 1));
    const { startIso: checkStartIso, endExclusiveIso: checkEndIso } =
      workDateRangeToUtcIso(checkDate, checkDate);
    const { startIso: prevStartIso, endExclusiveIso: prevEndIso } =
      workDateRangeToUtcIso(previousKey, previousKey);

    const scope = workspaceScope(user, 'ext');
    const userParams: unknown[] = [...scope.params];
    const visibleIds = await this.visibleEmployeeIds(user);
    const visibleFilter = this.applyVisibleUserFilter(visibleIds, userParams);
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
         ${visibleFilter}
       ORDER BY full_name ASC NULLS LAST`,
      userParams,
    );

    const logs = await this.fetchTimeLogsInRange(user, prevStartIso, checkEndIso);
    const idleLogs = await this.fetchIdleLogsInRange(user, prevStartIso, checkEndIso);
    const dailyByUser = this.dailyHoursFromLogs(logs);
    const lowActivityByUser = await this.fetchLowActivityHoursFromScreenshots(
      user,
      prevStartIso,
      checkEndIso,
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

    let leads = usersResult.rows.filter(
      (u) => u.role === 'admin' || u.role === 'manager' || u.role === 'team_leader',
    );

    let employees = usersResult.rows.filter((u) => u.role === 'employee');

    // Team leads only see themselves as a lead + their direct reports (roster, not reports).
    if (user.role === 'team_leader' && !user.is_super_admin) {
      leads = leads.filter((u) => u.id === user.id);
      employees = employees.filter((e) => e.manager_id === user.id);
    }

    // Team leads may see roster only — not teammate hours/reports.
    const includeHours = user.role !== 'team_leader' || Boolean(user.is_super_admin);

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
          weekly_hours: includeHours ? weeklyHours.get(e.id) ?? 0 : null,
        }));

    const showUnassigned = includeHours;

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
      unassigned_employees: showUnassigned
        ? employees
            .filter((e) => !e.manager_id)
            .map((e) => ({
              id: e.id,
              full_name: e.full_name,
              email: e.email,
              weekly_hours: weeklyHours.get(e.id) ?? 0,
            }))
        : [],
    };
  }

  /** Daily email target defaults to 8h (weekly pace still uses week × 35h math). */
  private resolveDailyHoursThreshold(
    _settingsThreshold: number,
    override?: number | string | null,
  ): number {
    if (override === undefined || override === null || override === '') {
      return 8;
    }
    const n = Number(override);
    if (!Number.isFinite(n)) return 8;
    return Math.min(8, Math.max(1, Math.round(n)));
  }

  /** Weekly Email Reporting: default 40h (5 × 8), selectable 1–40. */
  private resolveWeeklyHoursThreshold(override?: number | string | null): number {
    if (override === undefined || override === null || override === '') {
      return 40;
    }
    const n = Number(override);
    if (!Number.isFinite(n)) return 40;
    return Math.min(40, Math.max(1, Math.round(n)));
  }

  private addCalendarDays(dateKey: string, delta: number): string {
    const [y, m, d] = dateKey.split('-').map((n) => parseInt(n, 10));
    const dt = new Date(Date.UTC(y, m - 1, d + delta));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
      dt.getUTCDate(),
    ).padStart(2, '0')}`;
  }

  /** Monday (YYYY-MM-DD) for the calendar week containing dateKey. */
  private mondayKey(dateKey: string): string {
    const [y, m, d] = dateKey.split('-').map((n) => parseInt(n, 10));
    const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(); // 0=Sun
    const fromMon = (dow + 6) % 7;
    return this.addCalendarDays(dateKey, -fromMon);
  }

  private async loadTrackableEmployeesWithManagers(user: ScopedAuthUser) {
    const scope = workspaceScope(user, 'ext');
    const usersResult = await this.db.query<{
      id: string;
      full_name: string | null;
      email: string;
      manager_id: string | null;
      department: string | null;
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

    return { users: usersResult.rows, managerMap };
  }

  /**
   * Employees below hours threshold.
   * - period=day: single date (legacy)
   * - period=week: one Mon–Fri work week
   * - period=pace (default for Email Reporting): month-to-date through week N (35/70/105… targets)
   */
  async getLowHours(
    user: ScopedAuthUser,
    opts: {
      period?: string | null;
      date?: string | null;
      week_start?: string | null;
      month?: string | null;
      week_index?: number | string | null;
      hours_threshold?: number | string | null;
      pace_percent?: number | string | null;
    },
  ) {
    const periodRaw = String(opts.period || 'pace').toLowerCase();
    const period =
      periodRaw === 'day' || periodRaw === 'week' || periodRaw === 'pace'
        ? periodRaw
        : 'pace';

    if (period === 'pace') {
      return this.getLowHoursPace(user, opts);
    }

    if (period === 'week') {
      let anchor = String(opts.week_start || opts.date || '').trim();
      const monthKey = String(opts.month || '').trim();
      let weekIndex = Number(opts.week_index);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor) && /^\d{4}-\d{2}$/.test(monthKey)) {
        const mondays = this.mondaysInMonth(monthKey);
        if (!mondays.length) {
          throw new BadRequestException('No work weeks found in month');
        }
        if (!Number.isFinite(weekIndex) || weekIndex < 1) weekIndex = mondays.length;
        weekIndex = Math.min(Math.max(1, Math.round(weekIndex)), mondays.length);
        anchor = mondays[weekIndex - 1];
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) {
        throw new BadRequestException(
          'week_start/date (YYYY-MM-DD) or month + week_index is required for week',
        );
      }
      return this.getLowHoursWeekly(user, anchor, opts.hours_threshold, {
        month: monthKey || anchor.slice(0, 7),
        week_index: Number.isFinite(weekIndex) && weekIndex >= 1 ? weekIndex : undefined,
      });
    }

    const date = String(opts.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('date is required (YYYY-MM-DD)');
    }
    return this.getLowHoursDaily(user, date, opts.hours_threshold);
  }

  /** Mondays (YYYY-MM-DD) whose calendar month matches YYYY-MM. */
  private mondaysInMonth(monthKey: string): string[] {
    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      throw new BadRequestException('month must be YYYY-MM');
    }
    const [y, m] = monthKey.split('-').map((n) => parseInt(n, 10));
    const mondays: string[] = [];
    for (let day = 1; day <= 31; day++) {
      const key = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dt = new Date(Date.UTC(y, m - 1, day, 12));
      if (dt.getUTCMonth() + 1 !== m) break;
      if (dt.getUTCDay() === 1) mondays.push(key);
    }
    return mondays;
  }

  private countWeekdays(startKey: string, endKeyInclusive: string): number {
    let count = 0;
    for (const day of eachWorkDateKey(startKey, endKeyInclusive)) {
      const [y, m, d] = day.split('-').map((n) => parseInt(n, 10));
      const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
      if (dow >= 1 && dow <= 5) count += 1;
    }
    return count;
  }

  /**
   * Pace engine (simple):
   * - Week 1 / 2 / 3… = Mondays in that month
   * - Count hours from first Monday through Friday of week N
   * - Target = N × 35h (7h/day × 5 days)
   */
  private async getLowHoursPace(
    user: ScopedAuthUser,
    opts: {
      month?: string | null;
      week_index?: number | string | null;
      week_start?: string | null;
      date?: string | null;
      hours_threshold?: number | string | null;
      pace_percent?: number | string | null;
    },
  ) {
    let monthKey = String(opts.month || '').trim();
    let weekIndex = Number(opts.week_index);
    let checkpointMonday = String(opts.week_start || '').trim();

    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      if (checkpointMonday && /^\d{4}-\d{2}-\d{2}$/.test(checkpointMonday)) {
        monthKey = this.mondayKey(checkpointMonday).slice(0, 7);
      } else {
        monthKey = workDateKey(new Date()).slice(0, 7);
      }
    }

    const mondays = this.mondaysInMonth(monthKey);
    if (!mondays.length) {
      throw new BadRequestException('No work weeks found in month');
    }

    if (checkpointMonday && /^\d{4}-\d{2}-\d{2}$/.test(checkpointMonday)) {
      checkpointMonday = this.mondayKey(checkpointMonday);
      weekIndex = mondays.indexOf(checkpointMonday) + 1;
    }
    if (!Number.isFinite(weekIndex) || weekIndex < 1) {
      weekIndex = mondays.length;
    }
    weekIndex = Math.min(Math.max(1, Math.round(weekIndex)), mondays.length);
    checkpointMonday = mondays[weekIndex - 1];

    const periodStart = mondays[0]; // first Monday of month — not calendar day 1
    const weekEnd = this.addCalendarDays(checkpointMonday, 4); // Friday of week N
    const todayKey = workDateKey(new Date());
    const effectiveEnd = weekEnd > todayKey ? todayKey : weekEnd;

    // Simple rule: week 1 = 35, week 2 = 70, week 3 = 105…
    const hoursPerWeek = 35;
    const hoursPerDay = 7;
    const autoExpected = weekIndex * hoursPerWeek;
    let hoursThreshold = autoExpected;
    if (opts.hours_threshold !== undefined && opts.hours_threshold !== null && opts.hours_threshold !== '') {
      const n = Number(opts.hours_threshold);
      if (Number.isFinite(n) && n > 0) {
        hoursThreshold = Math.min(200, Math.max(1, Math.round(n)));
      }
    }
    let pacePercent = 100;
    if (opts.pace_percent !== undefined && opts.pace_percent !== null && opts.pace_percent !== '') {
      const p = Number(opts.pace_percent);
      if (Number.isFinite(p)) pacePercent = Math.min(100, Math.max(50, Math.round(p)));
    }
    const cutoff = Math.round(hoursThreshold * (pacePercent / 100) * 10) / 10;
    const workdays = weekIndex * 5;

    const weeksInMonth = mondays.map((mon, i) => ({
      week_index: i + 1,
      week_start: mon,
      week_end: this.addCalendarDays(mon, 4),
      expected_hours: (i + 1) * hoursPerWeek,
    }));

    if (effectiveEnd < periodStart) {
      return {
        period: 'pace' as const,
        date: checkpointMonday,
        month: monthKey,
        week_index: weekIndex,
        week_start: checkpointMonday,
        week_end: weekEnd,
        period_start: periodStart,
        period_end: effectiveEnd,
        workdays: 0,
        hours_per_day: hoursPerDay,
        hours_threshold: hoursThreshold,
        expected_hours: hoursThreshold,
        auto_expected_hours: autoExpected,
        pace_percent: pacePercent,
        cutoff_hours: cutoff,
        weeks_in_month: weeksInMonth,
        employees: [],
      };
    }

    const dayKeys = eachWorkDateKey(periodStart, effectiveEnd).filter((d) => {
      const [y, m, dd] = d.split('-').map((n) => parseInt(n, 10));
      const dow = new Date(Date.UTC(y, m - 1, dd, 12)).getUTCDay();
      return dow >= 1 && dow <= 5;
    });
    const { startIso, endExclusiveIso } = workDateRangeToUtcIso(periodStart, effectiveEnd);
    const logs = await this.fetchTimeLogsInRange(user, startIso, endExclusiveIso);
    const dailyByUser = this.dailyHoursFromLogs(logs);
    // Same Low + Idle metrics as Daily Hours dashboard.
    const settings = await this.getOrgSettings(user);
    const lowActivityCutoff = lowActivityCutoffPercent(settings);
    const lowActivityByUser = await this.fetchLowActivityHoursFromScreenshots(
      user,
      startIso,
      endExclusiveIso,
      lowActivityCutoff,
      settings.screenshot_interval_minutes,
    );
    const idleLogs = await this.fetchIdleLogsInRange(user, startIso, endExclusiveIso);
    const idleByUser = this.dailyIdleHoursByUserDay(
      this.dailyLowActivityFromIdleLogs(idleLogs),
      this.dailyIdleSecondsFromTimeLogs(logs),
    );
    const { users, managerMap } = await this.loadTrackableEmployeesWithManagers(user);

    const below = users
      .map((emp) => {
        const dayMap = dailyByUser.get(emp.id) ?? new Map<string, number>();
        const lowMap = lowActivityByUser.get(emp.id) ?? new Map<string, number>();
        const idleMap = idleByUser.get(emp.id) ?? new Map<string, number>();
        let hours = 0;
        let lowTotal = 0;
        let idleTotal = 0;
        let nonEffectiveTotal = 0;
        let effectiveTotal = 0;
        for (const day of dayKeys) {
          hours += dayMap.get(day) ?? 0;
        }
        hours = Math.round(hours * 10) / 10;
        const mgr = emp.manager_id ? managerMap.get(emp.manager_id) : null;
        const pace =
          hoursThreshold > 0
            ? Math.round((hours / hoursThreshold) * 1000) / 10
            : 0;
        const daily_hours: Record<string, number> = {};
        const daily_low_activity: Record<string, number> = {};
        const daily_idle: Record<string, number> = {};
        const daily_non_effective: Record<string, number> = {};
        const daily_effective: Record<string, number> = {};
        for (const day of dayKeys) {
          const worked = dayMap.get(day) ?? 0;
          const lowRaw = lowMap.get(day) ?? 0;
          const idleRaw = idleMap.get(day) ?? 0;
          const low = worked > 0 ? Math.min(lowRaw, worked) : lowRaw;
          const idle = worked > 0 ? Math.min(idleRaw, worked) : idleRaw;
          const eff = computeEffectiveTime(worked, low, idle);
          daily_hours[day] = worked;
          daily_low_activity[day] = Math.round(low * 10) / 10;
          daily_idle[day] = Math.round(idle * 10) / 10;
          daily_non_effective[day] = eff.non_effective_hours;
          daily_effective[day] = eff.effective_hours;
          lowTotal += daily_low_activity[day];
          idleTotal += daily_idle[day];
          nonEffectiveTotal += eff.non_effective_hours;
          effectiveTotal += eff.effective_hours;
        }
        return {
          employee_id: emp.id,
          full_name: emp.full_name,
          email: emp.email,
          department: emp.department,
          hours_worked: hours,
          low_activity_hours: Math.round(lowTotal * 10) / 10,
          idle_hours: Math.round(idleTotal * 10) / 10,
          non_effective_hours: Math.round(nonEffectiveTotal * 10) / 10,
          effective_hours: Math.round(effectiveTotal * 10) / 10,
          expected_hours: hoursThreshold,
          pace_percent: pace,
          hours_short: Math.round(Math.max(0, hoursThreshold - hours) * 10) / 10,
          manager_email: mgr?.email ?? null,
          manager_name: mgr?.full_name ?? null,
          below_threshold: hours < cutoff,
          daily_hours,
          daily_low_activity,
          daily_idle,
          daily_non_effective,
          daily_effective,
          day_keys: dayKeys,
        };
      })
      .filter((e) => e.below_threshold)
      .sort((a, b) => a.hours_worked - b.hours_worked);

    return {
      period: 'pace' as const,
      date: checkpointMonday,
      month: monthKey,
      week_index: weekIndex,
      week_start: checkpointMonday,
      week_end: weekEnd,
      period_start: periodStart,
      period_end: effectiveEnd,
      workdays,
      hours_per_day: hoursPerDay,
      hours_threshold: hoursThreshold,
      expected_hours: hoursThreshold,
      auto_expected_hours: autoExpected,
      pace_percent: pacePercent,
      cutoff_hours: cutoff,
      weeks_in_month: weeksInMonth,
      day_keys: dayKeys,
      employees: below,
    };
  }

  private async getLowHoursDaily(
    user: ScopedAuthUser,
    date: string,
    hoursThresholdOverride?: number | string | null,
  ) {
    const settings = await this.getOrgSettings(user);
    const hoursThreshold = this.resolveDailyHoursThreshold(
      settings.hours_threshold,
      hoursThresholdOverride,
    );
    const { startIso, endExclusiveIso } = workDateRangeToUtcIso(date, date);
    const logs = await this.fetchTimeLogsInRange(user, startIso, endExclusiveIso);
    const dailyByUser = this.dailyHoursFromLogs(logs);
    const lowActivityCutoff = lowActivityCutoffPercent(settings);
    const lowActivityByUser = await this.fetchLowActivityHoursFromScreenshots(
      user,
      startIso,
      endExclusiveIso,
      lowActivityCutoff,
      settings.screenshot_interval_minutes,
    );
    const idleLogs = await this.fetchIdleLogsInRange(user, startIso, endExclusiveIso);
    const idleByUser = this.dailyIdleHoursByUserDay(
      this.dailyLowActivityFromIdleLogs(idleLogs),
      this.dailyIdleSecondsFromTimeLogs(logs),
    );
    const { users, managerMap } = await this.loadTrackableEmployeesWithManagers(user);

    const below = users
      .map((emp) => {
        const hours = Math.round((dailyByUser.get(emp.id)?.get(date) ?? 0) * 10) / 10;
        const lowRaw = lowActivityByUser.get(emp.id)?.get(date) ?? 0;
        const idleRaw = idleByUser.get(emp.id)?.get(date) ?? 0;
        const lowHours = Math.round((hours > 0 ? Math.min(lowRaw, hours) : lowRaw) * 10) / 10;
        const idleHours = Math.round((hours > 0 ? Math.min(idleRaw, hours) : idleRaw) * 10) / 10;
        const eff = computeEffectiveTime(hours, lowHours, idleHours);
        const mgr = emp.manager_id ? managerMap.get(emp.manager_id) : null;
        const short = Math.round(Math.max(0, hoursThreshold - hours) * 10) / 10;
        return {
          employee_id: emp.id,
          full_name: emp.full_name,
          email: emp.email,
          department: (emp as any).department ?? null,
          hours_worked: hours,
          low_activity_hours: lowHours,
          idle_hours: idleHours,
          non_effective_hours: eff.non_effective_hours,
          effective_hours: eff.effective_hours,
          expected_hours: hoursThreshold,
          hours_short: short,
          manager_email: mgr?.email ?? null,
          manager_name: mgr?.full_name ?? null,
          below_threshold: hours < hoursThreshold,
          daily_hours: { [date]: hours },
          daily_low_activity: { [date]: lowHours },
          daily_idle: { [date]: idleHours },
          daily_non_effective: { [date]: eff.non_effective_hours },
          daily_effective: { [date]: eff.effective_hours },
          day_keys: [date],
        };
      })
      .filter((e) => e.below_threshold)
      .sort((a, b) => a.hours_worked - b.hours_worked);

    return {
      period: 'day' as const,
      date,
      week_start: date,
      week_end: date,
      period_start: date,
      period_end: date,
      day_keys: [date],
      hours_threshold: hoursThreshold,
      expected_hours: hoursThreshold,
      employees: below,
    };
  }

  private async getLowHoursWeekly(
    user: ScopedAuthUser,
    anchorDate: string,
    hoursThresholdOverride?: number | string | null,
    meta?: { month?: string; week_index?: number },
  ) {
    const settings = await this.getOrgSettings(user);
    const workTz = settings.timezone;
    const weekStart = this.mondayKey(anchorDate);
    const weekEnd = this.addCalendarDays(weekStart, 4); // Friday (work week)
    const todayKey = workDateKey(new Date(), workTz);
    const effectiveEnd = weekEnd > todayKey ? todayKey : weekEnd;
    const hoursThreshold = this.resolveWeeklyHoursThreshold(hoursThresholdOverride);
    const dayKeys = eachWorkDateKey(weekStart, effectiveEnd, workTz).filter((d) => {
      const [y, m, dd] = d.split('-').map((n) => parseInt(n, 10));
      const dow = new Date(Date.UTC(y, m - 1, dd, 12)).getUTCDay();
      return dow >= 1 && dow <= 5;
    });

    const monthKey = meta?.month || weekStart.slice(0, 7);
    let weekIndex = meta?.week_index;
    if (!weekIndex) {
      const mondays = this.mondaysInMonth(monthKey);
      const idx = mondays.indexOf(weekStart);
      weekIndex = idx >= 0 ? idx + 1 : 1;
    }

    if (effectiveEnd < weekStart) {
      return {
        period: 'week' as const,
        date: weekStart,
        month: monthKey,
        week_index: weekIndex,
        week_start: weekStart,
        week_end: weekEnd,
        period_start: weekStart,
        period_end: effectiveEnd,
        day_keys: [] as string[],
        hours_threshold: hoursThreshold,
        expected_hours: hoursThreshold,
        timezone: workTz,
        employees: [],
      };
    }

    const { startIso, endExclusiveIso } = workDateRangeToUtcIso(weekStart, effectiveEnd, workTz);
    const logs = await this.fetchTimeLogsInRange(user, startIso, endExclusiveIso);
    const dailyByUser = this.dailyHoursFromLogs(logs, workTz);
    const lowActivityCutoff = lowActivityCutoffPercent(settings);
    const lowActivityByUser = await this.fetchLowActivityHoursFromScreenshots(
      user,
      startIso,
      endExclusiveIso,
      lowActivityCutoff,
      settings.screenshot_interval_minutes,
      undefined,
      workTz,
    );
    const idleLogs = await this.fetchIdleLogsInRange(user, startIso, endExclusiveIso);
    const idleByUser = this.dailyIdleHoursByUserDay(
      this.dailyLowActivityFromIdleLogs(idleLogs, workTz),
      this.dailyIdleSecondsFromTimeLogs(logs, workTz),
    );
    const { users, managerMap } = await this.loadTrackableEmployeesWithManagers(user);

    const below = users
      .map((emp) => {
        const dayMap = dailyByUser.get(emp.id) ?? new Map<string, number>();
        const lowMap = lowActivityByUser.get(emp.id) ?? new Map<string, number>();
        const idleMap = idleByUser.get(emp.id) ?? new Map<string, number>();
        let hours = 0;
        let lowTotal = 0;
        let idleTotal = 0;
        let nonEffectiveTotal = 0;
        let effectiveTotal = 0;
        const daily_hours: Record<string, number> = {};
        const daily_low_activity: Record<string, number> = {};
        const daily_idle: Record<string, number> = {};
        const daily_non_effective: Record<string, number> = {};
        const daily_effective: Record<string, number> = {};
        for (const day of dayKeys) {
          const worked = dayMap.get(day) ?? 0;
          const lowRaw = lowMap.get(day) ?? 0;
          const idleRaw = idleMap.get(day) ?? 0;
          const low = worked > 0 ? Math.min(lowRaw, worked) : lowRaw;
          const idle = worked > 0 ? Math.min(idleRaw, worked) : idleRaw;
          const eff = computeEffectiveTime(worked, low, idle);
          hours += worked;
          daily_hours[day] = worked;
          daily_low_activity[day] = Math.round(low * 10) / 10;
          daily_idle[day] = Math.round(idle * 10) / 10;
          daily_non_effective[day] = eff.non_effective_hours;
          daily_effective[day] = eff.effective_hours;
          lowTotal += daily_low_activity[day];
          idleTotal += daily_idle[day];
          nonEffectiveTotal += eff.non_effective_hours;
          effectiveTotal += eff.effective_hours;
        }
        hours = Math.round(hours * 10) / 10;
        const mgr = emp.manager_id ? managerMap.get(emp.manager_id) : null;
        return {
          employee_id: emp.id,
          full_name: emp.full_name,
          email: emp.email,
          department: (emp as any).department ?? null,
          hours_worked: hours,
          low_activity_hours: Math.round(lowTotal * 10) / 10,
          idle_hours: Math.round(idleTotal * 10) / 10,
          non_effective_hours: Math.round(nonEffectiveTotal * 10) / 10,
          effective_hours: Math.round(effectiveTotal * 10) / 10,
          expected_hours: hoursThreshold,
          hours_short: Math.round(Math.max(0, hoursThreshold - hours) * 10) / 10,
          manager_email: mgr?.email ?? null,
          manager_name: mgr?.full_name ?? null,
          below_threshold: hours < hoursThreshold,
          daily_hours,
          daily_low_activity,
          daily_idle,
          daily_non_effective,
          daily_effective,
          day_keys: dayKeys,
        };
      })
      .filter((e) => e.below_threshold)
      .sort((a, b) => a.hours_worked - b.hours_worked);

    return {
      period: 'week' as const,
      date: weekStart,
      month: monthKey,
      week_index: weekIndex,
      week_start: weekStart,
      week_end: weekEnd,
      period_start: weekStart,
      period_end: effectiveEnd,
      /** Work calendar for hour bucketing (not browser local). */
      timezone: settings.timezone,
      day_keys: dayKeys,
      hours_threshold: hoursThreshold,
      expected_hours: hoursThreshold,
      employees: below,
    };
  }

  getEmailSenders() {
    return this.sesEmail.getAllowedSenders();
  }

  private emailLogHoursWidened = false;

  /** Pace MTD targets exceed NUMERIC(4,2); widen once if needed. */
  private async ensureLowHoursEmailLogHoursWidth() {
    if (this.emailLogHoursWidened) return;
    try {
      await this.db.query(`
        ALTER TABLE time_doctor.low_hours_email_log
          ALTER COLUMN hours_worked TYPE NUMERIC(8,2),
          ALTER COLUMN hours_threshold TYPE NUMERIC(8,2)
      `);
    } catch (err: any) {
      // Already widened / no permission — ignore; insert will surface real errors.
      this.logger.debug(`ensureLowHoursEmailLogHoursWidth: ${err?.message || err}`);
    }
    this.emailLogHoursWidened = true;
  }

  private async insertLowHoursEmailLog(row: {
    workspaceId: string | number | null;
    employeeId: string;
    employeeEmail: string;
    managerEmail: string | null;
    workDate: string;
    periodType: string;
    periodEnd: string;
    hoursWorked: number;
    hoursThreshold: number;
    sentBy: string;
    status: string;
  }) {
    const params = [
      row.workspaceId,
      parseTenantUserId(row.employeeId),
      row.employeeEmail,
      row.managerEmail,
      row.workDate,
      row.periodType,
      row.periodEnd,
      row.hoursWorked,
      row.hoursThreshold,
      parseTenantUserId(row.sentBy),
      row.status,
    ];
    try {
      await this.db.query(
        `INSERT INTO time_doctor.low_hours_email_log
          (workspace_id, employee_id, employee_email, manager_email, work_date,
           period_type, period_end, hours_worked, hours_threshold, sent_by, status)
         VALUES ($1,$2,$3,$4,$5::date,$6,$7::date,$8,$9,$10,$11)`,
        params,
      );
    } catch (logErr: any) {
      const msg = String(logErr?.message || '');
      if (/numeric field overflow/i.test(msg)) {
        await this.ensureLowHoursEmailLogHoursWidth();
        await this.db.query(
          `INSERT INTO time_doctor.low_hours_email_log
            (workspace_id, employee_id, employee_email, manager_email, work_date,
             period_type, period_end, hours_worked, hours_threshold, sent_by, status)
           VALUES ($1,$2,$3,$4,$5::date,$6,$7::date,$8,$9,$10,$11)`,
          params,
        );
        return;
      }
      // Older DBs without migration 011 (period_type / period_end)
      if (!/period_type|period_end/i.test(msg)) throw logErr;
      await this.db.query(
        `INSERT INTO time_doctor.low_hours_email_log
          (workspace_id, employee_id, employee_email, manager_email, work_date,
           hours_worked, hours_threshold, sent_by, status)
         VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8,$9)`,
        [
          row.workspaceId,
          parseTenantUserId(row.employeeId),
          row.employeeEmail,
          row.managerEmail,
          row.workDate,
          row.hoursWorked,
          row.hoursThreshold,
          parseTenantUserId(row.sentBy),
          row.status,
        ],
      );
    }
  }

  async sendLowHoursEmails(
    user: ScopedAuthUser,
    body: {
      date?: string;
      week_start?: string;
      month?: string;
      week_index?: number;
      period?: string;
      employee_ids?: string[];
      notify_manager?: boolean;
      hours_threshold?: number;
      pace_percent?: number;
      from?: string;
    },
  ) {
    const periodRaw = String(body.period || 'pace').toLowerCase();
    const period =
      periodRaw === 'day' || periodRaw === 'week' || periodRaw === 'pace'
        ? periodRaw
        : 'pace';
    const lowHours = await this.getLowHours(user, {
      period,
      date: body.date,
      week_start: body.week_start || body.date,
      month: body.month,
      week_index: body.week_index,
      hours_threshold: body.hours_threshold,
      pace_percent: body.pace_percent,
    });
    let targets = lowHours.employees;
    if (body.employee_ids?.length) {
      const idSet = new Set(body.employee_ids.map(String));
      targets = targets.filter((e) => idSet.has(String(e.employee_id)));
    }

    if (!this.sesEmail.isEnabled()) {
      this.logger.warn('SES email not configured — recording send intent only');
    }

    await this.ensureLowHoursEmailLogHoursWidth();

    const from = this.sesEmail.resolveFrom(body.from);
    const sent: Array<{ employee_id: string; email: string; status: string }> = [];
    const wsId = this.workspaceId(user);
    const todayKey = workDateKey(new Date());

    for (const emp of targets) {
      const expectedHours = Number(lowHours.expected_hours ?? lowHours.hours_threshold);
      const periodStart = String((lowHours as any).period_start || lowHours.week_start);
      const periodEnd = String((lowHours as any).period_end || lowHours.week_end);
      const dayKeys: string[] =
        (emp as any).day_keys ||
        (lowHours as any).day_keys ||
        eachWorkDateKey(periodStart, periodEnd);

      const dailyHoursMap = new Map<string, number>(
        Object.entries(((emp as any).daily_hours || {}) as Record<string, number>),
      );
      const dailyLowMap = new Map<string, number>(
        Object.entries(((emp as any).daily_low_activity || {}) as Record<string, number>),
      );
      const dailyIdleMap = new Map<string, number>(
        Object.entries(((emp as any).daily_idle || {}) as Record<string, number>),
      );
      // Fallback when day/week path has no daily maps: single bucket.
      if (!dailyHoursMap.size && dayKeys.length) {
        const perDay = Number(emp.hours_worked) / dayKeys.length;
        for (const d of dayKeys) dailyHoursMap.set(d, Math.round(perDay * 100) / 100);
      }

      const metrics = buildPaceEmailMetrics({
        dayKeys,
        dailyHours: dailyHoursMap,
        dailyLowActivity: dailyLowMap,
        dailyIdle: dailyIdleMap,
        expectedHours,
        todayKey,
        // Day emails: Eff. Target = 7h (salary). Week/pace day rows use 7h eff. target.
        ...(period === 'day'
          ? { dailyTarget: DAILY_EFFECTIVE_TARGET_HOURS, useEffectiveGoal: true }
          : { dailyTarget: DAILY_EFFECTIVE_TARGET_HOURS }),
      });

      const emailVariant =
        period === 'day' ? 'day' : period === 'week' ? 'week' : 'pace';

      const employeeMail = buildApprovedPaceEmail({
        employeeName: emp.full_name,
        department: (emp as any).department ?? null,
        hoursWorked: metrics.hoursWorked || Number(emp.hours_worked),
        expectedHours,
        nonEffectiveHours: metrics.nonEffectiveHours,
        effectiveHours: metrics.effectiveHours,
        hoursRemaining: metrics.hoursRemaining,
        avgDailyPace: metrics.avgDailyPace,
        paceDelta: metrics.paceDelta,
        periodStart,
        periodEnd,
        weekIndex: Number((lowHours as any).week_index || 1),
        month: String((lowHours as any).month || periodStart.slice(0, 7)),
        dayRows: metrics.dayRows,
        fromEmail: from,
        variant: emailVariant,
        ...(period === 'day'
          ? { effectiveHoursTarget: DAILY_EFFECTIVE_TARGET_HOURS }
          : {}),
      });

      // Always CC ops; also CC manager when notify_manager is on.
      const toEmail = String(emp.email || '').trim().toLowerCase();
      const ccList = [
        'alysonclient@cintara.ai',
        'mohita@cintara.ai',
        ...(body.notify_manager && emp.manager_email
          ? [String(emp.manager_email).trim().toLowerCase()]
          : []),
      ].filter((addr, i, arr) => addr && addr !== toEmail && arr.indexOf(addr) === i);

      let status = 'logged';
      if (this.sesEmail.isEnabled() && emp.email) {
        const result = await this.sesEmail.send({
          to: emp.email,
          ...(ccList.length ? { cc: ccList } : {}),
          subject: employeeMail.subject,
          html: employeeMail.html,
          text: employeeMail.text,
          from,
        });
        status = result.ok ? 'sent' : `failed:${result.code || 'ERROR'}`;
      }

      const periodType = period === 'pace' ? 'pace' : period;
      try {
        await this.insertLowHoursEmailLog({
          workspaceId: wsId,
          employeeId: emp.employee_id,
          employeeEmail: emp.email,
          managerEmail: emp.manager_email,
          workDate: lowHours.week_start,
          periodType,
          periodEnd,
          hoursWorked: emp.hours_worked,
          hoursThreshold: lowHours.hours_threshold,
          sentBy: user.id,
          status,
        });
      } catch (logErr: any) {
        // Never fail the send because history logging failed.
        this.logger.warn(
          `low_hours_email_log insert failed for ${emp.email}: ${logErr?.message || logErr}`,
        );
      }

      sent.push({ employee_id: emp.employee_id, email: emp.email, status });
    }

    return {
      period: lowHours.period,
      month: (lowHours as any).month,
      week_index: (lowHours as any).week_index,
      week_start: lowHours.week_start,
      week_end: lowHours.week_end,
      period_start: (lowHours as any).period_start,
      period_end: (lowHours as any).period_end,
      date: lowHours.week_start,
      sent_count: sent.length,
      results: sent,
    };
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
    return result.rows.map((row: any) => {
      const start = String(row.work_date).slice(0, 10);
      const threshold = Number(row.hours_threshold);
      // Pace/week rows use large targets (35/70/105…); daily uses ≤8.
      const isMultiDay = threshold > 8;
      let periodEnd = start;
      if (isMultiDay) {
        const [y, m, d] = start.split('-').map((n: string) => parseInt(n, 10));
        const fri = new Date(Date.UTC(y, m - 1, d + 4));
        periodEnd = `${fri.getUTCFullYear()}-${String(fri.getUTCMonth() + 1).padStart(2, '0')}-${String(
          fri.getUTCDate(),
        ).padStart(2, '0')}`;
      }
      return {
        ...row,
        period_type: isMultiDay ? 'pace' : 'day',
        period_end: periodEnd,
      };
    });
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
