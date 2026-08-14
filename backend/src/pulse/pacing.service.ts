import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { SesEmailService } from '../common/ses-email.service';
import {
  EMPLOYEE_USER_SELECT,
  ScopedAuthUser,
  TRACKABLE_PULSE_ROLES_SQL,
  canAdjustPulseTime,
  workspaceScope,
} from '../database/time-doctor-sql';
import { mergeTimeIntervals } from '../lib/time-merge';
import {
  normalizeWorkTimezone,
  workDateKey,
  workDateRangeToUtcIso,
  workDayBoundsMs,
} from '../lib/work-timezone';
import { matchesTeamLocation, TEAM_LEAVE_ALL_TEAMS } from '../leave/leave-days';
import {
  PACING_LEAVE_HOURS_PER_DAY,
  PACING_TARGET_HOURS_PER_WORKDAY,
  WEEKLY_HOURS_TARGET,
  addCalendarDays,
  computePacingRowMetrics,
  employmentWeekdays,
  lastDayOfMonth,
  leaveHoursFromFraction,
  mondayKey,
  round2,
  weeklySampleKeys,
  weekdayKeysInclusive,
} from './pacing-math';
import {
  buildPacingDigestCsv,
  buildPacingDigestEmail,
} from './pacing-email-templates';

type EmpRow = {
  id: string;
  full_name: string | null;
  email: string;
  department: string | null;
  location: string | null;
  manager_id: string | null;
  started_on: string | null;
};

@Injectable()
export class PacingService {
  private readonly logger = new Logger(PacingService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly sesEmail: SesEmailService,
    private readonly config: ConfigService,
  ) {}

  private ensureCanView(user: ScopedAuthUser) {
    if (!canAdjustPulseTime(user)) {
      throw new ForbiddenException('Manager or admin role required for pacing');
    }
  }

  private digestRecipients(requested?: string | string[] | null): string[] {
    const defaults = (
      (this.config.get<string>('PACING_DIGEST_TO') || '').trim() ||
      'hamza@cintara.ai,mohita@cintara.ai,alysonclient@cintara.ai'
    )
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const fromBody = (Array.isArray(requested) ? requested : requested ? [requested] : [])
      .flatMap((s) => String(s || '').split(','))
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const list = fromBody.length ? fromBody : defaults;
    return Array.from(new Set(list));
  }

  private async getWorkTimezone(user: ScopedAuthUser): Promise<string> {
    const scope = workspaceScope(user, 'ws');
    if (!scope.params.length) {
      return normalizeWorkTimezone(null);
    }
    const result = await this.db.query<{ settings: Record<string, unknown> }>(
      `SELECT settings FROM time_doctor.workspace_settings ws WHERE ${scope.clause} LIMIT 1`,
      scope.params,
    );
    const raw = result.rows[0]?.settings ?? {};
    return normalizeWorkTimezone(
      typeof raw.timezone === 'string' ? raw.timezone : undefined,
    );
  }

  private async loadEmployees(user: ScopedAuthUser): Promise<EmpRow[]> {
    const scope = workspaceScope(user, 'ext');
    const result = await this.db.query<EmpRow>(
      `${EMPLOYEE_USER_SELECT}
       WHERE ${scope.clause}
         AND ${TRACKABLE_PULSE_ROLES_SQL}
         AND u.email NOT ILIKE '%@example.com%'
         AND ext.paused_at IS NULL
       ORDER BY full_name ASC NULLS LAST`,
      scope.params,
    );
    return result.rows.map((r) => ({
      ...r,
      started_on: r.started_on ? String(r.started_on).slice(0, 10) : null,
    }));
  }

  private async fetchTrackedByUserDay(
    user: ScopedAuthUser,
    startKey: string,
    endKey: string,
    workTz: string,
  ): Promise<Map<string, Map<string, number>>> {
    const { startIso, endExclusiveIso } = workDateRangeToUtcIso(startKey, endKey, workTz);
    const scope = workspaceScope(user, 't');
    const params: unknown[] = [...scope.params, startIso, endExclusiveIso];
    const result = await this.db.query<{
      user_id: string;
      start_time: string;
      end_time: string | null;
    }>(
      `SELECT t.user_id::text AS user_id,
              t.start_time::text AS start_time,
              t.end_time::text AS end_time
         FROM time_doctor.time_logs t
         LEFT JOIN tenant."user" u ON u.id = t.user_id
        WHERE ${scope.clause}
          AND t.start_time < $${scope.params.length + 2}::timestamptz
          AND coalesce(t.end_time, t.last_alive_at, NOW()) > $${scope.params.length + 1}::timestamptz
          AND t.start_time >= ($${scope.params.length + 1}::timestamptz - INTERVAL '3 days')
          AND COALESCE(u.email, '') NOT ILIKE '%@example.com%'`,
      params,
    );

    const byUser = new Map<string, Array<{ startMs: number; endMs: number }>>();
    for (const row of result.rows) {
      const startMs = new Date(row.start_time).getTime();
      const endMs = row.end_time ? new Date(row.end_time).getTime() : Date.now();
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
      if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
      byUser.get(row.user_id)!.push({ startMs, endMs });
    }

    const byUserDay = new Map<string, Map<string, number>>();
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
        dayMap.set(day, round2(ms / 3600000));
      }
      byUserDay.set(userId, dayMap);
    }
    return byUserDay;
  }

  /** Non-leave adjustments only (avoid double-count with leave ledger credit). */
  private async fetchOtherAdjByUserDay(
    user: ScopedAuthUser,
    startKey: string,
    endKey: string,
  ): Promise<Map<string, Map<string, number>>> {
    const scope = workspaceScope(user, 'a');
    const params: unknown[] = [...scope.params, startKey, endKey];
    const result = await this.db.query<{
      user_id: string;
      work_date: string;
      delta_seconds: number;
    }>(
      `SELECT a.user_id::text AS user_id,
              a.work_date::text AS work_date,
              SUM(a.delta_seconds)::bigint AS delta_seconds
         FROM time_doctor.time_adjustments a
        WHERE ${scope.clause}
          AND a.work_date >= $${scope.params.length + 1}::date
          AND a.work_date <= $${scope.params.length + 2}::date
          AND (a.source_type IS NULL OR a.source_type NOT IN ('leave', 'leave_void'))
        GROUP BY a.user_id, a.work_date`,
      params,
    );
    const byUser = new Map<string, Map<string, number>>();
    for (const row of result.rows) {
      const day = String(row.work_date).slice(0, 10);
      const hours = round2((Number(row.delta_seconds) || 0) / 3600);
      if (!byUser.has(row.user_id)) byUser.set(row.user_id, new Map());
      byUser.get(row.user_id)!.set(day, hours);
    }
    return byUser;
  }

  /**
   * Leave day-fraction map per user (personal ∪ team, max fraction per day).
   * Credit hours = fraction × 8 (HR pacing leave rule).
   */
  private async fetchLeaveFractionByUserDay(
    user: ScopedAuthUser,
    employees: EmpRow[],
    rangeStart: string,
    rangeEnd: string,
  ): Promise<Map<string, Map<string, number>>> {
    const scope = workspaceScope(user, 'e');
    const personal = await this.db.query<{
      user_id: string;
      start_date: string;
      end_date: string;
      days: number;
    }>(
      `SELECT e.user_id::text AS user_id,
              e.start_date::text AS start_date,
              e.end_date::text AS end_date,
              e.days::float AS days
         FROM time_doctor.leave_events e
        WHERE ${scope.clause}
          AND e.status = 'active'
          AND e.end_date >= $${scope.params.length + 1}::date
          AND e.start_date <= $${scope.params.length + 2}::date`,
      [...scope.params, rangeStart, rangeEnd],
    );

    const teamScope = workspaceScope(user, 't');
    const team = await this.db.query<{
      location: string;
      team: string;
      start_date: string;
      end_date: string;
    }>(
      `SELECT t.location, t.team,
              t.start_date::text AS start_date,
              t.end_date::text AS end_date
         FROM time_doctor.team_leave_events t
        WHERE ${teamScope.clause}
          AND t.status = 'active'
          AND t.end_date >= $${teamScope.params.length + 1}::date
          AND t.start_date <= $${teamScope.params.length + 2}::date`,
      [...teamScope.params, rangeStart, rangeEnd],
    );

    const byUser = new Map<string, Map<string, number>>();
    const bump = (userId: string, day: string, fraction: number) => {
      if (!byUser.has(userId)) byUser.set(userId, new Map());
      const m = byUser.get(userId)!;
      const prev = m.get(day) ?? 0;
      m.set(day, Math.max(prev, Math.min(1, fraction)));
    };

    for (const ev of personal.rows) {
      const start = ev.start_date.slice(0, 10) > rangeStart ? ev.start_date.slice(0, 10) : rangeStart;
      const end = ev.end_date.slice(0, 10) < rangeEnd ? ev.end_date.slice(0, 10) : rangeEnd;
      const days = weekdayKeysInclusive(start, end);
      if (!days.length) continue;
      // If event.days is half of weekday span, treat as half-days; else full.
      const span = days.length;
      const declared = Number(ev.days);
      const perDay =
        Number.isFinite(declared) && span > 0 && declared > 0 && declared < span
          ? Math.min(1, declared / span)
          : 1;
      for (const day of days) bump(ev.user_id, day, perDay);
    }

    for (const emp of employees) {
      for (const ev of team.rows) {
        if (
          !matchesTeamLocation(
            emp.location,
            emp.department,
            ev.location,
            ev.team === TEAM_LEAVE_ALL_TEAMS ? TEAM_LEAVE_ALL_TEAMS : ev.team,
          )
        ) {
          continue;
        }
        const start = ev.start_date.slice(0, 10) > rangeStart ? ev.start_date.slice(0, 10) : rangeStart;
        const end = ev.end_date.slice(0, 10) < rangeEnd ? ev.end_date.slice(0, 10) : rangeEnd;
        for (const day of weekdayKeysInclusive(start, end)) {
          bump(emp.id, day, 1);
        }
      }
    }

    return byUser;
  }

  private sumMapDays(dayMap: Map<string, number> | undefined, days: string[]): number {
    if (!dayMap) return 0;
    let s = 0;
    for (const d of days) s += dayMap.get(d) ?? 0;
    return round2(s);
  }

  private leaveHoursForDays(
    leaveMap: Map<string, number> | undefined,
    days: string[],
  ): { credit: number; byDay: Map<string, number>; leaveDays: number } {
    const byDay = new Map<string, number>();
    let leaveDays = 0;
    let credit = 0;
    for (const d of days) {
      const frac = leaveMap?.get(d) ?? 0;
      if (frac <= 0) continue;
      leaveDays += frac;
      const h = leaveHoursFromFraction(frac);
      byDay.set(d, h);
      credit += h;
    }
    return { credit: round2(credit), byDay, leaveDays: round2(leaveDays) };
  }

  async getWeeklyReport(user: ScopedAuthUser, day?: string) {
    this.ensureCanView(user);
    const workTz = await this.getWorkTimezone(user);
    const today = workDateKey(new Date(), workTz);
    const anchor = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : today;
    const weekMonday = mondayKey(anchor);
    const weekSunday = addCalendarDays(weekMonday, 6);
    const weekFriday = addCalendarDays(weekMonday, 4);

    // Past week → rollup Friday; current → today capped
    let rollup = today;
    if (weekSunday < today) rollup = weekFriday;
    else if (today < weekMonday) rollup = weekMonday;
    else rollup = today > weekFriday ? weekFriday : today;

    const allWeekdays = weekdayKeysInclusive(weekMonday, weekSunday);
    const elapsedWeekdays = weekdayKeysInclusive(weekMonday, rollup);
    const remainingWeekdays = weekdayKeysInclusive(addCalendarDays(rollup, 1), weekSunday);
    const sampleKeysBase = weeklySampleKeys(weekMonday, rollup);

    const employees = await this.loadEmployees(user);
    const tracked = await this.fetchTrackedByUserDay(user, weekMonday, rollup, workTz);
    const otherAdj = await this.fetchOtherAdjByUserDay(user, weekMonday, rollup);
    const leaveFrac = await this.fetchLeaveFractionByUserDay(
      user,
      employees,
      weekMonday,
      weekSunday,
    );

    const rows = employees
      .map((emp) => {
        const started = emp.started_on;
        if (started && started > rollup) return null;

        const empElapsed = employmentWeekdays(elapsedWeekdays, started);
        const empRemaining = employmentWeekdays(remainingWeekdays, started);
        const empSample = employmentWeekdays(sampleKeysBase, started);
        // Weekly target stays 35 unless employee started mid-week → prorate by employment weekdays in Mon–Fri
        const empWeekWorkdays = employmentWeekdays(
          weekdayKeysInclusive(weekMonday, weekFriday),
          started,
        );
        const targetHours =
          empWeekWorkdays.length >= 5
            ? WEEKLY_HOURS_TARGET
            : round2(empWeekWorkdays.length * PACING_TARGET_HOURS_PER_WORKDAY);

        if (targetHours <= 0) return null;

        const trackedMap = tracked.get(emp.id);
        const adjMap = otherAdj.get(emp.id);
        const leave = this.leaveHoursForDays(leaveFrac.get(emp.id), empElapsed);

        const hoursWorkedLogged = this.sumMapDays(trackedMap, empElapsed);
        const otherAdjustmentHours = this.sumMapDays(adjMap, empElapsed);

        const dailyHoursSample = empSample.map((d) =>
          round2(
            (trackedMap?.get(d) ?? 0) +
              (leave.byDay.get(d) ?? 0) +
              (adjMap?.get(d) ?? 0),
          ),
        );

        const metrics = computePacingRowMetrics({
          hoursWorkedLogged,
          leaveHoursCredit: leave.credit,
          otherAdjustmentHours,
          targetHours,
          dailyHoursSample,
          remainingWorkDays: empRemaining.length,
          mode: 'weekly',
        });

        return {
          id: emp.id,
          email: emp.email,
          name: emp.full_name || emp.email,
          department: emp.department,
          location: emp.location,
          started_on: started,
          manager_id: emp.manager_id,
          leaveDays: leave.leaveDays,
          remainingWorkDays: empRemaining.length,
          elapsedWorkDays: empElapsed.length,
          totalWorkDays: empWeekWorkdays.length,
          weekProgressPct: empWeekWorkdays.length
            ? round2((empElapsed.length / empWeekWorkdays.length) * 100)
            : 0,
          sampleDays: empSample,
          ...metrics,
        };
      })
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      mode: 'weekly' as const,
      timezone: workTz,
      week_start: weekMonday,
      week_end: weekSunday,
      week_friday: weekFriday,
      rollup_day: rollup,
      target_hours_default: WEEKLY_HOURS_TARGET,
      leave_hours_per_day: PACING_LEAVE_HOURS_PER_DAY,
      target_hours_per_workday: PACING_TARGET_HOURS_PER_WORKDAY,
      rows,
      summary: {
        employees: rows.length,
        critical: rows.filter((r) => r.status === 'critical').length,
        at_risk: rows.filter((r) => r.status === 'at_risk').length,
        behind: rows.filter((r) => r.status === 'behind').length,
        on_track: rows.filter((r) => r.status === 'on_track').length,
        target_met: rows.filter((r) => r.status === 'target_met').length,
      },
    };
  }

  async getMonthlyReport(
    user: ScopedAuthUser,
    opts: { month?: string; start?: string; end?: string },
  ) {
    this.ensureCanView(user);
    const workTz = await this.getWorkTimezone(user);
    const today = workDateKey(new Date(), workTz);

    let periodStart: string;
    let periodEnd: string;
    let monthKey: string | null = null;

    if (opts.start && opts.end) {
      periodStart = String(opts.start).slice(0, 10);
      periodEnd = String(opts.end).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
        throw new BadRequestException('start/end must be YYYY-MM-DD');
      }
      if (periodEnd < periodStart) {
        throw new BadRequestException('end must be on or after start');
      }
      const span = eachDateCount(periodStart, periodEnd);
      if (span > 366) {
        periodEnd = addCalendarDays(periodStart, 365);
      }
    } else {
      monthKey = String(opts.month || today.slice(0, 7));
      if (!/^\d{4}-\d{2}$/.test(monthKey)) {
        throw new BadRequestException('month must be YYYY-MM');
      }
      periodStart = `${monthKey}-01`;
      periodEnd = lastDayOfMonth(monthKey);
    }

    let rollup = today;
    if (periodEnd < today) rollup = periodEnd;
    else if (today < periodStart) rollup = periodStart;
    else rollup = today > periodEnd ? periodEnd : today;

    const allWeekdays = weekdayKeysInclusive(periodStart, periodEnd);
    const elapsedWeekdays = weekdayKeysInclusive(periodStart, rollup);
    const remainingWeekdays = weekdayKeysInclusive(addCalendarDays(rollup, 1), periodEnd);

    const employees = await this.loadEmployees(user);
    const tracked = await this.fetchTrackedByUserDay(user, periodStart, rollup, workTz);
    const otherAdj = await this.fetchOtherAdjByUserDay(user, periodStart, rollup);
    const leaveFrac = await this.fetchLeaveFractionByUserDay(
      user,
      employees,
      periodStart,
      periodEnd,
    );

    const rows = employees
      .map((emp) => {
        const started = emp.started_on;
        if (started && started > rollup) return null;

        const empAll = employmentWeekdays(allWeekdays, started);
        const empElapsed = employmentWeekdays(elapsedWeekdays, started);
        const empRemaining = employmentWeekdays(remainingWeekdays, started);
        const targetHours = round2(empAll.length * PACING_TARGET_HOURS_PER_WORKDAY);
        if (targetHours <= 0) return null;

        const trackedMap = tracked.get(emp.id);
        const adjMap = otherAdj.get(emp.id);
        const leave = this.leaveHoursForDays(leaveFrac.get(emp.id), empElapsed);

        const hoursWorkedLogged = this.sumMapDays(trackedMap, empElapsed);
        const otherAdjustmentHours = this.sumMapDays(adjMap, empElapsed);

        const dailyHoursSample = empElapsed.map((d) =>
          round2(
            (trackedMap?.get(d) ?? 0) +
              (leave.byDay.get(d) ?? 0) +
              (adjMap?.get(d) ?? 0),
          ),
        );

        const metrics = computePacingRowMetrics({
          hoursWorkedLogged,
          leaveHoursCredit: leave.credit,
          otherAdjustmentHours,
          targetHours,
          dailyHoursSample,
          remainingWorkDays: empRemaining.length,
          mode: 'monthly',
        });

        return {
          id: emp.id,
          email: emp.email,
          name: emp.full_name || emp.email,
          department: emp.department,
          location: emp.location,
          started_on: started,
          manager_id: emp.manager_id,
          leaveDays: leave.leaveDays,
          remainingWorkDays: empRemaining.length,
          elapsedWorkDays: empElapsed.length,
          totalWorkDays: empAll.length,
          monthProgressPct: empAll.length
            ? round2((empElapsed.length / empAll.length) * 100)
            : 0,
          sampleDays: empElapsed,
          ...metrics,
        };
      })
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      mode: 'monthly' as const,
      timezone: workTz,
      month: monthKey,
      period_start: periodStart,
      period_end: periodEnd,
      rollup_day: rollup,
      total_workdays_in_period: allWeekdays.length,
      target_hours_full_period: round2(allWeekdays.length * PACING_TARGET_HOURS_PER_WORKDAY),
      leave_hours_per_day: PACING_LEAVE_HOURS_PER_DAY,
      target_hours_per_workday: PACING_TARGET_HOURS_PER_WORKDAY,
      rows,
      summary: {
        employees: rows.length,
        critical: rows.filter((r) => r.status === 'critical').length,
        at_risk: rows.filter((r) => r.status === 'at_risk').length,
        behind: rows.filter((r) => r.status === 'behind').length,
        on_track: rows.filter((r) => r.status === 'on_track').length,
        target_met: rows.filter((r) => r.status === 'target_met').length,
      },
    };
  }

  /**
   * Email selected weekly/monthly pacing rows to HR
   * (default hamza@, mohita@, alysonclient@).
   * One digest message — not per-employee notices.
   */
  async sendPacingDigest(
    user: ScopedAuthUser,
    body: {
      mode?: string;
      day?: string;
      month?: string;
      employee_ids?: string[];
      to?: string | string[];
      from?: string;
    },
  ) {
    this.ensureCanView(user);
    const modeRaw = String(body.mode || 'weekly').toLowerCase();
    const mode = modeRaw === 'monthly' ? 'monthly' : 'weekly';
    const ids = Array.isArray(body.employee_ids)
      ? body.employee_ids.map(String).filter(Boolean)
      : [];
    if (!ids.length) {
      throw new BadRequestException('Select at least one employee');
    }
    const idSet = new Set(ids);

    const report =
      mode === 'weekly'
        ? await this.getWeeklyReport(user, body.day)
        : await this.getMonthlyReport(user, { month: body.month });

    const selected = report.rows.filter((r) => idSet.has(String(r.id)));
    if (!selected.length) {
      throw new BadRequestException('No matching employees in this pacing period');
    }

    // Summary counts for the selected subset only
    const summary = {
      critical: selected.filter((r) => r.status === 'critical').length,
      at_risk: selected.filter((r) => r.status === 'at_risk').length,
      behind: selected.filter((r) => r.status === 'behind').length,
      on_track: selected.filter((r) => r.status === 'on_track').length,
      target_met: selected.filter((r) => r.status === 'target_met').length,
    };

    const periodLabel =
      report.mode === 'weekly'
        ? `${report.week_start} → ${report.week_friday}`
        : `${report.period_start} → ${report.period_end}`;

    const digestRows = selected.map((r) => ({
      name: r.name,
      email: r.email,
      hoursWorkedLogged: r.hoursWorkedLogged,
      leaveHoursCredit: r.leaveHoursCredit,
      hoursWorked: r.hoursWorked,
      targetHours: r.targetHours,
      avgDailyPace: r.avgDailyPace,
      projectedPace: r.projectedPace,
      paceDelta: r.paceDelta,
      remainingWorkDays: r.remainingWorkDays,
      monthProgressPct:
        'monthProgressPct' in r
          ? (r as { monthProgressPct?: number }).monthProgressPct
          : undefined,
      status: r.status,
    }));

    const mail = buildPacingDigestEmail({
      mode: report.mode,
      periodLabel,
      rollupDay: String(report.rollup_day),
      timezone: String(report.timezone),
      leaveHoursPerDay: Number(report.leave_hours_per_day ?? PACING_LEAVE_HOURS_PER_DAY),
      rows: digestRows,
      summary,
    });

    const csv = buildPacingDigestCsv(report.mode, digestRows);
    const periodSlug =
      report.mode === 'weekly'
        ? String(report.week_start)
        : String(report.month || report.period_start).slice(0, 7);
    const csvFilename = `${report.mode}-pacing-${periodSlug}.csv`;

    const to = this.digestRecipients(body.to);
    if (!to.length) {
      throw new BadRequestException('No pacing digest recipients configured');
    }
    const from = this.sesEmail.resolveFrom(body.from);

    if (!this.sesEmail.isEnabled()) {
      this.logger.warn('SES email not configured — pacing digest not sent');
      throw new BadRequestException('Email sending is not configured');
    }

    const result = await this.sesEmail.send({
      to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      from,
      attachments: [
        {
          filename: csvFilename,
          contentType: 'text/csv; charset=utf-8',
          content: csv,
        },
      ],
    });

    if (!result.ok) {
      this.logger.error(`Pacing digest send failed: ${result.code || 'unknown'}`);
      throw new BadRequestException('Failed to send pacing email');
    }

    return {
      ok: true,
      mode,
      to,
      from,
      employee_count: selected.length,
      period_label: periodLabel,
      message_id: result.messageId || null,
      csv_filename: csvFilename,
      summary,
    };
  }
}

function eachDateCount(startKey: string, endKey: string): number {
  let n = 0;
  let cur = startKey;
  while (cur <= endKey) {
    n += 1;
    cur = addCalendarDays(cur, 1);
    if (n > 400) break;
  }
  return n;
}
