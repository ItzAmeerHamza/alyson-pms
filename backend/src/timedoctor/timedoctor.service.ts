import { ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ScopedAuthUser, parseWorkspaceId, workspaceScope } from '../database/time-doctor-sql';
import {
  SCREENSHOT_IS_VIDEO_MEETING_SQL,
  applyMeetingActivityFloor,
} from '../pulse/meeting-context';
import { getWorkTimezone } from '../lib/work-timezone';

/**
 * Time Doctor Classic (v1.1) compatible read API, served from time_doctor.* on
 * Palisade's revclouddb. Response shapes intentionally mirror Time Doctor so the
 * Alyson HR clients (alyson-client-main + Palisade AlysonHR) work by only swapping
 * API_BASE_URL + token.
 *
 * `company_id` maps to tenant.workspace.id.
 *
 * Endpoints matched to what Alyson HR actually consumes:
 *   GET /companies
 *   GET /companies/:cid/users        (offset/limit)
 *   GET /companies/:cid/worklogs     (start_date,end_date,user_id,offset,limit,consolidated,breaks_only)
 *   GET /companies/:cid/poortime     (start_date,end_date,user_id,user_offset,user_limit)
 *   GET /companies/:cid/webandapp    (start_date,end_date,user_id,offset,limit)
 */
@Injectable()
export class TimeDoctorService {
  private static readonly DEFAULT_LOW_ACTIVITY_THRESHOLD = 30;
  private static readonly DEFAULT_SCREENSHOT_INTERVAL_MIN = 10;

  constructor(private readonly database: DatabaseService) {}

  /** GET /companies -> { accounts: [{ company_id, company_name, name, company_time_zone }] } */
  async listCompanies(user: ScopedAuthUser): Promise<{ accounts: unknown[] }> {
    const base = `
      SELECT
        w.id AS company_id,
        w.name AS company_name,
        w.name AS name,
        coalesce(w.active, true) AS active,
        ws.settings->>'timezone' AS company_time_zone
      FROM tenant.workspace w
      LEFT JOIN time_doctor.workspace_settings ws ON ws.workspace_id = w.id
    `;

    if (user.is_super_admin) {
      const result = await this.database.query(
        `${base}
         WHERE coalesce(w.active, true) = true
         ORDER BY w.name ASC`,
      );
      return { accounts: result.rows };
    }

    const wsId = parseWorkspaceId(user.organization_id);
    if (!wsId) return { accounts: [] };
    const result = await this.database.query(`${base} WHERE w.id = $1 LIMIT 1`, [wsId]);
    return { accounts: result.rows };
  }

  /** GET /companies/:companyId/users -> { users: [...], count } */
  async listUsers(
    user: ScopedAuthUser,
    companyId: number,
    offset: number,
    limit: number,
  ): Promise<{ users: unknown[]; count: number }> {
    this.assertWorkspaceAccess(user, companyId);
    const interval = await this.screenshotIntervalMinutes(companyId);
    const result = await this.database.query(
      `SELECT
         u.id AS user_id,
         u.id AS id,
         u.first_name,
         u.last_name,
         trim(both ' ' from coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) AS full_name,
         u.email,
         coalesce(ext.pulse_role, 'employee') AS role,
         ext.department AS team_name,
         COUNT(*) OVER() AS count
       FROM tenant."user" u
       JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
       WHERE ext.workspace_id = $1
         AND u.email NOT ILIKE '%@example.com%'
       ORDER BY full_name ASC NULLS LAST
       LIMIT $2 OFFSET $3`,
      [companyId, limit, offset],
    );
    const count = result.rows.length ? Number(result.rows[0].count) : 0;
    const users = result.rows.map((row: Record<string, unknown>) => ({
      user_id: row.user_id,
      id: row.id,
      first_name: row.first_name,
      last_name: row.last_name,
      full_name: row.full_name,
      name: row.full_name,
      email: row.email,
      title: '',
      team_name: row.team_name ?? '',
      role: row.role,
      screenshots_interval: interval,
    }));
    return { users, count };
  }

  /** GET /companies/:companyId/worklogs -> { worklogs: { items: [...] } } */
  async listWorklogs(
    user: ScopedAuthUser,
    companyId: number,
    startDate: string,
    endDate: string,
    limit: number,
    offset: number,
    userId?: number,
    breaksOnly = false,
  ): Promise<{ worklogs: { items: unknown[] } }> {
    this.assertWorkspaceAccess(user, companyId);

    // We do not track break segments; Time Doctor's breaks_only=1 -> empty set.
    if (breaksOnly) {
      return { worklogs: { items: [] } };
    }

    const params: unknown[] = [companyId, startDate, endDate];
    let userFilter = '';
    if (userId) {
      params.push(userId);
      userFilter = `AND t.user_id = $${params.length}`;
    }
    params.push(limit);
    const limitParam = params.length;
    params.push(offset);
    const offsetParam = params.length;

    const result = await this.database.query(
      `SELECT
         t.id,
         t.user_id,
         trim(both ' ' from coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) AS user_name,
         t.project_id,
         p.name AS project_name,
         NULL::text AS task_name,
         t.start_time,
         t.start_time AS start_time_iso,
         t.end_time,
         t.status,
         GREATEST(
           0,
           EXTRACT(EPOCH FROM (COALESCE(t.end_time, t.last_alive_at, NOW()) - t.start_time))::int
             - COALESCE(t.deducted_seconds, 0)
         ) AS length
       FROM time_doctor.time_logs t
       LEFT JOIN tenant."user" u ON u.id = t.user_id
       LEFT JOIN time_doctor.projects p ON p.id = t.project_id
       WHERE t.workspace_id = $1
         AND t.start_time >= $2::date
         AND t.start_time < ($3::date + INTERVAL '1 day')
         ${userFilter}
       ORDER BY t.start_time ASC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params,
    );
    return { worklogs: { items: result.rows } };
  }

  /**
   * GET /companies/:companyId/screenshots -> [{ user_id, screenshots: { screenshots: [...] } }]
   * (Used by reporting scripts, not by Alyson HR.)
   */
  async listScreenshots(
    user: ScopedAuthUser,
    companyId: number,
    startDate: string,
    endDate: string,
    screenshotsLimit: number,
  ): Promise<unknown[]> {
    this.assertWorkspaceAccess(user, companyId);
    const threshold = await this.lowActivityThreshold(companyId);
    const result = await this.database.query(
      `SELECT
         s.id,
         s.user_id,
         s.captured_at,
         s.activity_percent,
         s.focus_percent,
         s.mouse_clicks,
         s.keystrokes AS keystrokes,
         s.mouse_movements AS mousemovements,
         s.app_name,
         s.window_title,
         (s.activity_percent <= $2 AND NOT ${SCREENSHOT_IS_VIDEO_MEETING_SQL}) AS is_low_activity
       FROM time_doctor.screenshots s
       WHERE s.workspace_id = $1
         AND s.captured_at >= $3::date
         AND s.captured_at < ($4::date + INTERVAL '1 day')
       ORDER BY s.user_id ASC, s.captured_at ASC
       LIMIT $5`,
      [companyId, threshold, startDate, endDate, screenshotsLimit],
    );

    const byUser = new Map<number, Record<string, unknown>[]>();
    for (const row of result.rows as Record<string, unknown>[]) {
      const uid = Number(row.user_id);
      const shot = {
        id: row.id,
        timestamp: row.captured_at,
        activity_percent: applyMeetingActivityFloor(
          row.activity_percent as number | null,
          row.app_name as string | null,
          row.window_title as string | null,
        ),
        focus_percent: applyMeetingActivityFloor(
          row.focus_percent as number | null,
          row.app_name as string | null,
          row.window_title as string | null,
        ),
        mouse_clicks: row.mouse_clicks,
        keystrokes: row.keystrokes,
        mousemovements: row.mousemovements,
        app_name: row.app_name,
        window_title: row.window_title,
        is_low_activity: row.is_low_activity,
        deleted: false,
      };
      const list = byUser.get(uid);
      if (list) list.push(shot);
      else byUser.set(uid, [shot]);
    }

    return Array.from(byUser.entries()).map(([userId, shots]) => ({
      user_id: userId,
      screenshots: { screenshots: shots },
    }));
  }

  /**
   * GET /companies/:companyId/poortime -> [{ user_id, poor_time_website: { <domain>: { timeSpend } } }]
   *
   * Approximation: aggregates time spent per browsed domain from url_logs. We do not
   * currently maintain a productive/unproductive site classification, so all tracked
   * browsing time is reported here.
   */
  async listPoorTime(
    user: ScopedAuthUser,
    companyId: number,
    startDate: string,
    endDate: string,
    userId: number | undefined,
    userOffset: number,
    userLimit: number,
  ): Promise<unknown[]> {
    this.assertWorkspaceAccess(user, companyId);

    const params: unknown[] = [companyId, startDate, endDate];
    let userFilter = '';
    if (userId) {
      params.push(userId);
      userFilter = `AND u.user_id = $${params.length}`;
    }

    const result = await this.database.query(
      `SELECT
         u.user_id,
         COALESCE(NULLIF(u.domain, ''), u.site_url) AS site,
         SUM(GREATEST(0, EXTRACT(EPOCH FROM (u.ended_at - u.started_at))::int))::int AS time_spend
       FROM time_doctor.url_logs u
       WHERE u.workspace_id = $1
         AND u.ended_at IS NOT NULL
         AND u.site_url IS NOT NULL
         AND u.site_url NOT ILIKE '%browser-activity-detected.local%'
         AND u.started_at >= $2::date
         AND u.started_at < ($3::date + INTERVAL '1 day')
         ${userFilter}
       GROUP BY u.user_id, COALESCE(NULLIF(u.domain, ''), u.site_url)
       HAVING SUM(GREATEST(0, EXTRACT(EPOCH FROM (u.ended_at - u.started_at))::int)) > 0
       ORDER BY u.user_id ASC`,
      params,
    );

    const byUser = new Map<number, Record<string, { timeSpend: number }>>();
    for (const row of result.rows as Record<string, unknown>[]) {
      const uid = Number(row.user_id);
      const site = String(row.site ?? 'unknown');
      const timeSpend = Number(row.time_spend ?? 0);
      const sites = byUser.get(uid) ?? {};
      sites[site] = { timeSpend };
      byUser.set(uid, sites);
    }

    const rows = Array.from(byUser.entries()).map(([uid, sites]) => ({
      user_id: uid,
      poor_time_website: sites,
    }));

    // Time Doctor paginates poortime by user (user_offset / user_limit).
    return rows.slice(userOffset, userOffset + userLimit);
  }

  /**
   * GET /companies/:companyId/webandapp -> [{ user_id, websites_and_apps: [{ name, timeSpend, timeType }] }]
   *
   * timeType is 'apps' (from app_logs) or 'websites' (from url_logs), matching Time Doctor.
   */
  async listWebAndApp(
    user: ScopedAuthUser,
    companyId: number,
    startDate: string,
    endDate: string,
    userId: number | undefined,
    offset: number,
    limit: number,
  ): Promise<unknown[]> {
    this.assertWorkspaceAccess(user, companyId);

    const appParams: unknown[] = [companyId, startDate, endDate];
    let appUserFilter = '';
    if (userId) {
      appParams.push(userId);
      appUserFilter = `AND a.user_id = $${appParams.length}`;
    }

    const apps = await this.database.query(
      `SELECT
         a.user_id,
         a.app_name AS name,
         SUM(GREATEST(0, EXTRACT(EPOCH FROM (a.ended_at - COALESCE(a.started_at, a.timestamp)))::int))::int AS time_spend
       FROM time_doctor.app_logs a
       WHERE a.workspace_id = $1
         AND a.app_name IS NOT NULL
         AND a.ended_at IS NOT NULL
         AND COALESCE(a.started_at, a.timestamp) >= $2::date
         AND COALESCE(a.started_at, a.timestamp) < ($3::date + INTERVAL '1 day')
         ${appUserFilter}
       GROUP BY a.user_id, a.app_name
       HAVING SUM(GREATEST(0, EXTRACT(EPOCH FROM (a.ended_at - COALESCE(a.started_at, a.timestamp)))::int)) > 0`,
      appParams,
    );

    const urlParams: unknown[] = [companyId, startDate, endDate];
    let urlUserFilter = '';
    if (userId) {
      urlParams.push(userId);
      urlUserFilter = `AND u.user_id = $${urlParams.length}`;
    }

    const sites = await this.database.query(
      `SELECT
         u.user_id,
         COALESCE(NULLIF(u.domain, ''), u.site_url) AS name,
         SUM(GREATEST(0, EXTRACT(EPOCH FROM (u.ended_at - u.started_at))::int))::int AS time_spend
       FROM time_doctor.url_logs u
       WHERE u.workspace_id = $1
         AND u.ended_at IS NOT NULL
         AND u.site_url IS NOT NULL
         AND u.site_url NOT ILIKE '%browser-activity-detected.local%'
         AND u.started_at >= $2::date
         AND u.started_at < ($3::date + INTERVAL '1 day')
         ${urlUserFilter}
       GROUP BY u.user_id, COALESCE(NULLIF(u.domain, ''), u.site_url)
       HAVING SUM(GREATEST(0, EXTRACT(EPOCH FROM (u.ended_at - u.started_at))::int)) > 0`,
      urlParams,
    );

    const byUser = new Map<number, { name: string; timeSpend: number; timeType: string }[]>();
    const push = (uid: number, name: string, timeSpend: number, timeType: string) => {
      if (!name) return;
      const list = byUser.get(uid) ?? [];
      list.push({ name, timeSpend, timeType });
      byUser.set(uid, list);
    };
    for (const row of apps.rows as Record<string, unknown>[]) {
      push(Number(row.user_id), String(row.name ?? ''), Number(row.time_spend ?? 0), 'apps');
    }
    for (const row of sites.rows as Record<string, unknown>[]) {
      push(Number(row.user_id), String(row.name ?? ''), Number(row.time_spend ?? 0), 'websites');
    }

    const rows = Array.from(byUser.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([uid, list]) => ({
        user_id: uid,
        websites_and_apps: list.sort((a, b) => b.timeSpend - a.timeSpend),
      }));

    return rows.slice(offset, offset + limit);
  }

  /**
   * GET /worklogs (top-level, no company). Workspace-scoped to the caller.
   * Returns { items: [{ id, user_id, start_time, end_time, length }] }.
   * (Alyson HR's dashboard uses `start`/`end`/`userId` query names here.)
   */
  async listWorklogsFlat(
    user: ScopedAuthUser,
    startDate: string,
    endDate: string,
    userId: number | undefined,
    limit: number,
    offset: number,
  ): Promise<{ items: unknown[] }> {
    const scope = workspaceScope(user, 't');
    const params: unknown[] = [...scope.params];
    const filters: string[] = [scope.clause];

    params.push(startDate);
    filters.push(`t.start_time >= $${params.length}::date`);
    params.push(endDate);
    filters.push(`t.start_time < ($${params.length}::date + INTERVAL '1 day')`);
    if (userId) {
      params.push(userId);
      filters.push(`t.user_id = $${params.length}`);
    }
    params.push(limit);
    const limitParam = params.length;
    params.push(offset);
    const offsetParam = params.length;

    const result = await this.database.query(
      `SELECT
         t.id,
         t.user_id,
         t.start_time,
         COALESCE(t.end_time, t.last_alive_at, NOW()) AS end_time,
         GREATEST(
           0,
           EXTRACT(EPOCH FROM (COALESCE(t.end_time, t.last_alive_at, NOW()) - t.start_time))::int
             - COALESCE(t.deducted_seconds, 0)
         ) AS length
       FROM time_doctor.time_logs t
       WHERE ${filters.join(' AND ')}
       ORDER BY t.start_time ASC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params,
    );
    return { items: result.rows };
  }

  /**
   * GET /poor-time (top-level, no company). Workspace-scoped to the caller.
   * Returns { items: [{ id, user_id, started_at, ended_at, length }] }.
   */
  async listPoorTimeFlat(
    user: ScopedAuthUser,
    startDate: string,
    endDate: string,
    userId: number | undefined,
    limit: number,
    offset: number,
  ): Promise<{ items: unknown[] }> {
    const scope = workspaceScope(user, 'u');
    const params: unknown[] = [...scope.params];
    const filters: string[] = [
      scope.clause,
      'u.ended_at IS NOT NULL',
      'u.site_url IS NOT NULL',
      "u.site_url NOT ILIKE '%browser-activity-detected.local%'",
    ];

    params.push(startDate);
    filters.push(`u.started_at >= $${params.length}::date`);
    params.push(endDate);
    filters.push(`u.started_at < ($${params.length}::date + INTERVAL '1 day')`);
    if (userId) {
      params.push(userId);
      filters.push(`u.user_id = $${params.length}`);
    }
    params.push(limit);
    const limitParam = params.length;
    params.push(offset);
    const offsetParam = params.length;

    const result = await this.database.query(
      `SELECT
         u.id,
         u.user_id,
         u.started_at,
         u.ended_at,
         GREATEST(0, EXTRACT(EPOCH FROM (u.ended_at - u.started_at))::int) AS length
       FROM time_doctor.url_logs u
       WHERE ${filters.join(' AND ')}
       ORDER BY u.started_at ASC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params,
    );
    return { items: result.rows };
  }

  /**
   * GET /absent-late (top-level, no company). Workspace-scoped to the caller.
   * Returns { items: [{ id, user_id, date, status }] } where status is present/absent.
   * `late` is not derivable without a work-schedule, so it is never emitted.
   */
  async listAbsentLate(
    user: ScopedAuthUser,
    startDate: string,
    endDate: string,
    userId: number | undefined,
    limit: number,
    offset: number,
  ): Promise<{ items: unknown[] }> {
    const wsId = user.is_super_admin ? null : parseWorkspaceId(user.organization_id);

    const params: unknown[] = [];
    let extWs = '1=1';
    let tWs = '1=1';
    if (wsId) {
      params.push(wsId);
      extWs = `ext.workspace_id = $1`;
      tWs = `t.workspace_id = $1`;
    }
    params.push(startDate);
    const startParam = params.length;
    params.push(endDate);
    const endParam = params.length;
    let userClause = '';
    if (userId) {
      params.push(userId);
      userClause = `AND ext.user_id = $${params.length}`;
    }
    params.push(limit);
    const limitParam = params.length;
    params.push(offset);
    const offsetParam = params.length;

    // Interpolated, not bound: a timezone name cannot be a query parameter
    // inside AT TIME ZONE. Comes from server config, never from the request,
    // and quotes are escaped.
    const workTz = getWorkTimezone().replace(/'/g, "''");

    const result = await this.database.query(
      `WITH days AS (
         SELECT generate_series($${startParam}::date, $${endParam}::date, INTERVAL '1 day')::date AS day
       ),
       emp AS (
         SELECT ext.user_id FROM time_doctor.user_extensions ext
         WHERE ${extWs} ${userClause}
       ),
       -- Credit each day the time that actually falls inside it.
       --
       -- Bucketing by DATE(start_time) and summing the whole session gave the
       -- start day everything: someone working 23:00-02:00 was present on the
       -- first day and ABSENT on the second, having worked two hours into it.
       -- 225 sessions cross work-day midnight, carrying 375 hours onto a day
       -- that was not credited with them.
       --
       -- Overlapping against each day also removes any dependence on the agent
       -- splitting sessions at midnight, which it cannot do while asleep or
       -- offline. Boundaries are work-timezone midnights, not the server's.
       worked AS (
         SELECT t.user_id, d.day,
                SUM(EXTRACT(EPOCH FROM (
                  LEAST(
                    COALESCE(t.end_time, t.last_alive_at, NOW()),
                    ((d.day + INTERVAL '1 day')::timestamp AT TIME ZONE '${workTz}')
                  )
                  - GREATEST(t.start_time, (d.day::timestamp AT TIME ZONE '${workTz}'))
                ))) AS secs
         FROM time_doctor.time_logs t
         JOIN days d
           ON t.start_time < ((d.day + INTERVAL '1 day')::timestamp AT TIME ZONE '${workTz}')
          AND COALESCE(t.end_time, t.last_alive_at, NOW()) > (d.day::timestamp AT TIME ZONE '${workTz}')
         WHERE ${tWs}
           -- One day of slack so a session that began before the range but runs
           -- into it still credits the days it covers.
           AND t.start_time >= ($${startParam}::date - INTERVAL '1 day')
           AND t.start_time < ($${endParam}::date + INTERVAL '1 day')
         GROUP BY t.user_id, d.day
       )
       SELECT
         emp.user_id,
         d.day::text AS date,
         CASE WHEN COALESCE(w.secs, 0) > 0 THEN 'present' ELSE 'absent' END AS status
       FROM emp
       CROSS JOIN days d
       LEFT JOIN worked w ON w.user_id = emp.user_id AND w.day = d.day
       ORDER BY emp.user_id ASC, d.day ASC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params,
    );

    const items = (result.rows as Record<string, unknown>[]).map((r) => ({
      id: `${r.user_id}:${r.date}`,
      user_id: r.user_id,
      date: r.date,
      status: r.status,
    }));
    return { items };
  }

  private assertWorkspaceAccess(user: ScopedAuthUser, companyId: number): void {
    if (user.is_super_admin) return;
    const wsId = parseWorkspaceId(user.organization_id);
    if (wsId !== companyId) {
      throw new ForbiddenException('You do not have access to this company');
    }
  }

  private async workspaceSetting(
    companyId: number,
    key: string,
  ): Promise<number | null> {
    const result = await this.database.query<{ value: string | null }>(
      `SELECT settings->>$2 AS value
       FROM time_doctor.workspace_settings
       WHERE workspace_id = $1
       LIMIT 1`,
      [companyId, key],
    );
    const raw = result.rows[0]?.value;
    if (raw == null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private async lowActivityThreshold(companyId: number): Promise<number> {
    const value = await this.workspaceSetting(companyId, 'low_activity_threshold');
    return value ?? TimeDoctorService.DEFAULT_LOW_ACTIVITY_THRESHOLD;
  }

  private async screenshotIntervalMinutes(companyId: number): Promise<number> {
    const value = await this.workspaceSetting(companyId, 'screenshot_interval_minutes');
    return value ?? TimeDoctorService.DEFAULT_SCREENSHOT_INTERVAL_MIN;
  }
}
