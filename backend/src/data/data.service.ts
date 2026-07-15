import { ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { S3Service } from '../common/s3.service';
import {
  SCREENSHOT_IS_VIDEO_MEETING_SQL,
  applyMeetingActivityFloor,
} from '../pulse/meeting-context';
import {
  EMPLOYEE_USER_SELECT,
  ScopedAuthUser,
  WORKSPACE_AS_ORG_SELECT,
  isPulseAdmin,
  isPulseOrgAdmin,
  isPulseTeamManager,
  parseTenantUserId,
  parseWorkspaceId,
  scopedPulseUserId,
  workspaceScope,
} from '../database/time-doctor-sql';

export type ScreenshotProductivityFilter = 'all' | 'distraction' | 'low_productivity' | 'idle';
export type ScreenshotSort = 'newest' | 'least_productive' | 'low_activity';

const SCREENSHOT_PRODUCTIVITY_FILTERS: ScreenshotProductivityFilter[] = [
  'all',
  'distraction',
  'low_productivity',
  'idle',
];
const SCREENSHOT_SORTS: ScreenshotSort[] = ['newest', 'least_productive', 'low_activity'];

/** productivity_flag lives in vision_analysis JSONB (parsed or top-level). */
const PRODUCTIVITY_FLAG_SQL = `COALESCE(s.vision_analysis #>> '{parsed,productivity_flag}', s.vision_analysis->>'productivity_flag', '')`;

export function normalizeScreenshotProductivityFilter(
  value?: string,
): ScreenshotProductivityFilter {
  if (value && SCREENSHOT_PRODUCTIVITY_FILTERS.includes(value as ScreenshotProductivityFilter)) {
    return value as ScreenshotProductivityFilter;
  }
  return 'all';
}

export function normalizeScreenshotSort(value?: string): ScreenshotSort {
  if (value && SCREENSHOT_SORTS.includes(value as ScreenshotSort)) {
    return value as ScreenshotSort;
  }
  return 'newest';
}

function applyScreenshotProductivityFilter(
  filters: string[],
  productivityFilter: ScreenshotProductivityFilter,
): void {
  switch (productivityFilter) {
    case 'distraction':
      filters.push(`s.ai_analysis_status = 'completed' AND s.category = 'distraction'`);
      break;
    case 'low_productivity':
      filters.push(`(
        s.ai_analysis_status = 'completed'
        AND (
          s.category = 'distraction'
          OR ${PRODUCTIVITY_FLAG_SQL} IN ('off_task', 'mixed')
        )
      )`);
      break;
    case 'idle':
      // Meetings expect low keyboard/mouse input, so never treat them as idle.
      filters.push(`(
        NOT ${SCREENSHOT_IS_VIDEO_MEETING_SQL}
        AND (
          (s.activity_percent IS NOT NULL AND s.activity_percent <= 30)
          OR (
            s.ai_analysis_status = 'completed'
            AND (
              ${PRODUCTIVITY_FLAG_SQL} = 'unclear'
              OR (s.category = 'neutral' AND COALESCE(s.distraction_score, 0) <= 20)
            )
          )
        )
      )`);
      break;
    default:
      break;
  }
}

function screenshotOrderByClause(sort: ScreenshotSort): string {
  switch (sort) {
    case 'least_productive':
      return `CASE
        WHEN s.category = 'distraction' THEN 0
        WHEN ${PRODUCTIVITY_FLAG_SQL} = 'off_task' THEN 1
        WHEN ${PRODUCTIVITY_FLAG_SQL} = 'mixed' THEN 2
        WHEN s.category = 'neutral' THEN 3
        ELSE 4
      END ASC,
      s.distraction_score DESC NULLS LAST,
      s.activity_percent ASC NULLS LAST,
      s.captured_at DESC`;
    case 'low_activity':
      return `s.activity_percent ASC NULLS LAST, s.captured_at DESC`;
    default:
      return `s.captured_at DESC`;
  }
}

@Injectable()
export class DataService {
  constructor(
    private readonly database: DatabaseService,
    private readonly s3: S3Service,
  ) {}

  private isAdmin(user: ScopedAuthUser): boolean {
    return isPulseAdmin(user);
  }

  /** User ids whose screenshots the caller may view. null = all workspace users. */
  async getAllowedScreenshotUserIds(user: ScopedAuthUser): Promise<string[] | null> {
    if (isPulseOrgAdmin(user)) {
      return null;
    }

    if (isPulseTeamManager(user)) {
      const scope = workspaceScope(user, 'ext');
      const managerId = parseTenantUserId(user.id);
      const result = await this.database.query<{ id: string }>(
        `${EMPLOYEE_USER_SELECT}
         WHERE ${scope.clause}
           AND u.email NOT ILIKE '%@example.com%'
           AND (ext.manager_id = $${scope.params.length + 1} OR u.id = $${scope.params.length + 1})`,
        [...scope.params, managerId],
      );
      return result.rows.map((row) => row.id);
    }

    return [user.id];
  }

  async listScreenshotUsers(user: ScopedAuthUser) {
    const allowedIds = await this.getAllowedScreenshotUserIds(user);
    const scope = workspaceScope(user, 'ext');
    const params: unknown[] = [...scope.params];
    let userFilter = '';

    if (allowedIds) {
      params.push(allowedIds.map((id) => parseTenantUserId(id)));
      userFilter = ` AND u.id = ANY($${params.length}::int[])`;
    }

    const result = await this.database.query(
      `${EMPLOYEE_USER_SELECT}
       WHERE ${scope.clause}
         AND u.email NOT ILIKE '%@example.com%'
         ${userFilter}
       ORDER BY full_name ASC NULLS LAST`,
      params,
    );
    return result.rows;
  }

  async listUsers(user: ScopedAuthUser) {
    const scope = workspaceScope(user, 'ext');
    const result = await this.database.query(
      `${EMPLOYEE_USER_SELECT}
       WHERE ${scope.clause}
         AND u.email NOT ILIKE '%@example.com%'
       ORDER BY full_name ASC NULLS LAST`,
      scope.params,
    );
    return result.rows;
  }

  async latestAgentVersions(user: ScopedAuthUser, userIds: string[]) {
    if (!userIds.length) return [];
    const scope = workspaceScope(user, 's');
    const intIds = userIds.map((id) => parseTenantUserId(id));
    const params: unknown[] = [...scope.params, intIds];
    const result = await this.database.query(
      `SELECT DISTINCT ON (s.user_id) s.user_id::text AS user_id, s.agent_version, s.captured_at
       FROM time_doctor.screenshots s
       WHERE ${scope.clause}
         AND s.user_id = ANY($${scope.params.length + 1}::int[])
         AND s.agent_version IS NOT NULL
       ORDER BY s.user_id, s.captured_at DESC`,
      params,
    );
    return result.rows;
  }

  async listProjects(user: ScopedAuthUser) {
    const scope = workspaceScope(user, 'p');
    const result = await this.database.query(
      `SELECT p.id, p.name, p.description, p.workspace_id::text AS organization_id, p.created_at
       FROM time_doctor.projects p
       WHERE ${scope.clause}
       ORDER BY p.created_at DESC`,
      scope.params,
    );
    return result.rows;
  }

  async createProject(
    user: ScopedAuthUser,
    payload: { name: string; description?: string | null; organization_id?: string | null },
  ) {
    if (!this.isAdmin(user)) {
      throw new Error('Insufficient permissions to create project');
    }
    const workspaceId = user.is_super_admin
      ? parseWorkspaceId(payload.organization_id) ?? parseWorkspaceId(user.organization_id)
      : parseWorkspaceId(user.organization_id);
    if (!workspaceId) {
      throw new Error('Workspace is required to create a project');
    }
    const result = await this.database.query(
      `INSERT INTO time_doctor.projects (name, description, workspace_id, created_at, updated_at)
       VALUES ($1,$2,$3,NOW(),NOW())
       RETURNING id, name, description, workspace_id::text AS organization_id, created_at`,
      [payload.name, payload.description ?? null, workspaceId],
    );
    return result.rows[0];
  }

  async updateProject(
    user: ScopedAuthUser,
    projectId: string,
    updates: { name?: string; description?: string | null },
  ) {
    if (!this.isAdmin(user)) {
      throw new Error('Insufficient permissions to update project');
    }
    const scope = workspaceScope(user, 'p');
    const result = await this.database.query(
      `UPDATE time_doctor.projects p
       SET name = COALESCE($${scope.params.length + 2}, p.name),
           description = COALESCE($${scope.params.length + 3}, p.description),
           updated_at = NOW()
       WHERE ${scope.clause}
         AND p.id = $${scope.params.length + 1}::uuid
       RETURNING p.id, p.name, p.description, p.workspace_id::text AS organization_id, p.created_at`,
      [...scope.params, projectId, updates.name ?? null, updates.description ?? null],
    );
    return result.rows[0] ?? null;
  }

  async deleteProject(user: ScopedAuthUser, projectId: string) {
    if (!this.isAdmin(user)) {
      throw new Error('Insufficient permissions to delete project');
    }
    const scope = workspaceScope(user, 'p');
    const result = await this.database.query(
      `DELETE FROM time_doctor.projects p
       WHERE ${scope.clause}
         AND p.id = $${scope.params.length + 1}::uuid
       RETURNING p.id`,
      [...scope.params, projectId],
    );
    return Boolean(result.rows[0]);
  }

  async countProjectAssignments(user: ScopedAuthUser, projectId: string): Promise<number> {
    const scope = workspaceScope(user, 'p');
    const result = await this.database.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM time_doctor.employee_project_assignments epa
       JOIN time_doctor.projects p ON p.id = epa.project_id
       WHERE ${scope.clause}
         AND epa.project_id = $${scope.params.length + 1}::uuid`,
      [...scope.params, projectId],
    );
    return Number(result.rows[0]?.count || 0);
  }

  async deleteProjectAssignments(user: ScopedAuthUser, projectId: string): Promise<void> {
    if (!this.isAdmin(user)) {
      throw new Error('Insufficient permissions to delete assignments');
    }
    const scope = workspaceScope(user, 'p');
    await this.database.query(
      `DELETE FROM time_doctor.employee_project_assignments epa
       USING time_doctor.projects p
       WHERE epa.project_id = p.id
         AND ${scope.clause}
         AND epa.project_id = $${scope.params.length + 1}::uuid`,
      [...scope.params, projectId],
    );
  }

  async deleteUser(user: ScopedAuthUser, targetUserId: string): Promise<boolean> {
    if (!this.isAdmin(user)) {
      throw new Error('Insufficient permissions to delete user');
    }
    const uid = parseTenantUserId(targetUserId);
    const scope = workspaceScope(user, 'ext');
    const result = await this.database.query(
      `DELETE FROM time_doctor.user_extensions ext
       WHERE ${scope.clause}
         AND ext.user_id = $${scope.params.length + 1}
       RETURNING ext.user_id`,
      [...scope.params, uid],
    );
    return Boolean(result.rows[0]);
  }

  async closeTimeLog(user: ScopedAuthUser, logId: string, endTime?: string) {
    if (!this.isAdmin(user)) {
      throw new Error('Insufficient permissions to close time log');
    }
    const scope = workspaceScope(user, 't');
    const params: unknown[] = [...scope.params, logId];
    const end = endTime || new Date().toISOString();
    params.push(end);
    const idParam = scope.params.length + 1;
    const endParam = scope.params.length + 2;
    const result = await this.database.query(
      `UPDATE time_doctor.time_logs t
       SET end_time = $${endParam}::timestamptz,
           status = 'completed',
           updated_at = NOW()
       WHERE t.id = $${idParam}::uuid
         AND ${scope.clause}
         AND t.end_time IS NULL
       RETURNING t.*`,
      params,
    );
    return result.rows[0] || null;
  }

  async listTimeLogs(
    user: ScopedAuthUser,
    start?: string,
    end?: string,
    userId?: string,
    limit?: number,
    detailed = false,
  ) {
    const scope = workspaceScope(user, 't');
    const params: unknown[] = [...scope.params];
    const filters: string[] = [scope.clause];

    if (start) {
      params.push(start);
      filters.push(`t.start_time >= $${params.length}`);
    }
    if (end) {
      params.push(end);
      filters.push(`t.start_time <= $${params.length}`);
    }
    if (userId) {
      params.push(parseTenantUserId(scopedPulseUserId(user, userId)));
      filters.push(`t.user_id = $${params.length}`);
    } else if (!this.isAdmin(user)) {
      params.push(parseTenantUserId(user.id));
      filters.push(`t.user_id = $${params.length}`);
    }

    const selectDetailed = detailed
      ? `t.*, t.user_id::text AS user_id,
         json_build_object(
           'full_name', trim(both ' ' from coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')),
           'email', u.email
         ) AS users,
         json_build_object('name', p.name) AS projects`
      : `t.*, t.user_id::text AS user_id`;
    const joins = detailed
      ? `LEFT JOIN tenant."user" u ON u.id = t.user_id
         LEFT JOIN time_doctor.projects p ON p.id = t.project_id`
      : '';
    const limitClause = limit
      ? `LIMIT ${Math.max(1, Math.min(limit, 10000))}`
      : 'LIMIT 10000';

    const result = await this.database.query(
      `SELECT ${selectDetailed}
       FROM time_doctor.time_logs t
       ${joins}
       WHERE ${filters.join(' AND ')}
       ORDER BY t.start_time DESC
       ${limitClause}`,
      params,
    );
    return result.rows;
  }

  async listAppLogs(
    user: ScopedAuthUser,
    start?: string,
    end?: string,
    userId?: string,
    limit?: number,
  ) {
    const scope = workspaceScope(user, 'a');
    const params: unknown[] = [...scope.params];
    const filters: string[] = [scope.clause, 'a.app_name IS NOT NULL'];

    if (start) {
      params.push(start);
      filters.push(`COALESCE(a.started_at, a.timestamp) >= $${params.length}`);
    }
    if (end) {
      params.push(end);
      filters.push(`COALESCE(a.started_at, a.timestamp) <= $${params.length}`);
    }
    if (userId || !this.isAdmin(user)) {
      params.push(parseTenantUserId(scopedPulseUserId(user, userId)));
      filters.push(`a.user_id = $${params.length}`);
    }

    const limitClause = `LIMIT ${Math.max(1, Math.min(limit ?? 10000, 10000))}`;

    const result = await this.database.query(
      `SELECT
         a.id, a.user_id::text AS user_id, a.time_log_id, a.app_name, a.window_title,
         a.started_at, a.ended_at, a.timestamp, a.workspace_id::text AS organization_id,
         CASE
           WHEN a.ended_at IS NOT NULL AND COALESCE(a.started_at, a.timestamp) IS NOT NULL
           THEN GREATEST(
             0,
             EXTRACT(EPOCH FROM (a.ended_at - COALESCE(a.started_at, a.timestamp)))::int
           )
           ELSE NULL
         END AS duration_seconds
       FROM time_doctor.app_logs a
       WHERE ${filters.join(' AND ')}
       ORDER BY COALESCE(a.started_at, a.timestamp) DESC
       ${limitClause}`,
      params,
    );
    return result.rows;
  }

  async listUrlLogs(
    user: ScopedAuthUser,
    start?: string,
    end?: string,
    userId?: string,
    limit?: number,
  ) {
    const scope = workspaceScope(user, 'u');
    const params: unknown[] = [...scope.params];
    const filters: string[] = [
      scope.clause,
      'u.site_url IS NOT NULL',
      "u.site_url NOT ILIKE '%browser-activity-detected.local%'",
    ];

    if (start) {
      params.push(start);
      filters.push(`u.started_at >= $${params.length}`);
    }
    if (end) {
      params.push(end);
      filters.push(`u.started_at <= $${params.length}`);
    }
    if (userId || !this.isAdmin(user)) {
      params.push(parseTenantUserId(scopedPulseUserId(user, userId)));
      filters.push(`u.user_id = $${params.length}`);
    }

    const limitClause = `LIMIT ${Math.max(1, Math.min(limit ?? 10000, 10000))}`;

    const result = await this.database.query(
      `SELECT
         u.id,
         u.user_id::text AS user_id,
         u.time_log_id,
         u.site_url,
         u.site_url AS url,
         u.title,
         u.domain,
         u.browser,
         u.started_at,
         u.started_at AS timestamp,
         u.ended_at,
         u.workspace_id::text AS organization_id,
         CASE
           WHEN u.ended_at IS NOT NULL
           THEN GREATEST(0, EXTRACT(EPOCH FROM (u.ended_at - u.started_at))::int)
           ELSE NULL
         END AS duration_seconds
       FROM time_doctor.url_logs u
       WHERE ${filters.join(' AND ')}
       ORDER BY u.started_at DESC
       ${limitClause}`,
      params,
    );
    return result.rows;
  }

  async listIdleLogs(
    user: ScopedAuthUser,
    start?: string,
    end?: string,
    userId?: string,
    limit?: number,
  ) {
    const scope = workspaceScope(user, 'i');
    const params: unknown[] = [...scope.params];
    const filters: string[] = [scope.clause];

    if (start) {
      params.push(start);
      filters.push(`i.idle_start >= $${params.length}`);
    }
    if (end) {
      params.push(end);
      filters.push(`i.idle_start <= $${params.length}`);
    }
    if (userId || !this.isAdmin(user)) {
      params.push(parseTenantUserId(scopedPulseUserId(user, userId)));
      filters.push(`i.user_id = $${params.length}`);
    }

    const limitClause = `LIMIT ${Math.max(1, Math.min(limit ?? 10000, 10000))}`;

    const result = await this.database.query(
      `SELECT i.id, i.user_id::text AS user_id, i.idle_start, i.idle_end,
              i.duration_seconds, i.project_id, i.workspace_id::text AS organization_id
       FROM time_doctor.idle_logs i
       WHERE ${filters.join(' AND ')}
       ORDER BY i.idle_start DESC
       ${limitClause}`,
      params,
    );
    return result.rows;
  }

  async listOrganizations(user: ScopedAuthUser) {
    if (user.is_super_admin) {
      const result = await this.database.query(
        `${WORKSPACE_AS_ORG_SELECT}
         WHERE coalesce(w.active, true) = true
         ORDER BY w.name ASC`,
      );
      return result.rows;
    }
    if (!user.organization_id) return [];
    const result = await this.database.query(
      `${WORKSPACE_AS_ORG_SELECT}
       WHERE w.id = $1::int
       LIMIT 1`,
      [user.organization_id],
    );
    return result.rows;
  }

  private resolveScreenshotUserFilter(
    user: ScopedAuthUser,
    userId: string | undefined,
    userIds: string[] | undefined,
    allowedUserIds: string[] | null,
    params: unknown[],
    filters: string[],
  ): void {
    const assertAllowed = (id: string) => {
      if (allowedUserIds && !allowedUserIds.includes(id)) {
        throw new ForbiddenException('Insufficient permissions to view screenshots for this user');
      }
    };

    if (userId) {
      const scopedId = scopedPulseUserId(user, userId);
      assertAllowed(scopedId);
      params.push(parseTenantUserId(scopedId));
      filters.push(`s.user_id = $${params.length}`);
      return;
    }

    if (userIds?.length) {
      const scopedIds = userIds.map((id) => scopedPulseUserId(user, id));
      const filteredIds = allowedUserIds
        ? scopedIds.filter((id) => allowedUserIds.includes(id))
        : scopedIds;
      if (!filteredIds.length) {
        params.push([-1]);
        filters.push(`s.user_id = ANY($${params.length}::int[])`);
        return;
      }
      params.push(filteredIds.map((id) => parseTenantUserId(id)));
      filters.push(`s.user_id = ANY($${params.length}::int[])`);
      return;
    }

    if (allowedUserIds) {
      params.push(allowedUserIds.map((id) => parseTenantUserId(id)));
      filters.push(`s.user_id = ANY($${params.length}::int[])`);
    }
  }

  private buildScreenshotFilters(
    user: ScopedAuthUser,
    start?: string,
    end?: string,
    userId?: string,
    userIds?: string[],
    productivityFilter: ScreenshotProductivityFilter = 'all',
    allowedUserIds: string[] | null = null,
  ): { filters: string[]; params: unknown[] } {
    const scope = workspaceScope(user, 's');
    const params: unknown[] = [...scope.params];
    const filters: string[] = [scope.clause];

    if (start) {
      params.push(start);
      filters.push(`s.captured_at >= $${params.length}`);
    }
    if (end) {
      params.push(end);
      filters.push(`s.captured_at <= $${params.length}`);
    }

    this.resolveScreenshotUserFilter(user, userId, userIds, allowedUserIds, params, filters);

    applyScreenshotProductivityFilter(filters, productivityFilter);

    return { filters, params };
  }

  async countScreenshots(
    user: ScopedAuthUser,
    start?: string,
    end?: string,
    userId?: string,
    userIds?: string[],
    productivityFilter: ScreenshotProductivityFilter = 'all',
  ): Promise<number> {
    const allowedUserIds = await this.getAllowedScreenshotUserIds(user);
    const { filters, params } = this.buildScreenshotFilters(
      user,
      start,
      end,
      userId,
      userIds,
      productivityFilter,
      allowedUserIds,
    );
    const result = await this.database.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM time_doctor.screenshots s
       WHERE ${filters.join(' AND ')}`,
      params,
    );
    return Number(result.rows[0]?.total || 0);
  }

  async listScreenshots(
    user: ScopedAuthUser,
    start?: string,
    end?: string,
    userId?: string,
    limit?: number,
    offset?: number,
    userIds?: string[],
    productivityFilter: ScreenshotProductivityFilter = 'all',
    sort: ScreenshotSort = 'newest',
  ) {
    const allowedUserIds = await this.getAllowedScreenshotUserIds(user);
    const { filters, params } = this.buildScreenshotFilters(
      user,
      start,
      end,
      userId,
      userIds,
      productivityFilter,
      allowedUserIds,
    );
    const pageLimit = limit ? Math.max(1, Math.min(limit, 10000)) : 10000;
    const pageOffset = offset ? Math.max(0, offset) : 0;
    const dataParams = [...params, pageLimit, pageOffset];
    const orderBy = screenshotOrderByClause(sort);

    const result = await this.database.query(
      `SELECT s.*, s.user_id::text AS user_id
       FROM time_doctor.screenshots s
       WHERE ${filters.join(' AND ')}
       ORDER BY ${orderBy}
       LIMIT $${dataParams.length - 1}
       OFFSET $${dataParams.length}`,
      dataParams,
    );
    return this.s3.attachPresignedUrls(
      result.rows.map((row) => {
        // Meetings expect low input; floor activity so they are not labelled low activity.
        const activityPercent = applyMeetingActivityFloor(
          row.activity_percent,
          row.app_name,
          row.window_title,
        );
        return {
          ...row,
          activity_percent: activityPercent,
          focus_percent: applyMeetingActivityFloor(
            row.focus_percent,
            row.app_name,
            row.window_title,
          ),
          description: row.vision_summary ?? null,
          ai_status: row.ai_analysis_status ?? 'pending',
        };
      }),
    );
  }

  /**
   * Midpoint deduction: a screenshot "owns" the interval from midpoint(prev, this) to
   * midpoint(this, next), clamped to the session window and capped. Mirrors the desktop
   * agent + sync controller so estimates match across surfaces.
   */
  private async computeScreenshotDeductionSeconds(screenshot: {
    id: string;
    time_log_id: string | null;
    captured_at: string;
  }): Promise<number> {
    const MAX = 240;
    if (!screenshot.time_log_id) return Math.min(200, MAX);

    const tl = await this.database.query<{ start_time: string; end_time: string | null }>(
      'SELECT start_time, end_time FROM time_doctor.time_logs WHERE id = $1 LIMIT 1',
      [screenshot.time_log_id],
    );
    const timeLog = tl.rows[0];
    if (!timeLog) return Math.min(200, MAX);

    const neighbors = await this.database.query<{ captured_at: string }>(
      `SELECT captured_at FROM time_doctor.screenshots
       WHERE time_log_id = $1 AND id <> $2
       ORDER BY captured_at ASC`,
      [screenshot.time_log_id, screenshot.id],
    );

    const target = new Date(screenshot.captured_at).getTime();
    let prev: number | null = null;
    let next: number | null = null;
    for (const row of neighbors.rows) {
      const t = new Date(row.captured_at).getTime();
      if (t < target) prev = t;
      else if (t > target && next === null) next = t;
    }

    const start = new Date(timeLog.start_time).getTime();
    const end = timeLog.end_time ? new Date(timeLog.end_time).getTime() : Date.now();
    let intervalStart = prev !== null ? (prev + target) / 2 : start;
    let intervalEnd = next !== null ? (target + next) / 2 : end;
    intervalStart = Math.max(intervalStart, start);
    intervalEnd = Math.min(intervalEnd, Math.max(end, target + 60000));
    if (intervalEnd <= intervalStart) return Math.min(200, MAX);

    const rawSeconds = Math.max(0, Math.round((intervalEnd - intervalStart) / 1000));
    return Math.min(rawSeconds, MAX);
  }

  /**
   * Delete a screenshot the caller is allowed to see (self/team/org, same workspace):
   * removes the S3 object, deducts the owned interval from the parent session, and
   * deletes the RDS row. Returns deleted=false when no accessible screenshot matches.
   */
  async deleteScreenshot(
    user: ScopedAuthUser,
    id: string,
  ): Promise<{ deleted: boolean; deductedSeconds: number; timeLogId: string | null }> {
    if (!id || typeof id !== 'string') {
      return { deleted: false, deductedSeconds: 0, timeLogId: null };
    }

    const allowedUserIds = await this.getAllowedScreenshotUserIds(user);
    const scope = workspaceScope(user, 's');
    const params: unknown[] = [...scope.params];
    const filters: string[] = [scope.clause];
    params.push(id);
    filters.push(`s.id = $${params.length}`);
    if (allowedUserIds) {
      params.push(allowedUserIds.map((uid) => parseTenantUserId(uid)));
      filters.push(`s.user_id = ANY($${params.length}::int[])`);
    }

    const result = await this.database.query<{
      id: string;
      user_id: number;
      time_log_id: string | null;
      s3_key: string | null;
      file_path: string | null;
      captured_at: string;
    }>(
      `SELECT s.id, s.user_id, s.time_log_id, s.s3_key, s.file_path, s.captured_at
       FROM time_doctor.screenshots s
       WHERE ${filters.join(' AND ')}
       LIMIT 1`,
      params,
    );
    const screenshot = result.rows[0];
    if (!screenshot) {
      return { deleted: false, deductedSeconds: 0, timeLogId: null };
    }

    const deductedSeconds = await this.computeScreenshotDeductionSeconds(screenshot);

    // Best-effort S3 removal; the RDS row is the source of truth.
    await this.s3.deleteObject(screenshot.s3_key || screenshot.file_path);

    if (screenshot.time_log_id && deductedSeconds > 0) {
      await this.database.query(
        `UPDATE time_doctor.time_logs
         SET deducted_seconds = COALESCE(deducted_seconds, 0) + $1, updated_at = NOW()
         WHERE id = $2`,
        [deductedSeconds, screenshot.time_log_id],
      );
    }

    await this.database.query('DELETE FROM time_doctor.screenshots WHERE id = $1', [screenshot.id]);

    return { deleted: true, deductedSeconds, timeLogId: screenshot.time_log_id };
  }
}
