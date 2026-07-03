import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { S3Service } from '../common/s3.service';
import {
  EMPLOYEE_USER_SELECT,
  ScopedAuthUser,
  WORKSPACE_AS_ORG_SELECT,
  parseTenantUserId,
  parseWorkspaceId,
  workspaceScope,
} from '../database/time-doctor-sql';

@Injectable()
export class DataService {
  constructor(
    private readonly database: DatabaseService,
    private readonly s3: S3Service,
  ) {}

  private isAdmin(user: ScopedAuthUser): boolean {
    return Boolean(user.is_super_admin || user.role === 'admin' || user.role === 'manager');
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
      params.push(parseTenantUserId(userId));
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
    if (userId) {
      params.push(parseTenantUserId(userId));
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
    if (userId) {
      params.push(parseTenantUserId(userId));
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
    if (userId) {
      params.push(parseTenantUserId(userId));
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

  async listScreenshots(
    user: ScopedAuthUser,
    start?: string,
    end?: string,
    userId?: string,
    limit?: number,
  ) {
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
    if (userId) {
      params.push(parseTenantUserId(userId));
      filters.push(`s.user_id = $${params.length}`);
    }

    const limitClause = limit
      ? `LIMIT ${Math.max(1, Math.min(limit, 10000))}`
      : 'LIMIT 10000';

    const result = await this.database.query(
      `SELECT s.*, s.user_id::text AS user_id
       FROM time_doctor.screenshots s
       WHERE ${filters.join(' AND ')}
       ORDER BY s.captured_at DESC
       ${limitClause}`,
      params,
    );
    return this.s3.attachPresignedUrls(result.rows);
  }
}
