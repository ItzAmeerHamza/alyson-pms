import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { S3Service } from '../common/s3.service';

interface AuthUser {
  id: string;
  role?: string;
  organization_id?: string | null;
  is_super_admin?: boolean;
}

@Injectable()
export class DataService {
  constructor(
    private readonly database: DatabaseService,
    private readonly s3: S3Service,
  ) {}

  private isAdmin(user: AuthUser): boolean {
    return Boolean(user.is_super_admin || user.role === 'admin' || user.role === 'manager');
  }

  private scopedWhere(user: AuthUser, tableAlias = 't'): { clause: string; params: unknown[] } {
    if (user.is_super_admin || !user.organization_id) {
      return { clause: '1=1', params: [] };
    }
    return { clause: `${tableAlias}.organization_id = $1`, params: [user.organization_id] };
  }

  async listUsers(user: AuthUser) {
    const scope = this.scopedWhere(user, 'u');
    const result = await this.database.query(
      `SELECT
         u.id, u.email, u.full_name, u.role, u.avatar_url, u.is_active, u.paused_at,
         u.paused_by, u.pause_reason, u.last_activity, u.organization_id,
         u.is_org_admin, u.is_super_admin
       FROM public.users u
       WHERE ${scope.clause}
         AND u.email NOT ILIKE '%@example.com%'
       ORDER BY u.full_name ASC NULLS LAST`,
      scope.params,
    );
    return result.rows;
  }

  async latestAgentVersions(user: AuthUser, userIds: string[]) {
    if (!userIds.length) return [];
    const scope = this.scopedWhere(user, 's');
    const params: unknown[] = [...scope.params, userIds];
    const result = await this.database.query(
      `SELECT DISTINCT ON (s.user_id) s.user_id, s.agent_version, s.captured_at
       FROM public.screenshots s
       WHERE ${scope.clause}
         AND s.user_id = ANY($${scope.params.length + 1}::uuid[])
         AND s.agent_version IS NOT NULL
       ORDER BY s.user_id, s.captured_at DESC`,
      params,
    );
    return result.rows;
  }

  async listProjects(user: AuthUser) {
    const scope = this.scopedWhere(user, 'p');
    const result = await this.database.query(
      `SELECT p.id, p.name, p.description, p.organization_id, p.created_at
       FROM public.projects p
       WHERE ${scope.clause}
       ORDER BY p.created_at DESC`,
      scope.params,
    );
    return result.rows;
  }

  async createProject(user: AuthUser, payload: { name: string; description?: string | null; organization_id?: string | null }) {
    if (!this.isAdmin(user)) {
      throw new Error('Insufficient permissions to create project');
    }
    const organizationId = user.is_super_admin
      ? payload.organization_id ?? user.organization_id ?? null
      : user.organization_id ?? null;
    const result = await this.database.query(
      `INSERT INTO public.projects (name, description, organization_id, created_at, updated_at)
       VALUES ($1,$2,$3,NOW(),NOW())
       RETURNING id, name, description, organization_id, created_at`,
      [payload.name, payload.description ?? null, organizationId],
    );
    return result.rows[0];
  }

  async updateProject(
    user: AuthUser,
    projectId: string,
    updates: { name?: string; description?: string | null },
  ) {
    if (!this.isAdmin(user)) {
      throw new Error('Insufficient permissions to update project');
    }
    const scope = this.scopedWhere(user, 'p');
    const result = await this.database.query(
      `UPDATE public.projects p
       SET name = COALESCE($${scope.params.length + 2}, p.name),
           description = COALESCE($${scope.params.length + 3}, p.description),
           updated_at = NOW()
       WHERE ${scope.clause}
         AND p.id = $${scope.params.length + 1}
       RETURNING p.id, p.name, p.description, p.organization_id, p.created_at`,
      [...scope.params, projectId, updates.name ?? null, updates.description ?? null],
    );
    return result.rows[0] ?? null;
  }

  async deleteProject(user: AuthUser, projectId: string) {
    if (!this.isAdmin(user)) {
      throw new Error('Insufficient permissions to delete project');
    }
    const scope = this.scopedWhere(user, 'p');
    const result = await this.database.query(
      `DELETE FROM public.projects p
       WHERE ${scope.clause}
         AND p.id = $${scope.params.length + 1}
       RETURNING p.id`,
      [...scope.params, projectId],
    );
    return Boolean(result.rows[0]);
  }

  async countProjectAssignments(user: AuthUser, projectId: string): Promise<number> {
    const scope = this.scopedWhere(user, 'epa');
    const result = await this.database.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM public.employee_project_assignments epa
       WHERE ${scope.clause}
         AND epa.project_id = $${scope.params.length + 1}`,
      [...scope.params, projectId],
    );
    return Number(result.rows[0]?.count || 0);
  }

  async deleteProjectAssignments(user: AuthUser, projectId: string): Promise<void> {
    if (!this.isAdmin(user)) {
      throw new Error('Insufficient permissions to delete assignments');
    }
    const scope = this.scopedWhere(user, 'epa');
    await this.database.query(
      `DELETE FROM public.employee_project_assignments epa
       WHERE ${scope.clause}
         AND epa.project_id = $${scope.params.length + 1}`,
      [...scope.params, projectId],
    );
  }

  async deleteUser(user: AuthUser, targetUserId: string): Promise<boolean> {
    if (!this.isAdmin(user)) {
      throw new Error('Insufficient permissions to delete user');
    }
    const scope = this.scopedWhere(user, 'u');
    const result = await this.database.query(
      `DELETE FROM public.users u
       WHERE ${scope.clause}
         AND u.id = $${scope.params.length + 1}
       RETURNING u.id`,
      [...scope.params, targetUserId],
    );
    return Boolean(result.rows[0]);
  }

  async closeTimeLog(user: AuthUser, logId: string, endTime?: string) {
    if (!this.isAdmin(user)) {
      throw new Error('Insufficient permissions to close time log');
    }
    const scope = this.scopedWhere(user, 't');
    const params: unknown[] = [...scope.params, logId];
    const end = endTime || new Date().toISOString();
    params.push(end);
    const idParam = scope.params.length + 1;
    const endParam = scope.params.length + 2;
    const result = await this.database.query(
      `UPDATE public.time_logs t
       SET end_time = $${endParam}::timestamptz
       WHERE t.id = $${idParam}::uuid
         AND ${scope.clause}
         AND t.end_time IS NULL
       RETURNING t.*`,
      params,
    );
    return result.rows[0] || null;
  }

  async listTimeLogs(user: AuthUser, start?: string, end?: string, userId?: string, limit?: number, detailed = false) {
    const scope = this.scopedWhere(user, 't');
    const params: unknown[] = [...scope.params];
    const filters: string[] = [`${scope.clause}`];

    if (start) {
      params.push(start);
      filters.push(`t.start_time >= $${params.length}`);
    }
    if (end) {
      params.push(end);
      filters.push(`t.start_time <= $${params.length}`);
    }
    if (userId) {
      params.push(userId);
      filters.push(`t.user_id = $${params.length}`);
    }

    const selectDetailed = detailed
      ? `t.*, json_build_object('full_name', u.full_name, 'email', u.email) AS users,
         json_build_object('name', p.name) AS projects`
      : 't.*';
    const joins = detailed
      ? 'LEFT JOIN public.users u ON u.id = t.user_id LEFT JOIN public.projects p ON p.id = t.project_id'
      : '';
    const limitClause = limit
      ? `LIMIT ${Math.max(1, Math.min(limit, 10000))}`
      : 'LIMIT 10000';

    const result = await this.database.query(
      `SELECT ${selectDetailed}
       FROM public.time_logs t
       ${joins}
       WHERE ${filters.join(' AND ')}
       ORDER BY t.start_time DESC
       ${limitClause}`,
      params,
    );
    return result.rows;
  }

  async listAppLogs(
    user: AuthUser,
    start?: string,
    end?: string,
    userId?: string,
    limit?: number,
  ) {
    const scope = this.scopedWhere(user, 'a');
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
      params.push(userId);
      filters.push(`a.user_id = $${params.length}`);
    }

    const limitClause = `LIMIT ${Math.max(1, Math.min(limit ?? 10000, 10000))}`;

    const result = await this.database.query(
      `SELECT
         a.id, a.user_id, a.time_log_id, a.app_name, a.window_title,
         a.started_at, a.ended_at, a.timestamp, a.organization_id,
         CASE
           WHEN a.ended_at IS NOT NULL AND COALESCE(a.started_at, a.timestamp) IS NOT NULL
           THEN GREATEST(
             0,
             EXTRACT(EPOCH FROM (a.ended_at - COALESCE(a.started_at, a.timestamp)))::int
           )
           ELSE NULL
         END AS duration_seconds
       FROM public.app_logs a
       WHERE ${filters.join(' AND ')}
       ORDER BY COALESCE(a.started_at, a.timestamp) DESC
       ${limitClause}`,
      params,
    );
    return result.rows;
  }

  async listUrlLogs(
    user: AuthUser,
    start?: string,
    end?: string,
    userId?: string,
    limit?: number,
  ) {
    const scope = this.scopedWhere(user, 'u');
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
      params.push(userId);
      filters.push(`u.user_id = $${params.length}`);
    }

    const limitClause = `LIMIT ${Math.max(1, Math.min(limit ?? 10000, 10000))}`;

    const result = await this.database.query(
      `SELECT
         u.id,
         u.user_id,
         u.time_log_id,
         u.site_url,
         u.site_url AS url,
         u.title,
         u.domain,
         u.browser,
         u.started_at,
         u.started_at AS timestamp,
         u.ended_at,
         u.organization_id,
         CASE
           WHEN u.ended_at IS NOT NULL
           THEN GREATEST(0, EXTRACT(EPOCH FROM (u.ended_at - u.started_at))::int)
           ELSE NULL
         END AS duration_seconds
       FROM public.app_url_activity u
       WHERE ${filters.join(' AND ')}
       ORDER BY u.started_at DESC
       ${limitClause}`,
      params,
    );
    return result.rows;
  }

  async listIdleLogs(
    user: AuthUser,
    start?: string,
    end?: string,
    userId?: string,
    limit?: number,
  ) {
    const scope = this.scopedWhere(user, 'i');
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
      params.push(userId);
      filters.push(`i.user_id = $${params.length}`);
    }

    const limitClause = `LIMIT ${Math.max(1, Math.min(limit ?? 10000, 10000))}`;

    const result = await this.database.query(
      `SELECT i.id, i.user_id, i.idle_start, i.idle_end, i.duration_seconds, i.project_id, i.organization_id
       FROM public.idle_logs i
       WHERE ${filters.join(' AND ')}
       ORDER BY i.idle_start DESC
       ${limitClause}`,
      params,
    );
    return result.rows;
  }

  async listOrganizations(user: AuthUser) {
    if (user.is_super_admin) {
      const result = await this.database.query(
        `SELECT id, name, slug, logo_url
         FROM public.organizations
         WHERE COALESCE(is_active, true) = true
         ORDER BY name ASC`,
      );
      return result.rows;
    }
    if (!user.organization_id) return [];
    const result = await this.database.query(
      `SELECT id, name, slug, logo_url
       FROM public.organizations
       WHERE id = $1
       LIMIT 1`,
      [user.organization_id],
    );
    return result.rows;
  }

  async listAiInsights(
    user: AuthUser,
    start?: string,
    end?: string,
    userId?: string,
    limit?: number,
  ) {
    const scope = this.scopedWhere(user, 'i');
    const params: unknown[] = [...scope.params];
    const filters: string[] = [scope.clause];

    if (start) {
      params.push(start);
      filters.push(`i.created_at >= $${params.length}`);
    }
    if (end) {
      params.push(end);
      filters.push(`i.created_at <= $${params.length}`);
    }
    if (userId) {
      params.push(userId);
      filters.push(`i.user_id = $${params.length}`);
    }

    const limitClause = `LIMIT ${Math.max(1, Math.min(limit ?? 5000, 5000))}`;

    const result = await this.database.query(
      `SELECT
         i.*,
         json_build_object(
           'id', u.id,
           'email', u.email,
           'full_name', u.full_name,
           'role', u.role,
           'organization_id', u.organization_id
         ) AS users
       FROM public.ai_employee_insights i
       LEFT JOIN public.users u ON u.id = i.user_id
       WHERE ${filters.join(' AND ')}
         AND u.email NOT ILIKE '%@example.com%'
       ORDER BY i.created_at DESC
       ${limitClause}`,
      params,
    );
    return result.rows;
  }

  async listScreenshots(user: AuthUser, start?: string, end?: string, userId?: string, limit?: number) {
    const params: unknown[] = [];
    const filters: string[] = [];
    let join = '';

    if (!user.is_super_admin && user.organization_id) {
      join = 'LEFT JOIN public.users u ON u.id = s.user_id';
      params.push(user.organization_id);
      filters.push(`COALESCE(s.organization_id, u.organization_id) = $${params.length}`);
    } else {
      filters.push('1=1');
    }

    if (start) {
      params.push(start);
      filters.push(`s.captured_at >= $${params.length}`);
    }
    if (end) {
      params.push(end);
      filters.push(`s.captured_at <= $${params.length}`);
    }
    if (userId) {
      params.push(userId);
      filters.push(`s.user_id = $${params.length}`);
    }

    const limitClause = limit
      ? `LIMIT ${Math.max(1, Math.min(limit, 10000))}`
      : 'LIMIT 10000';

    const result = await this.database.query(
      `SELECT s.*
       FROM public.screenshots s
       ${join}
       WHERE ${filters.join(' AND ')}
       ORDER BY s.captured_at DESC
       ${limitClause}`,
      params,
    );
    return this.s3.attachPresignedUrls(result.rows);
  }
}

