import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import {
  ScopedAuthUser,
  TRACKABLE_PULSE_ROLES_SQL,
  canAdjustPulseTime,
  parseTenantUserId,
  parseWorkspaceId,
  workspaceScope,
} from '../database/time-doctor-sql';
import { normalizeWorkTimezone, workDateKey } from '../lib/work-timezone';
import { GmailDwdService } from './gmail-dwd.service';
import { LeaveClassifyService, LeaveExtraction } from './leave-classify.service';
import {
  DEFAULT_LEAVE_CREDIT_HOURS_PER_DAY,
  TEAM_LEAVE_ALL_TEAMS,
  isLeaveType,
  leaveCreditSecondsPerDay,
  leaveDaysInclusive,
  leaveWeekdayKeys,
  matchesTeamLocation,
  normLeaveFacet,
} from './leave-days';
import type { LeaveScanIngestBatchRequest, LeaveScanJob } from './leave-scan.types';

type TrackableEmployee = {
  id: number;
  email: string;
  full_name: string;
  department: string | null;
  location: string | null;
};

@Injectable()
export class LeaveService {
  private readonly logger = new Logger(LeaveService.name);
  private readonly leaveScanFunctionName: string;
  private readonly leaveScanLambda: LambdaClient | null;

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
    private readonly gmail: GmailDwdService,
    private readonly classify: LeaveClassifyService,
  ) {
    this.leaveScanFunctionName = (config.get<string>('LEAVE_SCAN_FUNCTION_NAME') || '').trim();
    if (this.leaveScanFunctionName) {
      const region =
        config.get<string>('AWS_REGION') ||
        config.get<string>('COGNITO_REGION') ||
        'us-west-2';
      const lambdaEndpoint = (config.get<string>('LAMBDA_VPC_ENDPOINT_URL') || '').trim();
      this.leaveScanLambda = new LambdaClient({
        region,
        ...(lambdaEndpoint ? { endpoint: lambdaEndpoint } : {}),
      });
      this.logger.log(
        `Leave scan via non-VPC worker ${this.leaveScanFunctionName}` +
          (lambdaEndpoint ? ' (VPC Lambda endpoint)' : ''),
      );
    } else {
      this.leaveScanLambda = null;
    }
  }

  private ensureCanManage(user: ScopedAuthUser) {
    if (!canAdjustPulseTime(user)) {
      throw new ForbiddenException('Manager or admin role required for leave');
    }
  }

  private requireWorkspaceId(user: ScopedAuthUser): number {
    const wsId = parseWorkspaceId(user.organization_id);
    if (!wsId && !user.is_super_admin) {
      throw new BadRequestException('Workspace context required');
    }
    if (!wsId) {
      throw new BadRequestException('Workspace context required');
    }
    return wsId;
  }

  private creditHoursPerDay(): number {
    const raw = Number(this.config.get<string>('LEAVE_CREDIT_HOURS_PER_DAY'));
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_LEAVE_CREDIT_HOURS_PER_DAY;
  }

  private async getWorkTimezone(workspaceId: number): Promise<string> {
    const result = await this.db.query<{ settings: Record<string, unknown> }>(
      `SELECT settings FROM time_doctor.workspace_settings WHERE workspace_id = $1 LIMIT 1`,
      [workspaceId],
    );
    const raw = result.rows[0]?.settings ?? {};
    return normalizeWorkTimezone(
      typeof raw.timezone === 'string' ? raw.timezone : undefined,
    );
  }

  private async audit(
    workspaceId: number,
    op: string,
    actorUserId: number | null,
    detail: Record<string, unknown>,
  ) {
    await this.db.query(
      `INSERT INTO time_doctor.leave_audit_log (workspace_id, op, actor_user_id, detail)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [workspaceId, op, actorUserId, JSON.stringify(detail)],
    );
  }

  private async loadTrackableEmployees(workspaceId: number): Promise<TrackableEmployee[]> {
    const result = await this.db.query<TrackableEmployee>(
      `SELECT u.id,
              lower(u.email) AS email,
              trim(both ' ' from coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) AS full_name,
              ext.department,
              ext.location
         FROM tenant."user" u
         JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
        WHERE ext.workspace_id = $1
          AND ext.paused_at IS NULL
          AND ${TRACKABLE_PULSE_ROLES_SQL}`,
      [workspaceId],
    );
    return result.rows;
  }

  private async resolveTrackableUser(
    workspaceId: number,
    userId: number,
  ): Promise<TrackableEmployee> {
    const result = await this.db.query<TrackableEmployee>(
      `SELECT u.id,
              lower(u.email) AS email,
              trim(both ' ' from coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) AS full_name,
              ext.department,
              ext.location
         FROM tenant."user" u
         JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
        WHERE u.id = $1
          AND ext.workspace_id = $2
          AND ext.paused_at IS NULL
          AND ${TRACKABLE_PULSE_ROLES_SQL}`,
      [userId, workspaceId],
    );
    if (!result.rows[0]) {
      throw new BadRequestException('Employee not found in this workspace');
    }
    return result.rows[0];
  }

  private findUserByEmails(
    employees: TrackableEmployee[],
    emails: string[],
  ): TrackableEmployee | null {
    const set = new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean));
    if (!set.size) return null;
    return employees.find((e) => set.has(e.email)) || null;
  }

  /** Insert +7h leave credits for each weekday; idempotent via unique source index. */
  private async creditLeaveDays(params: {
    workspaceId: number;
    userId: number;
    leaveEventId: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    workTz: string;
    createdBy: number;
    isTeam?: boolean;
    halfDay?: boolean;
  }): Promise<string[]> {
    let days = leaveWeekdayKeys(params.startDate, params.endDate, params.workTz);
    if (params.halfDay) {
      days = days.slice(0, 1);
    }
    const fullDelta = leaveCreditSecondsPerDay(this.creditHoursPerDay());
    const delta = params.halfDay ? Math.round(fullDelta / 2) : fullDelta;
    const credited: string[] = [];

    for (const workDate of days) {
      const reason = params.isTeam
        ? `Leave credit (team): ${params.leaveType} ${workDate}${params.halfDay ? ' (half)' : ''}`
        : `Leave credit: ${params.leaveType} ${workDate}${params.halfDay ? ' (half)' : ''}`;
      try {
        const inserted = await this.db.query<{ id: string }>(
          `INSERT INTO time_doctor.time_adjustments
             (workspace_id, user_id, work_date, delta_seconds, reason, created_by, source_type, source_id)
           VALUES ($1, $2, $3::date, $4, $5, $6, 'leave', $7::uuid)
           ON CONFLICT (workspace_id, user_id, work_date, source_type, source_id)
             WHERE (source_type = 'leave' AND source_id IS NOT NULL)
           DO NOTHING
           RETURNING id::text AS id`,
          [
            params.workspaceId,
            params.userId,
            workDate,
            delta,
            reason,
            params.createdBy,
            params.leaveEventId,
          ],
        );
        if (inserted.rows[0]?.id) credited.push(workDate);
      } catch (err) {
        this.logger.warn(
          `Leave credit insert failed for user ${params.userId} ${workDate}: ${String(err)}`,
        );
      }
    }
    return credited;
  }

  /** Append-only reverse of leave credits (leave_void source). */
  private async reverseLeaveCredits(params: {
    workspaceId: number;
    leaveEventId: string;
    createdBy: number;
  }): Promise<number> {
    const existing = await this.db.query<{
      user_id: number;
      work_date: string;
      delta_seconds: number;
    }>(
      `SELECT user_id, work_date::text AS work_date, delta_seconds
         FROM time_doctor.time_adjustments
        WHERE workspace_id = $1
          AND source_type = 'leave'
          AND source_id = $2::uuid`,
      [params.workspaceId, params.leaveEventId],
    );

    let reversed = 0;
    for (const row of existing.rows) {
      const delta = -Math.abs(Number(row.delta_seconds) || 0);
      if (!delta) continue;
      const workDate = String(row.work_date).slice(0, 10);
      try {
        const inserted = await this.db.query(
          `INSERT INTO time_doctor.time_adjustments
             (workspace_id, user_id, work_date, delta_seconds, reason, created_by, source_type, source_id)
           VALUES ($1, $2, $3::date, $4, $5, $6, 'leave_void', $7::uuid)
           ON CONFLICT (workspace_id, user_id, work_date, source_type, source_id)
             WHERE (source_type = 'leave_void' AND source_id IS NOT NULL)
           DO NOTHING
           RETURNING id`,
          [
            params.workspaceId,
            row.user_id,
            workDate,
            delta,
            `Leave void reverse: ${workDate}`,
            params.createdBy,
            params.leaveEventId,
          ],
        );
        if (inserted.rows[0]) reversed += 1;
      } catch (err) {
        this.logger.warn(`Leave void reverse failed ${workDate}: ${String(err)}`);
      }
    }
    return reversed;
  }

  // ---------------------------------------------------------------------------
  // Personal leave
  // ---------------------------------------------------------------------------

  async listEvents(user: ScopedAuthUser, opts?: { status?: string; userId?: string }) {
    this.ensureCanManage(user);
    const scope = workspaceScope(user, 'e');
    const params: unknown[] = [...scope.params];
    let filter = `WHERE ${scope.clause}`;
    if (opts?.status === 'active' || opts?.status === 'voided') {
      params.push(opts.status);
      filter += ` AND e.status = $${params.length}`;
    }
    if (opts?.userId) {
      params.push(parseTenantUserId(opts.userId));
      filter += ` AND e.user_id = $${params.length}`;
    }

    const result = await this.db.query(
      `SELECT e.id::text AS id,
              e.user_id::text AS user_id,
              lower(u.email) AS email,
              trim(both ' ' from coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) AS full_name,
              e.leave_type,
              e.start_date::text AS start_date,
              e.end_date::text AS end_date,
              e.days::float AS days,
              e.half_day,
              e.note,
              e.source,
              e.status,
              e.gmail_message_id,
              e.created_by::text AS created_by,
              e.created_at::text AS created_at,
              e.voided_at::text AS voided_at
         FROM time_doctor.leave_events e
         JOIN tenant."user" u ON u.id = e.user_id
        ${filter}
        ORDER BY e.start_date DESC, e.created_at DESC
        LIMIT 500`,
      params,
    );
    return { events: result.rows };
  }

  private async findOverlappingLeave(
    workspaceId: number,
    userId: number,
    startDate: string,
    endDate: string,
  ): Promise<{ id: string; start_date: string; end_date: string } | null> {
    const result = await this.db.query<{
      id: string;
      start_date: string;
      end_date: string;
    }>(
      `SELECT id::text AS id, start_date::text AS start_date, end_date::text AS end_date
         FROM time_doctor.leave_events
        WHERE workspace_id = $1
          AND user_id = $2
          AND status = 'active'
          AND start_date <= $4::date
          AND end_date >= $3::date
        LIMIT 1`,
      [workspaceId, userId, startDate, endDate],
    );
    return result.rows[0] || null;
  }

  async createEvent(
    user: ScopedAuthUser,
    input: {
      userId: string;
      leaveType: string;
      startDate: string;
      endDate: string;
      note?: string;
      source?: 'email' | 'manual';
      gmailMessageId?: string | null;
      halfDay?: boolean;
      skipOverlapCheck?: boolean;
    },
  ) {
    this.ensureCanManage(user);
    const workspaceId = this.requireWorkspaceId(user);
    const actorId = parseTenantUserId(user.id);
    const targetId = parseTenantUserId(input.userId);
    if (!isLeaveType(input.leaveType)) {
      throw new BadRequestException('Invalid leave type');
    }
    let startDate = String(input.startDate).slice(0, 10);
    let endDate = String(input.endDate).slice(0, 10);
    const halfDay = Boolean(input.halfDay);
    if (halfDay) {
      endDate = startDate;
    }
    if (endDate < startDate) {
      throw new BadRequestException('endDate must be on or after startDate');
    }

    await this.resolveTrackableUser(workspaceId, targetId);
    const workTz = await this.getWorkTimezone(workspaceId);
    let days = halfDay ? 0.5 : leaveDaysInclusive(startDate, endDate, workTz);
    if (days <= 0) {
      throw new BadRequestException('Leave range has no weekdays');
    }

    if (!input.skipOverlapCheck) {
      const overlap = await this.findOverlappingLeave(workspaceId, targetId, startDate, endDate);
      if (overlap) {
        throw new BadRequestException(
          `Overlaps existing leave ${overlap.start_date}–${overlap.end_date} (${overlap.id})`,
        );
      }
    }

    const inserted = await this.db.query<{ id: string }>(
      `INSERT INTO time_doctor.leave_events
         (workspace_id, user_id, leave_type, start_date, end_date, days, half_day, note, source, status, gmail_message_id, created_by)
       VALUES ($1, $2, $3, $4::date, $5::date, $6, $7, $8, $9, 'active', $10, $11)
       RETURNING id::text AS id`,
      [
        workspaceId,
        targetId,
        input.leaveType,
        startDate,
        endDate,
        days,
        halfDay,
        input.note?.trim() || null,
        input.source || 'manual',
        input.gmailMessageId || null,
        actorId,
      ],
    );
    const eventId = inserted.rows[0].id;

    const credited = await this.creditLeaveDays({
      workspaceId,
      userId: targetId,
      leaveEventId: eventId,
      leaveType: input.leaveType,
      startDate,
      endDate,
      workTz,
      createdBy: actorId,
      halfDay,
    });

    await this.audit(workspaceId, 'append_leave', actorId, {
      leave_event_id: eventId,
      user_id: targetId,
      leave_type: input.leaveType,
      start_date: startDate,
      end_date: endDate,
      days,
      half_day: halfDay,
      credited_days: credited,
    });

    return {
      id: eventId,
      user_id: String(targetId),
      leave_type: input.leaveType,
      start_date: startDate,
      end_date: endDate,
      days,
      half_day: halfDay,
      credited_days: credited,
      timezone: workTz,
    };
  }

  async voidEvent(user: ScopedAuthUser, eventId: string) {
    this.ensureCanManage(user);
    const workspaceId = this.requireWorkspaceId(user);
    const actorId = parseTenantUserId(user.id);
    const scope = workspaceScope(user, 'e');
    const params: unknown[] = [...scope.params, eventId];

    const existing = await this.db.query<{
      id: string;
      status: string;
      user_id: string;
    }>(
      `SELECT e.id::text AS id, e.status, e.user_id::text AS user_id
         FROM time_doctor.leave_events e
        WHERE ${scope.clause}
          AND e.id = $${scope.params.length + 1}::uuid
        LIMIT 1`,
      params,
    );
    const row = existing.rows[0];
    if (!row) throw new NotFoundException('Leave event not found');
    if (row.status === 'voided') {
      return { id: row.id, status: 'voided', reversed_days: 0 };
    }

    await this.db.query(
      `UPDATE time_doctor.leave_events
          SET status = 'voided', voided_at = NOW(), voided_by = $1
        WHERE id = $2::uuid AND workspace_id = $3`,
      [actorId, eventId, workspaceId],
    );

    const reversed = await this.reverseLeaveCredits({
      workspaceId,
      leaveEventId: eventId,
      createdBy: actorId,
    });

    await this.audit(workspaceId, 'void_leave', actorId, {
      leave_event_id: eventId,
      user_id: row.user_id,
      reversed_days: reversed,
    });

    return { id: eventId, status: 'voided', reversed_days: reversed };
  }

  // ---------------------------------------------------------------------------
  // Team leave
  // ---------------------------------------------------------------------------

  async listTeamEvents(user: ScopedAuthUser, opts?: { status?: string }) {
    this.ensureCanManage(user);
    const scope = workspaceScope(user, 't');
    const params: unknown[] = [...scope.params];
    let filter = `WHERE ${scope.clause}`;
    if (opts?.status === 'active' || opts?.status === 'voided') {
      params.push(opts.status);
      filter += ` AND t.status = $${params.length}`;
    }

    const result = await this.db.query(
      `SELECT t.id::text AS id,
              t.location,
              t.team,
              t.leave_type,
              t.start_date::text AS start_date,
              t.end_date::text AS end_date,
              t.days::float AS days,
              t.note,
              t.status,
              t.created_by::text AS created_by,
              t.created_at::text AS created_at,
              t.voided_at::text AS voided_at
         FROM time_doctor.team_leave_events t
        ${filter}
        ORDER BY t.start_date DESC
        LIMIT 200`,
      params,
    );
    return { events: result.rows };
  }

  async createTeamEvent(
    user: ScopedAuthUser,
    input: {
      location: string;
      team: string;
      leaveType: string;
      startDate: string;
      endDate: string;
      note?: string;
    },
  ) {
    this.ensureCanManage(user);
    const workspaceId = this.requireWorkspaceId(user);
    const actorId = parseTenantUserId(user.id);
    if (!isLeaveType(input.leaveType)) {
      throw new BadRequestException('Invalid leave type');
    }
    const startDate = String(input.startDate).slice(0, 10);
    const endDate = String(input.endDate).slice(0, 10);
    if (endDate < startDate) {
      throw new BadRequestException('endDate must be on or after startDate');
    }
    const location = normLeaveFacet(input.location, 'Unknown');
    const team = input.team === TEAM_LEAVE_ALL_TEAMS
      ? TEAM_LEAVE_ALL_TEAMS
      : normLeaveFacet(input.team, 'Unassigned');

    const workTz = await this.getWorkTimezone(workspaceId);
    const days = leaveDaysInclusive(startDate, endDate, workTz);
    if (days <= 0) {
      throw new BadRequestException('Leave range has no weekdays');
    }

    const inserted = await this.db.query<{ id: string }>(
      `INSERT INTO time_doctor.team_leave_events
         (workspace_id, location, team, leave_type, start_date, end_date, days, note, status, created_by)
       VALUES ($1, $2, $3, $4, $5::date, $6::date, $7, $8, 'active', $9)
       RETURNING id::text AS id`,
      [
        workspaceId,
        location,
        team,
        input.leaveType,
        startDate,
        endDate,
        days,
        input.note?.trim() || null,
        actorId,
      ],
    );
    const eventId = inserted.rows[0].id;

    const employees = await this.loadTrackableEmployees(workspaceId);
    const matched = employees.filter((e) =>
      matchesTeamLocation(e.location, e.department, location, team),
    );

    const creditedUsers: Array<{ user_id: number; days: string[] }> = [];
    for (const emp of matched) {
      const credited = await this.creditLeaveDays({
        workspaceId,
        userId: emp.id,
        leaveEventId: eventId,
        leaveType: input.leaveType,
        startDate,
        endDate,
        workTz,
        createdBy: actorId,
        isTeam: true,
      });
      if (credited.length) {
        creditedUsers.push({ user_id: emp.id, days: credited });
      }
    }

    await this.audit(workspaceId, 'append_team_leave', actorId, {
      team_leave_event_id: eventId,
      location,
      team,
      leave_type: input.leaveType,
      start_date: startDate,
      end_date: endDate,
      matched_users: matched.length,
      credited_users: creditedUsers.length,
    });

    return {
      id: eventId,
      location,
      team,
      leave_type: input.leaveType,
      start_date: startDate,
      end_date: endDate,
      days,
      matched_users: matched.length,
      credited_users: creditedUsers.length,
      timezone: workTz,
    };
  }

  async voidTeamEvent(user: ScopedAuthUser, eventId: string) {
    this.ensureCanManage(user);
    const workspaceId = this.requireWorkspaceId(user);
    const actorId = parseTenantUserId(user.id);
    const scope = workspaceScope(user, 't');

    const existing = await this.db.query<{ id: string; status: string }>(
      `SELECT t.id::text AS id, t.status
         FROM time_doctor.team_leave_events t
        WHERE ${scope.clause}
          AND t.id = $${scope.params.length + 1}::uuid
        LIMIT 1`,
      [...scope.params, eventId],
    );
    const row = existing.rows[0];
    if (!row) throw new NotFoundException('Team leave event not found');
    if (row.status === 'voided') {
      return { id: row.id, status: 'voided', reversed_days: 0 };
    }

    await this.db.query(
      `UPDATE time_doctor.team_leave_events
          SET status = 'voided', voided_at = NOW(), voided_by = $1
        WHERE id = $2::uuid AND workspace_id = $3`,
      [actorId, eventId, workspaceId],
    );

    const reversed = await this.reverseLeaveCredits({
      workspaceId,
      leaveEventId: eventId,
      createdBy: actorId,
    });

    await this.audit(workspaceId, 'void_team_leave', actorId, {
      team_leave_event_id: eventId,
      reversed_days: reversed,
    });

    return { id: eventId, status: 'voided', reversed_days: reversed };
  }

  // ---------------------------------------------------------------------------
  // Calendar / analytics / audit / inbox
  // ---------------------------------------------------------------------------

  async getCalendar(user: ScopedAuthUser, month: string) {
    this.ensureCanManage(user);
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestException('month must be YYYY-MM');
    }
    const start = `${month}-01`;
    const [y, m] = month.split('-').map((n) => parseInt(n, 10));
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const end = `${month}-${String(lastDay).padStart(2, '0')}`;

    const personal = await this.listEvents(user, { status: 'active' });
    const team = await this.listTeamEvents(user, { status: 'active' });

    const events = [
      ...personal.events
        .filter((e: any) => e.end_date >= start && e.start_date <= end)
        .map((e: any) => ({
          kind: 'personal' as const,
          id: e.id,
          label: e.full_name || e.email,
          leaveType: e.leave_type,
          startDate: e.start_date,
          endDate: e.end_date,
          days: e.days,
          userId: e.user_id,
        })),
      ...team.events
        .filter((e: any) => e.end_date >= start && e.start_date <= end)
        .map((e: any) => ({
          kind: 'team' as const,
          id: e.id,
          label: e.team === TEAM_LEAVE_ALL_TEAMS ? `${e.location} · All teams` : `${e.location} · ${e.team}`,
          leaveType: e.leave_type,
          startDate: e.start_date,
          endDate: e.end_date,
          days: e.days,
          location: e.location,
          team: e.team,
        })),
    ];

    return { month, start, end, events };
  }

  async getAnalytics(user: ScopedAuthUser, year?: number) {
    this.ensureCanManage(user);
    const workspaceId = this.requireWorkspaceId(user);
    const workTz = await this.getWorkTimezone(workspaceId);
    const y = year && Number.isFinite(year) ? year : parseInt(workDateKey(new Date(), workTz).slice(0, 4), 10);
    const yearStart = `${y}-01-01`;
    const yearEnd = `${y}-12-31`;

    const employees = await this.loadTrackableEmployees(workspaceId);
    const events = await this.listEvents(user, { status: 'active' });

    const byType: Record<string, number> = {};
    const byUser: Array<{
      user_id: string;
      email: string;
      full_name: string;
      days: number;
    }> = [];

    for (const emp of employees) {
      const mine = (events.events as any[]).filter(
        (e) => Number(e.user_id) === emp.id && e.end_date >= yearStart && e.start_date <= yearEnd,
      );
      let days = 0;
      for (const e of mine) {
        const start = e.start_date > yearStart ? e.start_date : yearStart;
        const end = e.end_date < yearEnd ? e.end_date : yearEnd;
        const d = leaveDaysInclusive(start, end, workTz);
        days += d;
        byType[e.leave_type] = (byType[e.leave_type] || 0) + d;
      }
      byUser.push({
        user_id: String(emp.id),
        email: emp.email,
        full_name: emp.full_name,
        days,
      });
    }

    byUser.sort((a, b) => b.days - a.days);

    return {
      year: y,
      timezone: workTz,
      credit_hours_per_day: this.creditHoursPerDay(),
      by_type: Object.entries(byType).map(([leave_type, days]) => ({ leave_type, days })),
      by_user: byUser,
      total_days: byUser.reduce((s, r) => s + r.days, 0),
      employees_with_leave: byUser.filter((r) => r.days > 0).length,
    };
  }

  async getAuditLog(user: ScopedAuthUser, limit = 100) {
    this.ensureCanManage(user);
    const scope = workspaceScope(user, 'a');
    const lim = Math.min(Math.max(limit, 1), 500);
    const result = await this.db.query(
      `SELECT a.id::text AS id,
              a.op,
              a.actor_user_id::text AS actor_user_id,
              u.email AS actor_email,
              a.detail,
              a.created_at::text AS created_at
         FROM time_doctor.leave_audit_log a
         LEFT JOIN tenant."user" u ON u.id = a.actor_user_id
        WHERE ${scope.clause}
        ORDER BY a.created_at DESC
        LIMIT ${lim}`,
      scope.params,
    );
    return { entries: result.rows };
  }

  async listInbox(
    user: ScopedAuthUser,
    opts?: { limit?: number; filter?: string; period?: string },
  ) {
    this.ensureCanManage(user);
    const scope = workspaceScope(user, 'i');
    const lim = Math.min(Math.max(opts?.limit ?? 200, 1), 500);
    const filter = String(opts?.filter || 'all').toLowerCase();
    const periodCfg = this.resolveScanPeriod(opts?.period || '30d');

    const clauses = [scope.clause];
    const params: unknown[] = [...scope.params];
    let p = params.length;

    // Restrict to emails received in the selected lookback window.
    p += 1;
    clauses.push(
      `COALESCE(i.received_at, i.scanned_at) >= NOW() - ($${p}::int * INTERVAL '1 day')`,
    );
    params.push(periodCfg.lookbackDays);

    if (filter === 'leave') {
      clauses.push(
        `i.classification IN ('approved','pending','unmatched','duplicate','leave','rejected')`,
      );
    }

    const result = await this.db.query(
      `SELECT i.id::text AS id,
              i.gmail_message_id,
              i.gmail_thread_id,
              i.from_address,
              i.to_address,
              i.subject,
              i.snippet,
              i.received_at::text AS received_at,
              i.classification,
              i.deepseek_json,
              i.leave_event_id::text AS leave_event_id,
              i.scanned_at::text AS scanned_at
         FROM time_doctor.leave_inbox_messages i
        WHERE ${clauses.join(' AND ')}
        ORDER BY i.received_at DESC NULLS LAST, i.scanned_at DESC
        LIMIT ${lim}`,
      params,
    );
    const hoursPerDay = this.creditHoursPerDay();
    const messages = result.rows.map((r: any) => {
      const raw = r.deepseek_json || {};
      const leave = (raw.leave as Record<string, unknown>) || {};
      const emp = (raw.employee as Record<string, unknown>) || {};
      const confidencePct =
        typeof raw.confidencePct === 'number'
          ? raw.confidencePct
          : typeof raw.confidence === 'number'
            ? raw.confidence > 1
              ? Math.round(raw.confidence)
              : Math.round(raw.confidence * 100)
            : r.classification === 'not_leave'
              ? 0
              : null;
      const leaveStart = (leave.startDate || raw.start_date || null) as string | null;
      const leaveEnd = (leave.endDate || raw.end_date || null) as string | null;
      const halfDay = Boolean(leave.halfDay);
      let leaveDays: number | null =
        leave.days != null && Number.isFinite(Number(leave.days))
          ? Number(leave.days)
          : null;
      if (halfDay) leaveDays = 0.5;
      else if (leaveDays == null && leaveStart && leaveEnd) {
        leaveDays = leaveDaysInclusive(leaveStart, leaveEnd);
      }
      const empName =
        (emp.name ? String(emp.name).trim() : null) ||
        (raw.matchedEmployeeName ? String(raw.matchedEmployeeName) : null);
      const empEmail = emp.email ? String(emp.email).trim().toLowerCase() : null;
      const matchedFrom = emp.matchedFrom
        ? String(emp.matchedFrom)
        : raw.matchedFrom
          ? String(raw.matchedFrom)
          : null;
      return {
        ...r,
        status: r.classification,
        confidence_pct: confidencePct,
        matched_employee_id: raw.matchedEmployeeId ?? null,
        matched_employee_name: raw.matchedEmployeeName ?? empName ?? null,
        leave_start: leaveStart,
        leave_end: leaveEnd,
        leave_type: leave.leaveType || raw.leave_type || null,
        leave_days: leaveDays,
        leave_reason: leave.reason || raw.note || null,
        leave_summary: raw.rawSummary || null,
        is_leave_request: Boolean(raw.isLeaveRequest),
        is_cancellation: Boolean(leave.isCancellation),
        matched_from: matchedFrom,
        email_says:
          empName || empEmail
            ? `${empName || '—'}${empEmail ? ` · ${empEmail}` : ''}`
            : null,
        half_day: halfDay,
        credit_hours:
          leaveDays != null && leaveDays > 0
            ? Math.round(leaveDays * hoursPerDay * 100) / 100
            : null,
        credit_hours_per_day: hoursPerDay,
        warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
        is_leave:
          ['approved', 'pending', 'unmatched', 'duplicate', 'leave', 'rejected'].includes(
            String(r.classification),
          ) || Boolean(raw.isLeaveRequest),
      };
    });
    return {
      messages,
      filter,
      period: periodCfg.period,
      lookback_days: periodCfg.lookbackDays,
    };
  }

  async assignInboxMessage(
    user: ScopedAuthUser,
    inboxId: string,
    input: {
      userId: string;
      leaveType?: string;
      startDate?: string;
      endDate?: string;
      note?: string;
      halfDay?: boolean;
    },
  ) {
    this.ensureCanManage(user);
    const workspaceId = this.requireWorkspaceId(user);
    const scope = workspaceScope(user, 'i');

    const existing = await this.db.query<{
      id: string;
      classification: string;
      leave_event_id: string | null;
      gmail_message_id: string;
      deepseek_json: Record<string, unknown> | null;
      subject: string | null;
    }>(
      `SELECT i.id::text AS id,
              i.classification,
              i.leave_event_id::text AS leave_event_id,
              i.gmail_message_id,
              i.deepseek_json,
              i.subject
         FROM time_doctor.leave_inbox_messages i
        WHERE ${scope.clause}
          AND i.id = $${scope.params.length + 1}::uuid
        LIMIT 1`,
      [...scope.params, inboxId],
    );
    const row = existing.rows[0];
    if (!row) throw new NotFoundException('Inbox message not found');
    if (row.leave_event_id) {
      throw new BadRequestException('Inbox message already linked to a leave event');
    }

    const raw = row.deepseek_json || {};
    const leave = (raw.leave as Record<string, unknown>) || {};
    const leaveType =
      (input.leaveType && isLeaveType(input.leaveType) && input.leaveType) ||
      (isLeaveType(leave.leaveType) && leave.leaveType) ||
      (isLeaveType(raw.leave_type) ? raw.leave_type : 'other');
    const startDate =
      input.startDate ||
      (typeof leave.startDate === 'string' ? leave.startDate.slice(0, 10) : null) ||
      (typeof raw.start_date === 'string' ? raw.start_date.slice(0, 10) : null);
    const endDate =
      input.endDate ||
      (typeof leave.endDate === 'string' ? leave.endDate.slice(0, 10) : null) ||
      (typeof raw.end_date === 'string' ? raw.end_date.slice(0, 10) : startDate);
    if (!startDate || !endDate) {
      throw new BadRequestException('startDate and endDate are required');
    }

    const created = await this.createEvent(user, {
      userId: input.userId,
      leaveType,
      startDate,
      endDate,
      note:
        input.note ||
        (typeof leave.reason === 'string' ? leave.reason : null) ||
        (typeof raw.note === 'string' ? raw.note : row.subject || undefined),
      source: 'email',
      gmailMessageId: row.gmail_message_id,
      halfDay: input.halfDay ?? Boolean(leave.halfDay),
    });

    await this.db.query(
      `UPDATE time_doctor.leave_inbox_messages
          SET classification = 'approved',
              leave_event_id = $1::uuid
        WHERE id = $2::uuid AND workspace_id = $3`,
      [created.id, inboxId, workspaceId],
    );

    return { inbox_id: inboxId, leave_event: created, status: 'approved' };
  }

  /** Employees summary for Leave → Employees tab. */
  async getEmployeeLedgers(user: ScopedAuthUser) {
    this.ensureCanManage(user);
    const workspaceId = this.requireWorkspaceId(user);
    const workTz = await this.getWorkTimezone(workspaceId);
    const employees = await this.loadTrackableEmployees(workspaceId);
    const { events } = await this.listEvents(user, { status: 'active' });

    const ledgers = employees.map((emp) => {
      const mine = (events as any[]).filter((e) => Number(e.user_id) === emp.id);
      const daysUsed = mine.reduce((s, e) => s + (Number(e.days) || 0), 0);
      return {
        user_id: String(emp.id),
        email: emp.email,
        full_name: emp.full_name,
        department: emp.department,
        location: emp.location,
        days_used: daysUsed,
        events: mine,
      };
    });

    return {
      timezone: workTz,
      credit_hours_per_day: this.creditHoursPerDay(),
      today: workDateKey(new Date(), workTz),
      employees: ledgers,
    };
  }

  // ---------------------------------------------------------------------------
  // Gmail scan pipeline (AlysonHR intake parity)
  // ---------------------------------------------------------------------------

  private resolveScanPeriod(period?: string): { lookbackDays: number; maxMessages: number; period: string } {
    const p = String(period || '30d').toLowerCase();
    const map: Record<string, { lookbackDays: number; maxMessages: number }> = {
      '7d': { lookbackDays: 7, maxMessages: 80 },
      '30d': { lookbackDays: 30, maxMessages: 200 },
      '60d': { lookbackDays: 60, maxMessages: 250 },
      '90d': { lookbackDays: 90, maxMessages: 300 },
      '6mo': { lookbackDays: 183, maxMessages: 300 },
      '12mo': { lookbackDays: 365, maxMessages: 300 },
      '24mo': { lookbackDays: 730, maxMessages: 300 },
    };
    const hit = map[p] || map['30d'];
    return { ...hit, period: map[p] ? p : '30d' };
  }

  private hrReviewEnabled(): boolean {
    return String(this.config.get<string>('LEAVE_EMAIL_HR_REVIEW_ENABLED') || '')
      .toLowerCase() === 'true';
  }

  async scanInbox(
    user: ScopedAuthUser,
    opts?: { query?: string; maxMessages?: number; period?: string },
  ) {
    this.ensureCanManage(user);
    const workspaceId = this.requireWorkspaceId(user);
    const actorId = parseTenantUserId(user.id);

    const periodCfg = this.resolveScanPeriod(opts?.period);
    const maxMessages = opts?.maxMessages ?? periodCfg.maxMessages;

    // Prod API Lambda has no NAT — Gmail/DeepSeek run on non-VPC leave-scan worker.
    if (this.leaveScanLambda && this.leaveScanFunctionName) {
      const job: LeaveScanJob = {
        workspaceId,
        actor: {
          id: String(user.id),
          role: user.role,
          organization_id: user.organization_id ?? null,
          is_super_admin: Boolean(user.is_super_admin),
        },
        period: periodCfg.period,
        maxMessages,
        query: opts?.query,
        lookbackDays: periodCfg.lookbackDays,
      };
      await this.leaveScanLambda.send(
        new InvokeCommand({
          FunctionName: this.leaveScanFunctionName,
          InvocationType: 'Event',
          Payload: Buffer.from(JSON.stringify(job)),
        }),
      );
      await this.audit(workspaceId, 'scan_started', actorId, {
        period: periodCfg.period,
        lookbackDays: periodCfg.lookbackDays,
        maxMessages,
        async: true,
      });
      return {
        async: true,
        started: true,
        period: periodCfg.period,
        lookback_days: periodCfg.lookbackDays,
        message:
          'Leave email scan started in the background. Refresh Email inbox in about a minute.',
        gmail_subject: this.gmail.subjectEmail(),
        gmail_mailbox: this.gmail.mailboxFilter(),
      };
    }

    if (!this.gmail.isConfigured()) {
      throw new ServiceUnavailableException(
        'Google DWD is not configured (GOOGLE_DWD_CLIENT_EMAIL / GOOGLE_DWD_PRIVATE_KEY)',
      );
    }
    if (!this.classify.isConfigured()) {
      throw new ServiceUnavailableException('DeepSeek is not configured (DEEPSEEK_API_KEY)');
    }

    const listed = await this.gmail.listMessages({
      query: opts?.query,
      maxResults: maxMessages,
      lookbackDays: periodCfg.lookbackDays,
    });

    const employees = await this.loadTrackableEmployees(workspaceId);
    const workTz = await this.getWorkTimezone(workspaceId);
    const hrReview = this.hrReviewEnabled();

    const counts = {
      processed: 0,
      approved: 0,
      pending: 0,
      not_leave: 0,
      unmatched: 0,
      duplicate: 0,
      extraction_failed: 0,
      skipped: 0,
      cancelled: 0,
    };

    for (const item of listed) {
      const exists = await this.db.query<{ classification: string }>(
        `SELECT classification FROM time_doctor.leave_inbox_messages
          WHERE workspace_id = $1 AND gmail_message_id = $2
          LIMIT 1`,
        [workspaceId, item.id],
      );
      if (exists.rows[0]) {
        // Allow retry only for extraction_failed
        if (exists.rows[0].classification !== 'extraction_failed') {
          counts.skipped += 1;
          continue;
        }
        await this.db.query(
          `DELETE FROM time_doctor.leave_inbox_messages
            WHERE workspace_id = $1 AND gmail_message_id = $2`,
          [workspaceId, item.id],
        );
      }

      counts.processed += 1;
      let msg;
      try {
        msg = await this.gmail.getMessage(item.id);
      } catch (err) {
        counts.extraction_failed += 1;
        await this.insertInboxRow({
          workspaceId,
          gmailMessageId: item.id,
          gmailThreadId: item.threadId,
          from: null,
          to: null,
          subject: null,
          snippet: null,
          bodyText: null,
          receivedAt: null,
          classification: 'extraction_failed',
          deepseekJson: { error: String(err).slice(0, 300) },
          leaveEventId: null,
        });
        continue;
      }

      let extraction;
      try {
        extraction = await this.classify.classifyEmail({
          from: msg.from,
          to: msg.to,
          subject: msg.subject,
          snippet: msg.snippet,
          bodyText: msg.bodyText,
          receivedAt: msg.receivedAt,
        });
      } catch (err) {
        counts.extraction_failed += 1;
        await this.insertInboxRow({
          workspaceId,
          gmailMessageId: msg.id,
          gmailThreadId: msg.threadId,
          from: msg.from,
          to: msg.to,
          subject: msg.subject,
          snippet: msg.snippet,
          bodyText: msg.bodyText,
          receivedAt: msg.receivedAt,
          classification: 'extraction_failed',
          deepseekJson: { error: String(err).slice(0, 300) },
          leaveEventId: null,
        });
        continue;
      }

      const extractionPayload = {
        ...extraction.raw,
        isLeaveRequest: extraction.isLeaveRequest,
        confidence: extraction.confidence,
        confidencePct: extraction.confidencePct,
        employee: extraction.employee,
        leave: extraction.leave,
        warnings: extraction.warnings,
        rawSummary: extraction.rawSummary,
      };

      await this.audit(workspaceId, 'classify', actorId, {
        gmail_message_id: msg.id,
        isLeaveRequest: extraction.isLeaveRequest,
        confidence: extraction.confidence,
      });

      if (!extraction.isLeaveRequest) {
        counts.not_leave += 1;
        await this.insertInboxRow({
          workspaceId,
          gmailMessageId: msg.id,
          gmailThreadId: msg.threadId,
          from: msg.from,
          to: msg.to,
          subject: msg.subject,
          snippet: msg.snippet,
          bodyText: msg.bodyText,
          receivedAt: msg.receivedAt,
          classification: 'not_leave',
          deepseekJson: extractionPayload,
          leaveEventId: null,
        });
        continue;
      }

      const matched = this.findUserByEmails(employees, extraction.employee.emails);
      const startDate = extraction.leave.startDate;
      const endDate = extraction.leave.endDate || startDate;

      // Cancellation path
      if (extraction.leave.isCancellation && matched) {
        if (startDate && endDate) {
          const overlap = await this.findOverlappingLeave(
            workspaceId,
            matched.id,
            startDate,
            endDate,
          );
          if (overlap) {
            await this.voidEvent(user, overlap.id);
            counts.cancelled += 1;
            await this.insertInboxRow({
              workspaceId,
              gmailMessageId: msg.id,
              gmailThreadId: msg.threadId,
              from: msg.from,
              to: msg.to,
              subject: msg.subject,
              snippet: msg.snippet,
              bodyText: msg.bodyText,
              receivedAt: msg.receivedAt,
              classification: 'approved',
              deepseekJson: {
                ...extractionPayload,
                cancelled_leave_event_id: overlap.id,
              },
              leaveEventId: overlap.id,
            });
            continue;
          }
        }
        counts.pending += 1;
        await this.insertInboxRow({
          workspaceId,
          gmailMessageId: msg.id,
          gmailThreadId: msg.threadId,
          from: msg.from,
          to: msg.to,
          subject: msg.subject,
          snippet: msg.snippet,
          bodyText: msg.bodyText,
          receivedAt: msg.receivedAt,
          classification: 'pending',
          deepseekJson: {
            ...extractionPayload,
            warnings: [...extraction.warnings, 'Cancellation could not match ledger leave'],
          },
          leaveEventId: null,
        });
        continue;
      }

      if (!matched) {
        counts.unmatched += 1;
        await this.insertInboxRow({
          workspaceId,
          gmailMessageId: msg.id,
          gmailThreadId: msg.threadId,
          from: msg.from,
          to: msg.to,
          subject: msg.subject,
          snippet: msg.snippet,
          bodyText: msg.bodyText,
          receivedAt: msg.receivedAt,
          classification: 'unmatched',
          deepseekJson: extractionPayload,
          leaveEventId: null,
        });
        continue;
      }

      if (!startDate || !endDate) {
        counts.pending += 1;
        await this.insertInboxRow({
          workspaceId,
          gmailMessageId: msg.id,
          gmailThreadId: msg.threadId,
          from: msg.from,
          to: msg.to,
          subject: msg.subject,
          snippet: msg.snippet,
          bodyText: msg.bodyText,
          receivedAt: msg.receivedAt,
          classification: 'pending',
          deepseekJson: {
            ...extractionPayload,
            warnings: [...extraction.warnings, 'Missing leave dates'],
          },
          leaveEventId: null,
        });
        continue;
      }

      const overlap = await this.findOverlappingLeave(
        workspaceId,
        matched.id,
        startDate,
        endDate,
      );
      if (overlap) {
        counts.duplicate += 1;
        await this.insertInboxRow({
          workspaceId,
          gmailMessageId: msg.id,
          gmailThreadId: msg.threadId,
          from: msg.from,
          to: msg.to,
          subject: msg.subject,
          snippet: msg.snippet,
          bodyText: msg.bodyText,
          receivedAt: msg.receivedAt,
          classification: 'duplicate',
          deepseekJson: {
            ...extractionPayload,
            duplicate_of: overlap.id,
            warnings: [
              ...extraction.warnings,
              `Already on ledger ${overlap.start_date}–${overlap.end_date}`,
            ],
          },
          leaveEventId: overlap.id,
        });
        continue;
      }

      if (hrReview) {
        counts.pending += 1;
        await this.insertInboxRow({
          workspaceId,
          gmailMessageId: msg.id,
          gmailThreadId: msg.threadId,
          from: msg.from,
          to: msg.to,
          subject: msg.subject,
          snippet: msg.snippet,
          bodyText: msg.bodyText,
          receivedAt: msg.receivedAt,
          classification: 'pending',
          deepseekJson: {
            ...extractionPayload,
            matchedEmployeeId: matched.id,
            matchedEmployeeName: matched.full_name,
          },
          leaveEventId: null,
        });
        continue;
      }

      try {
        const event = await this.createEvent(user, {
          userId: String(matched.id),
          leaveType: extraction.leave.leaveType,
          startDate,
          endDate,
          note: extraction.leave.reason || msg.subject || undefined,
          source: 'email',
          gmailMessageId: msg.id,
          halfDay: extraction.leave.halfDay,
          skipOverlapCheck: true,
        });
        counts.approved += 1;
        await this.insertInboxRow({
          workspaceId,
          gmailMessageId: msg.id,
          gmailThreadId: msg.threadId,
          from: msg.from,
          to: msg.to,
          subject: msg.subject,
          snippet: msg.snippet,
          bodyText: msg.bodyText,
          receivedAt: msg.receivedAt,
          classification: 'approved',
          deepseekJson: {
            ...extractionPayload,
            matchedEmployeeId: matched.id,
            matchedEmployeeName: matched.full_name,
          },
          leaveEventId: event.id,
        });
      } catch (err) {
        counts.extraction_failed += 1;
        this.logger.warn(`Leave create from email failed: ${String(err)}`);
        await this.insertInboxRow({
          workspaceId,
          gmailMessageId: msg.id,
          gmailThreadId: msg.threadId,
          from: msg.from,
          to: msg.to,
          subject: msg.subject,
          snippet: msg.snippet,
          bodyText: msg.bodyText,
          receivedAt: msg.receivedAt,
          classification: 'extraction_failed',
          deepseekJson: {
            ...extractionPayload,
            create_error: String(err).slice(0, 300),
          },
          leaveEventId: null,
        });
      }
    }

    await this.audit(workspaceId, 'scan', actorId, {
      period: periodCfg.period,
      lookbackDays: periodCfg.lookbackDays,
      listed: listed.length,
      ...counts,
      timezone: workTz,
      subject: this.gmail.subjectEmail(),
      mailbox: this.gmail.mailboxFilter(),
      hr_review: hrReview,
    });

    return {
      period: periodCfg.period,
      lookback_days: periodCfg.lookbackDays,
      listed: listed.length,
      ...counts,
      timezone: workTz,
      gmail_subject: this.gmail.subjectEmail(),
      gmail_mailbox: this.gmail.mailboxFilter(),
      hr_review_enabled: hrReview,
      gmail_configured: true,
      deepseek_configured: true,
    };
  }

  /**
   * Internal (x-api-key): persist a batch of Gmail+DeepSeek results from the
   * non-VPC leave-scan worker. Same classification rules as sync scanInbox.
   */
  async ingestScanBatch(req: LeaveScanIngestBatchRequest) {
    const workspaceId = Number(req.workspaceId);
    if (!Number.isFinite(workspaceId) || workspaceId <= 0) {
      throw new BadRequestException('workspaceId required');
    }
    const user = req.actor;
    if (!user?.id || !canAdjustPulseTime(user)) {
      throw new ForbiddenException('Manager or admin actor required');
    }
    const actorId = parseTenantUserId(user.id);
    const employees = await this.loadTrackableEmployees(workspaceId);
    const workTz = await this.getWorkTimezone(workspaceId);
    const hrReview = this.hrReviewEnabled();
    const counts = {
      processed: 0,
      approved: 0,
      pending: 0,
      not_leave: 0,
      unmatched: 0,
      duplicate: 0,
      extraction_failed: 0,
      skipped: 0,
      cancelled: 0,
    };

    for (const item of req.items || []) {
      const gmailMessageId = String(item.gmailMessageId || '').trim();
      if (!gmailMessageId) continue;

      const exists = await this.db.query<{ classification: string }>(
        `SELECT classification FROM time_doctor.leave_inbox_messages
          WHERE workspace_id = $1 AND gmail_message_id = $2
          LIMIT 1`,
        [workspaceId, gmailMessageId],
      );
      if (exists.rows[0]) {
        if (exists.rows[0].classification !== 'extraction_failed') {
          counts.skipped += 1;
          continue;
        }
        await this.db.query(
          `DELETE FROM time_doctor.leave_inbox_messages
            WHERE workspace_id = $1 AND gmail_message_id = $2`,
          [workspaceId, gmailMessageId],
        );
      }

      counts.processed += 1;
      const msg = item.message;
      const receivedAt = msg?.receivedAt ? new Date(msg.receivedAt) : null;

      if (item.fetchError || !msg) {
        counts.extraction_failed += 1;
        await this.insertInboxRow({
          workspaceId,
          gmailMessageId,
          gmailThreadId: String(item.gmailThreadId || ''),
          from: null,
          to: null,
          subject: null,
          snippet: null,
          bodyText: null,
          receivedAt: null,
          classification: 'extraction_failed',
          deepseekJson: { error: String(item.fetchError || 'missing message').slice(0, 300) },
          leaveEventId: null,
        });
        continue;
      }

      const extraction = item.extraction as LeaveExtraction | null;
      if (!extraction) {
        counts.extraction_failed += 1;
        await this.insertInboxRow({
          workspaceId,
          gmailMessageId: msg.id,
          gmailThreadId: msg.threadId,
          from: msg.from,
          to: msg.to,
          subject: msg.subject,
          snippet: msg.snippet,
          bodyText: msg.bodyText,
          receivedAt,
          classification: 'extraction_failed',
          deepseekJson: { error: 'missing extraction' },
          leaveEventId: null,
        });
        continue;
      }

      const extractionPayload = {
        ...extraction.raw,
        isLeaveRequest: extraction.isLeaveRequest,
        confidence: extraction.confidence,
        confidencePct: extraction.confidencePct,
        employee: extraction.employee,
        leave: extraction.leave,
        warnings: extraction.warnings,
        rawSummary: extraction.rawSummary,
      };

      await this.audit(workspaceId, 'classify', actorId, {
        gmail_message_id: msg.id,
        isLeaveRequest: extraction.isLeaveRequest,
        confidence: extraction.confidence,
      });

      if (!extraction.isLeaveRequest) {
        counts.not_leave += 1;
        await this.insertInboxRow({
          workspaceId,
          gmailMessageId: msg.id,
          gmailThreadId: msg.threadId,
          from: msg.from,
          to: msg.to,
          subject: msg.subject,
          snippet: msg.snippet,
          bodyText: msg.bodyText,
          receivedAt,
          classification: 'not_leave',
          deepseekJson: extractionPayload,
          leaveEventId: null,
        });
        continue;
      }

      const matched = this.findUserByEmails(employees, extraction.employee.emails);
      const startDate = extraction.leave.startDate;
      const endDate = extraction.leave.endDate || startDate;

      if (extraction.leave.isCancellation && matched) {
        if (startDate && endDate) {
          const overlap = await this.findOverlappingLeave(
            workspaceId,
            matched.id,
            startDate,
            endDate,
          );
          if (overlap) {
            await this.voidEvent(user, overlap.id);
            counts.cancelled += 1;
            await this.insertInboxRow({
              workspaceId,
              gmailMessageId: msg.id,
              gmailThreadId: msg.threadId,
              from: msg.from,
              to: msg.to,
              subject: msg.subject,
              snippet: msg.snippet,
              bodyText: msg.bodyText,
              receivedAt,
              classification: 'approved',
              deepseekJson: {
                ...extractionPayload,
                cancelled_leave_event_id: overlap.id,
              },
              leaveEventId: overlap.id,
            });
            continue;
          }
        }
        counts.pending += 1;
        await this.insertInboxRow({
          workspaceId,
          gmailMessageId: msg.id,
          gmailThreadId: msg.threadId,
          from: msg.from,
          to: msg.to,
          subject: msg.subject,
          snippet: msg.snippet,
          bodyText: msg.bodyText,
          receivedAt,
          classification: 'pending',
          deepseekJson: {
            ...extractionPayload,
            warnings: [...extraction.warnings, 'Cancellation could not match ledger leave'],
          },
          leaveEventId: null,
        });
        continue;
      }

      if (!matched) {
        counts.unmatched += 1;
        await this.insertInboxRow({
          workspaceId,
          gmailMessageId: msg.id,
          gmailThreadId: msg.threadId,
          from: msg.from,
          to: msg.to,
          subject: msg.subject,
          snippet: msg.snippet,
          bodyText: msg.bodyText,
          receivedAt,
          classification: 'unmatched',
          deepseekJson: extractionPayload,
          leaveEventId: null,
        });
        continue;
      }

      if (!startDate || !endDate) {
        counts.pending += 1;
        await this.insertInboxRow({
          workspaceId,
          gmailMessageId: msg.id,
          gmailThreadId: msg.threadId,
          from: msg.from,
          to: msg.to,
          subject: msg.subject,
          snippet: msg.snippet,
          bodyText: msg.bodyText,
          receivedAt,
          classification: 'pending',
          deepseekJson: {
            ...extractionPayload,
            warnings: [...extraction.warnings, 'Missing leave dates'],
          },
          leaveEventId: null,
        });
        continue;
      }

      const overlap = await this.findOverlappingLeave(
        workspaceId,
        matched.id,
        startDate,
        endDate,
      );
      if (overlap) {
        counts.duplicate += 1;
        await this.insertInboxRow({
          workspaceId,
          gmailMessageId: msg.id,
          gmailThreadId: msg.threadId,
          from: msg.from,
          to: msg.to,
          subject: msg.subject,
          snippet: msg.snippet,
          bodyText: msg.bodyText,
          receivedAt,
          classification: 'duplicate',
          deepseekJson: {
            ...extractionPayload,
            duplicate_of: overlap.id,
            warnings: [
              ...extraction.warnings,
              `Already on ledger ${overlap.start_date}–${overlap.end_date}`,
            ],
          },
          leaveEventId: overlap.id,
        });
        continue;
      }

      if (hrReview) {
        counts.pending += 1;
        await this.insertInboxRow({
          workspaceId,
          gmailMessageId: msg.id,
          gmailThreadId: msg.threadId,
          from: msg.from,
          to: msg.to,
          subject: msg.subject,
          snippet: msg.snippet,
          bodyText: msg.bodyText,
          receivedAt,
          classification: 'pending',
          deepseekJson: {
            ...extractionPayload,
            matchedEmployeeId: matched.id,
            matchedEmployeeName: matched.full_name,
          },
          leaveEventId: null,
        });
        continue;
      }

      try {
        const event = await this.createEvent(user, {
          userId: String(matched.id),
          leaveType: extraction.leave.leaveType,
          startDate,
          endDate,
          note: extraction.leave.reason || msg.subject || undefined,
          source: 'email',
          gmailMessageId: msg.id,
          halfDay: extraction.leave.halfDay,
          skipOverlapCheck: true,
        });
        counts.approved += 1;
        await this.insertInboxRow({
          workspaceId,
          gmailMessageId: msg.id,
          gmailThreadId: msg.threadId,
          from: msg.from,
          to: msg.to,
          subject: msg.subject,
          snippet: msg.snippet,
          bodyText: msg.bodyText,
          receivedAt,
          classification: 'approved',
          deepseekJson: {
            ...extractionPayload,
            matchedEmployeeId: matched.id,
            matchedEmployeeName: matched.full_name,
          },
          leaveEventId: event.id,
        });
      } catch (err) {
        counts.extraction_failed += 1;
        this.logger.warn(`Leave create from email failed: ${String(err)}`);
        await this.insertInboxRow({
          workspaceId,
          gmailMessageId: msg.id,
          gmailThreadId: msg.threadId,
          from: msg.from,
          to: msg.to,
          subject: msg.subject,
          snippet: msg.snippet,
          bodyText: msg.bodyText,
          receivedAt,
          classification: 'extraction_failed',
          deepseekJson: {
            ...extractionPayload,
            create_error: String(err).slice(0, 300),
          },
          leaveEventId: null,
        });
      }
    }

    await this.audit(workspaceId, 'scan', actorId, {
      period: req.period,
      lookbackDays: req.lookbackDays,
      listed: req.listed,
      ...counts,
      timezone: workTz,
      subject: req.gmailSubject,
      mailbox: req.gmailMailbox,
      hr_review: hrReview,
      async_worker: true,
    });

    return {
      period: req.period,
      lookback_days: req.lookbackDays,
      listed: req.listed,
      ...counts,
      timezone: workTz,
      gmail_subject: req.gmailSubject,
      gmail_mailbox: req.gmailMailbox,
      hr_review_enabled: hrReview,
    };
  }

  async approveInboxMessage(user: ScopedAuthUser, inboxId: string) {
    this.ensureCanManage(user);
    const workspaceId = this.requireWorkspaceId(user);
    const scope = workspaceScope(user, 'i');
    const existing = await this.db.query<{
      id: string;
      classification: string;
      leave_event_id: string | null;
      gmail_message_id: string;
      deepseek_json: Record<string, unknown> | null;
      subject: string | null;
    }>(
      `SELECT i.id::text AS id, i.classification, i.leave_event_id::text AS leave_event_id,
              i.gmail_message_id, i.deepseek_json, i.subject
         FROM time_doctor.leave_inbox_messages i
        WHERE ${scope.clause}
          AND i.id = $${scope.params.length + 1}::uuid
        LIMIT 1`,
      [...scope.params, inboxId],
    );
    const row = existing.rows[0];
    if (!row) throw new NotFoundException('Inbox message not found');
    if (row.leave_event_id) {
      return { inbox_id: inboxId, leave_event_id: row.leave_event_id, status: 'approved' };
    }
    if (row.classification !== 'pending' && row.classification !== 'unmatched') {
      throw new BadRequestException('Only pending/unmatched items can be approved');
    }
    const raw = row.deepseek_json || {};
    const leave = (raw.leave as Record<string, unknown>) || {};
    const userId =
      raw.matchedEmployeeId != null
        ? String(raw.matchedEmployeeId)
        : null;
    if (!userId) {
      throw new BadRequestException('Assign an employee first (matchedEmployeeId missing)');
    }
    const startDate =
      (typeof leave.startDate === 'string' && leave.startDate.slice(0, 10)) ||
      (typeof raw.start_date === 'string' ? raw.start_date.slice(0, 10) : null);
    const endDate =
      (typeof leave.endDate === 'string' && leave.endDate.slice(0, 10)) ||
      (typeof raw.end_date === 'string' ? raw.end_date.slice(0, 10) : startDate);
    if (!startDate || !endDate) {
      throw new BadRequestException('startDate and endDate are required');
    }
    const leaveType =
      (isLeaveType(leave.leaveType) && leave.leaveType) ||
      (isLeaveType(raw.leave_type) ? raw.leave_type : 'other');
    const created = await this.createEvent(user, {
      userId,
      leaveType,
      startDate,
      endDate,
      note:
        (typeof leave.reason === 'string' && leave.reason) ||
        row.subject ||
        undefined,
      source: 'email',
      gmailMessageId: row.gmail_message_id,
      halfDay: Boolean(leave.halfDay),
    });
    await this.db.query(
      `UPDATE time_doctor.leave_inbox_messages
          SET classification = 'approved', leave_event_id = $1::uuid
        WHERE id = $2::uuid AND workspace_id = $3`,
      [created.id, inboxId, workspaceId],
    );
    return { inbox_id: inboxId, leave_event: created, status: 'approved' };
  }

  async rejectInboxMessage(user: ScopedAuthUser, inboxId: string) {
    this.ensureCanManage(user);
    const workspaceId = this.requireWorkspaceId(user);
    const scope = workspaceScope(user, 'i');
    const result = await this.db.query(
      `UPDATE time_doctor.leave_inbox_messages i
          SET classification = 'rejected'
        WHERE ${scope.clause}
          AND i.id = $${scope.params.length + 1}::uuid
          AND i.classification IN ('pending', 'unmatched')
        RETURNING i.id::text AS id`,
      [...scope.params, inboxId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException('Pending inbox item not found');
    }
    await this.audit(workspaceId, 'reject_inbox', parseTenantUserId(user.id), {
      inbox_id: inboxId,
    });
    return { id: inboxId, status: 'rejected' };
  }

  async getScanStatus(user: ScopedAuthUser) {
    this.ensureCanManage(user);
    return {
      gmail_configured: this.gmail.isConfigured(),
      deepseek_configured: this.classify.isConfigured(),
      gmail_subject: this.gmail.subjectEmail(),
      gmail_mailbox: this.gmail.mailboxFilter(),
      hr_review_enabled: this.hrReviewEnabled(),
      credit_hours_per_day: this.creditHoursPerDay(),
      default_scan_period: '30d',
      timezone_note:
        'Leave dates use company work calendar (workspace_settings.timezone), not IST.',
    };
  }

  private async insertInboxRow(row: {
    workspaceId: number;
    gmailMessageId: string;
    gmailThreadId: string | null;
    from: string | null;
    to: string | null;
    subject: string | null;
    snippet: string | null;
    bodyText: string | null;
    receivedAt: Date | null;
    classification: string;
    deepseekJson: Record<string, unknown> | null;
    leaveEventId: string | null;
  }) {
    await this.db.query(
      `INSERT INTO time_doctor.leave_inbox_messages
         (workspace_id, gmail_message_id, gmail_thread_id, from_address, to_address,
          subject, snippet, body_text, received_at, classification, deepseek_json, leave_event_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::uuid)
       ON CONFLICT (workspace_id, gmail_message_id) DO NOTHING`,
      [
        row.workspaceId,
        row.gmailMessageId,
        row.gmailThreadId,
        row.from,
        row.to,
        row.subject,
        row.snippet,
        row.bodyText,
        row.receivedAt,
        row.classification,
        JSON.stringify(row.deepseekJson || {}),
        row.leaveEventId,
      ],
    );
  }
}
