import { Injectable, Logger } from '@nestjs/common';
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

export interface OrgSettings {
  hours_threshold: number;
  high_activity_threshold: number;
  low_activity_threshold: number;
  screenshot_interval_minutes: number;
}

const DEFAULT_SETTINGS: OrgSettings = {
  hours_threshold: 7,
  high_activity_threshold: 60,
  low_activity_threshold: 30,
  screenshot_interval_minutes: 10,
};

/** node-pg returns TIMESTAMPTZ as Date; some callers pass ISO strings. */
function toDateKey(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
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

  async getDailyHours(user: ScopedAuthUser, start: string, end: string) {
    const settings = await this.getOrgSettings(user);
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

    const endExclusive = new Date(end);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    const logs = await this.fetchTimeLogsInRange(user, start, endExclusive.toISOString());
    const dailyByUser = this.dailyHoursFromLogs(logs);

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
      start,
      end,
      employees: usersResult.rows.map((emp) => {
        const dayMap = dailyByUser.get(emp.id) ?? new Map();
        return {
          employee_id: emp.id,
          full_name: emp.full_name,
          email: emp.email,
          manager_email: emp.manager_id ? managerEmails.get(emp.manager_id) ?? null : null,
          days: days.map((date) => ({
            date,
            hours_worked: dayMap.get(date) ?? 0,
            below_threshold: (dayMap.get(date) ?? 0) < settings.hours_threshold,
          })),
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
