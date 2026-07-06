import { Controller, Post, Body, HttpStatus, HttpException, Logger, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { randomUUID } from 'crypto';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { DatabaseService } from '../database/database.service';
import { S3Service } from '../common/s3.service';
import { buildScreenshotS3Key } from '../lib/screenshot-s3-key';
import {
  parseTenantUserId as parseTenantUserIdStrict,
  parseWorkspaceId,
} from '../database/time-doctor-sql';

function parseUserIdParam(raw: unknown): number {
  try {
    return parseTenantUserIdStrict(raw);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Invalid user_id';
    throw new HttpException(message, HttpStatus.BAD_REQUEST);
  }
}

@Controller('sync')
@UseGuards(ApiKeyGuard)
@SkipThrottle({ default: true, strict: true })
export class ForceSyncController {
  private readonly logger = new Logger(ForceSyncController.name);
  constructor(
    private readonly db: DatabaseService,
    private readonly s3: S3Service,
  ) {}

  private async resolveWorkspaceId(userId: unknown, provided?: unknown): Promise<number | null> {
    const fromPayload = parseWorkspaceId(provided);
    if (fromPayload) return fromPayload;
    const uid = parseUserIdParam(userId);
    const result = await this.db.query<{ workspace_id: number | null }>(
      'SELECT workspace_id FROM time_doctor.user_extensions WHERE user_id = $1 LIMIT 1',
      [uid],
    );
    return result.rows[0]?.workspace_id ?? null;
  }

  /** RDS screenshots columns are integer — agent may send floats for activity/focus %. */
  private toScreenshotInt(value: unknown, fallback = 0): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.round(n);
  }

  /** Last credible activity moment for a time_log (screenshots, app/url logs). */
  private sessionEvidenceEndExpr(alias = 't', graceMinutes = 0): string {
    const screenshotMax = `(SELECT MAX(s.captured_at)
         FROM time_doctor.screenshots s
         WHERE s.time_log_id = ${alias}.id)`;
    const appMax = `(SELECT MAX(COALESCE(a.timestamp, a.started_at))
         FROM time_doctor.app_logs a
         WHERE a.time_log_id = ${alias}.id)`;
    const urlMax = `(SELECT MAX(COALESCE(u.started_at, u.ended_at))
         FROM time_doctor.url_logs u
         WHERE u.time_log_id = ${alias}.id)`;
    const activityMax = `GREATEST(
      COALESCE(${screenshotMax}, ${alias}.start_time),
      COALESCE(${appMax}, ${alias}.start_time),
      COALESCE(${urlMax}, ${alias}.start_time)
    )`;
    const grace =
      graceMinutes > 0
        ? `COALESCE(${activityMax} + interval '${graceMinutes} minutes', ${alias}.start_time + interval '30 seconds')`
        : `COALESCE(${activityMax}, ${alias}.start_time + interval '30 seconds')`;
    return `GREATEST(${alias}.start_time + interval '30 seconds', ${grace})`;
  }

  private async resolveProjectId(projectId: unknown): Promise<string | null> {
    if (!projectId || typeof projectId !== 'string') return null;
    const result = await this.db.query<{ id: string }>(
      'SELECT id FROM time_doctor.projects WHERE id = $1 LIMIT 1',
      [projectId],
    );
    if (!result.rows[0]) {
      this.logger.warn(`Ignoring unknown project_id ${projectId}`);
      return null;
    }
    return projectId;
  }

  /** Desktop may send a session id before upsert_time_log has landed in RDS. */
  private async resolveTimeLogId(timeLogId: unknown): Promise<string | null> {
    if (!timeLogId || typeof timeLogId !== 'string') return null;
    const trimmed = timeLogId.trim();
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        trimmed,
      )
    ) {
      this.logger.warn(`Ignoring non-UUID time_log_id: ${trimmed.slice(0, 64)}`);
      return null;
    }
    const result = await this.db.query<{ id: string }>(
      'SELECT id FROM time_doctor.time_logs WHERE id = $1 LIMIT 1',
      [trimmed],
    );
    if (!result.rows[0]) {
      this.logger.warn(
        `time_log_id ${trimmed} not in RDS — continuing without session link`,
      );
      return null;
    }
    return trimmed;
  }

  @Post('force-url-insert')
  async forceUrlInsert(@Body() urlLog: any) {
    try {
      this.logger.log(`Force inserting URL: ${urlLog.domain} (${urlLog.browser})`);
      
      // Validate required fields
      if (!urlLog.user_id || !urlLog.site_url) {
        throw new HttpException('Missing required fields', HttpStatus.BAD_REQUEST);
      }

      const workspaceId = await this.resolveWorkspaceId(urlLog.user_id, urlLog.organization_id);
      const userId = parseUserIdParam(urlLog.user_id);
      const timeLogId = await this.resolveTimeLogId(urlLog.time_log_id);
      const startedAt = urlLog.timestamp || urlLog.started_at || new Date().toISOString();

      const result = await this.db.query<{ id: string }>(
        `INSERT INTO time_doctor.url_logs
          (user_id, time_log_id, site_url, title, domain, browser, started_at, workspace_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id`,
        [
          userId,
          timeLogId,
          urlLog.site_url,
          urlLog.title || 'Untitled',
          urlLog.domain,
          urlLog.browser,
          startedAt,
          workspaceId,
        ],
      );

      this.logger.log(`Successfully inserted URL with ID: ${result.rows[0].id}`);
      
      return {
        success: true,
        message: 'URL inserted successfully',
        id: result.rows[0].id,
        url: urlLog.site_url,
        domain: urlLog.domain
      };

    } catch (error) {
      this.logger.error('Error in force URL insert:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to insert URL', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('force-app-insert')
  async forceAppInsert(@Body() appLog: any) {
    try {
      this.logger.log(`Force inserting App: ${appLog.app_name}`);
      
      // Validate required fields
      if (!appLog.user_id || !appLog.app_name) {
        throw new HttpException('Missing required fields', HttpStatus.BAD_REQUEST);
      }

      const workspaceId = await this.resolveWorkspaceId(appLog.user_id, appLog.organization_id);
      const userId = parseUserIdParam(appLog.user_id);
      const timeLogId = await this.resolveTimeLogId(appLog.time_log_id);
      const startedAt = appLog.timestamp || appLog.started_at || new Date().toISOString();

      const result = await this.db.query<{ id: string }>(
        `INSERT INTO time_doctor.app_logs
          (user_id, time_log_id, app_name, window_title, started_at, timestamp, workspace_id)
         VALUES ($1,$2,$3,$4,$5,$5,$6)
         RETURNING id`,
        [
          userId,
          timeLogId,
          appLog.app_name,
          appLog.window_title || 'Unknown',
          startedAt,
          workspaceId,
        ],
      );

      this.logger.log(`Successfully inserted App with ID: ${result.rows[0].id}`);
      
      return {
        success: true,
        message: 'App inserted successfully',
        id: result.rows[0].id,
        app_name: appLog.app_name,
        window_title: appLog.window_title || 'Unknown'
      };

    } catch (error) {
      this.logger.error('Error in force App insert:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to insert App', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('check-connectivity')
  async checkDatabaseConnectivity() {
    try {
      this.logger.log('Testing database connectivity...');
      
      // Test basic connectivity
      await this.db.query('SELECT id FROM tenant."user" LIMIT 1');
      await this.db.query('SELECT id FROM time_doctor.url_logs LIMIT 1');
      await this.db.query('SELECT id FROM time_doctor.app_logs LIMIT 1');

      this.logger.log('✅ Database connectivity test passed');
      
      return {
        success: true,
        message: 'Database connectivity successful',
        tables: {
          users: true,
          url_logs: true,
          app_logs: true
        },
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this.logger.error('Database connectivity test failed:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Database connectivity failed', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  @Post('sync-queue-stats')
  async getSyncQueueStats() {
    try {
      // Get recent stats from various tables to understand sync status
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      
      // Check recent URL logs
      const recentUrls = (
        await this.db.query(
          `SELECT id, created_at AS timestamp, domain
           FROM time_doctor.url_logs
           WHERE coalesce(started_at, created_at) >= $1
           ORDER BY coalesce(started_at, created_at) DESC
           LIMIT 10`,
          [oneHourAgo.toISOString()],
        )
      ).rows;

      const recentApps = (
        await this.db.query(
          `SELECT id, coalesce(started_at, timestamp, created_at) AS timestamp, app_name
           FROM time_doctor.app_logs
           WHERE coalesce(started_at, timestamp, created_at) >= $1
           ORDER BY coalesce(started_at, created_at) DESC
           LIMIT 10`,
          [oneHourAgo.toISOString()],
        )
      ).rows;

      return {
        success: true,
        recentActivity: {
          urls: {
            count: recentUrls?.length || 0,
            latest: recentUrls?.[0] || null,
            error: null
          },
          apps: {
            count: recentApps?.length || 0,
            latest: recentApps?.[0] || null,
            error: null
          }
        },
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this.logger.error('Error getting sync queue stats:', error);
      throw new HttpException('Failed to get sync stats', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('desktop-action')
  async desktopAction(@Body() body: { action: string; data: any }) {
    const { action, data } = body || {};
    if (!action) {
      throw new HttpException('Missing action', HttpStatus.BAD_REQUEST);
    }

    switch (action) {
      case 'insert_app_logs': {
        const logs = Array.isArray(data?.logs) ? data.logs : [];
        for (const log of logs) {
          await this.forceAppInsert(log);
        }
        return { success: true, inserted: logs.length };
      }
      case 'insert_url_logs': {
        const logs = Array.isArray(data?.logs) ? data.logs : [];
        for (const log of logs) {
          await this.forceUrlInsert(log);
        }
        return { success: true, inserted: logs.length };
      }
      case 'insert_idle_log': {
        const log = data?.log;
        const userId = parseUserIdParam(log.user_id);
        const workspaceId = await this.resolveWorkspaceId(log.user_id, log.organization_id);
        const timeLogId = await this.resolveTimeLogId(log.time_log_id);
        await this.db.query(
          `INSERT INTO time_doctor.idle_logs
            (user_id, time_log_id, idle_start, idle_end, duration_seconds, workspace_id)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            userId,
            timeLogId,
            log.idle_start || log.start_time || new Date().toISOString(),
            log.idle_end || log.end_time || new Date().toISOString(),
            log.idle_duration_seconds || log.idle_seconds || log.duration_seconds || 0,
            workspaceId,
          ],
        );
        this.logger.log(
          `insert_idle_log: user=${userId} duration=${log.duration_seconds ?? 0}s workspace=${workspaceId ?? 'null'}`,
        );
        return { success: true };
      }
      case 'upsert_time_log': {
        const log = data?.log;
        const payload = log?.data ? { ...log.data, id: log.id || log.data.id } : log;
        if (!payload?.id) throw new HttpException('Missing time log id', HttpStatus.BAD_REQUEST);
        const userId = parseUserIdParam(payload.user_id);
        const workspaceId =
          (await this.resolveWorkspaceId(payload.user_id, payload.organization_id)) ?? null;
        const projectId = await this.resolveProjectId(payload.project_id);
        await this.db.query(
          `INSERT INTO time_doctor.time_logs
            (id, user_id, project_id, start_time, end_time, status, idle_seconds, deducted_seconds, workspace_id, device_id, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
           ON CONFLICT (id) DO UPDATE SET
             project_id = EXCLUDED.project_id,
             start_time = EXCLUDED.start_time,
             end_time = EXCLUDED.end_time,
             status = EXCLUDED.status,
             idle_seconds = EXCLUDED.idle_seconds,
             deducted_seconds = EXCLUDED.deducted_seconds,
             workspace_id = EXCLUDED.workspace_id,
             device_id = COALESCE(EXCLUDED.device_id, time_doctor.time_logs.device_id),
             updated_at = NOW()`,
          [
            payload.id,
            userId,
            projectId,
            payload.start_time || new Date().toISOString(),
            payload.end_time || null,
            payload.status || 'active',
            payload.idle_seconds ?? 0,
            payload.deducted_seconds ?? 0,
            workspaceId,
            payload.device_id || null,
          ],
        );
        return { success: true, id: payload.id };
      }
      case 'update_time_log': {
        const id = data?.id;
        const updates = data?.updates || {};
        if (!id) throw new HttpException('Missing time log id', HttpStatus.BAD_REQUEST);
        const clientEnd = updates.end_time || null;
        const isExplicitStop = updates.status === 'completed' && Boolean(clientEnd);
        const isCheckpoint = updates.status === 'active' && Boolean(clientEnd);
        const evidenceEnd = this.sessionEvidenceEndExpr('t', 5);
        const endTimeSql =
          isExplicitStop || isCheckpoint
            ? `CASE
                 WHEN $2::timestamptz IS NULL THEN t.end_time
                 ELSE GREATEST(
                   t.start_time + interval '30 seconds',
                   LEAST($2::timestamptz, NOW())
                 )
               END`
            : `CASE
                 WHEN $2::timestamptz IS NULL THEN t.end_time
                 ELSE GREATEST(
                   t.start_time + interval '30 seconds',
                   LEAST($2::timestamptz, ${evidenceEnd})
                 )
               END`;
        await this.db.query(
          `UPDATE time_doctor.time_logs t
           SET end_time = ${endTimeSql},
               status = COALESCE($3, t.status),
               idle_seconds = COALESCE($4, t.idle_seconds),
               deducted_seconds = COALESCE($5, t.deducted_seconds),
               updated_at = NOW()
           WHERE t.id = $1`,
          [id, clientEnd, updates.status || null, updates.idle_seconds || null, updates.deducted_seconds || null],
        );
        return { success: true, id };
      }
      case 'create_time_log': {
        const log = data?.log;
        if (!log?.user_id || !log?.start_time) {
          throw new HttpException('Missing user_id or start_time', HttpStatus.BAD_REQUEST);
        }
        const id = log.id || randomUUID();
        const userId = parseUserIdParam(log.user_id);
        const workspaceId = await this.resolveWorkspaceId(log.user_id, log.organization_id);
        const projectId = await this.resolveProjectId(log.project_id);
        const result = await this.db.query<{
          id: string;
          user_id: number;
          project_id: string | null;
          start_time: string;
          end_time: string | null;
          status: string;
          device_id: string | null;
        }>(
          `INSERT INTO time_doctor.time_logs
            (id, user_id, project_id, start_time, end_time, status, device_id, workspace_id, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
           RETURNING id, user_id, project_id, start_time, end_time, status, device_id`,
          [
            id,
            userId,
            projectId,
            log.start_time,
            null,
            log.status || 'active',
            log.device_id || null,
            workspaceId,
          ],
        );
        const row = result.rows[0];
        return {
          success: true,
          time_log: row
            ? { ...row, user_id: String(row.user_id) }
            : null,
        };
      }
      case 'close_active_sessions': {
        const userId = data?.user_id;
        if (!userId) {
          throw new HttpException('Missing user_id', HttpStatus.BAD_REQUEST);
        }
        const uid = parseUserIdParam(userId);
        const deviceId = data?.device_id || null;
        const explicitEnd = data?.end_time || null;
        const params: unknown[] = [uid];
        let deviceClause = '';
        if (deviceId) {
          params.push(deviceId);
          deviceClause = ` AND device_id = $${params.length}`;
        }

        // When the agent stops but the DB update fails, a later close must not use NOW()
        // for the whole gap — cap at last screenshot (or a minimal session slice).
        const evidenceEnd = this.sessionEvidenceEndExpr('t');
        let result;
        if (explicitEnd) {
          params.push(explicitEnd);
          result = await this.db.query<{ id: string }>(
            `UPDATE time_doctor.time_logs t
             SET end_time = GREATEST(
                   t.start_time + interval '30 seconds',
                   LEAST($${params.length}::timestamptz, NOW())
                 ),
                 status = 'completed',
                 updated_at = NOW()
             WHERE t.user_id = $1
               AND t.end_time IS NULL
               ${deviceClause.replace(/device_id/g, 't.device_id')}
             RETURNING t.id AS id`,
            params,
          );
        } else {
          result = await this.db.query<{ id: string }>(
            `UPDATE time_doctor.time_logs t
             SET end_time = GREATEST(
                   t.start_time + interval '30 seconds',
                   LEAST(NOW(), ${evidenceEnd})
                 ),
                 status = 'completed',
                 updated_at = NOW()
             WHERE t.user_id = $1
               AND t.end_time IS NULL
               ${deviceClause.replace(/device_id/g, 't.device_id')}
             RETURNING t.id AS id`,
            params,
          );
        }
        return { success: true, closed: result.rowCount ?? result.rows.length };
      }
      case 'reconcile_inflated_time_logs': {
        const userId = data?.user_id;
        if (!userId) {
          throw new HttpException('Missing user_id', HttpStatus.BAD_REQUEST);
        }
        const uid = parseUserIdParam(userId);
        const deviceId = data?.device_id || null;
        const params: unknown[] = [uid];
        let deviceClause = '';
        if (deviceId) {
          params.push(deviceId);
          deviceClause = ` AND t.device_id = $${params.length}`;
        }
        const evidenceEnd = this.sessionEvidenceEndExpr('t', 5);
        const result = await this.db.query<{ id: string }>(
          `UPDATE time_doctor.time_logs t
           SET end_time = ${evidenceEnd},
               status = 'completed',
               updated_at = NOW()
           WHERE t.user_id = $1
             AND t.start_time >= NOW() - interval '7 days'
             AND (
               (t.end_time IS NOT NULL AND t.end_time > ${evidenceEnd})
               OR (t.end_time IS NOT NULL AND t.end_time < t.start_time + interval '30 seconds')
             )
             ${deviceClause}
           RETURNING t.id AS id`,
          params,
        );
        return { success: true, reconciled: result.rowCount ?? result.rows.length };
      }
      case 'get_workspace_settings': {
        const userId = parseUserIdParam(data?.user_id);
        const workspaceId = await this.resolveWorkspaceId(userId, data?.workspace_id);
        const defaults = {
          hours_threshold: 7,
          high_activity_threshold: 60,
          low_activity_threshold: 30,
          screenshot_interval_minutes: 10,
        };
        if (!workspaceId) {
          return { workspace_id: null, settings: defaults };
        }
        const wsResult = await this.db.query<{ settings: Record<string, unknown> }>(
          `SELECT settings FROM time_doctor.workspace_settings WHERE workspace_id = $1 LIMIT 1`,
          [workspaceId],
        );
        const raw = wsResult.rows[0]?.settings ?? {};
        return {
          workspace_id: workspaceId,
          settings: {
            hours_threshold: Number(raw.hours_threshold ?? defaults.hours_threshold),
            high_activity_threshold: Number(
              raw.high_activity_threshold ?? defaults.high_activity_threshold,
            ),
            low_activity_threshold: Number(raw.low_activity_threshold ?? defaults.low_activity_threshold),
            screenshot_interval_minutes: Number(
              raw.screenshot_interval_minutes ?? defaults.screenshot_interval_minutes,
            ),
          },
        };
      }
      case 'list_user_projects': {
        const userId = data?.user_id;
        if (!userId) {
          throw new HttpException('Missing user_id', HttpStatus.BAD_REQUEST);
        }
        const uid = parseUserIdParam(userId);
        const result = await this.db.query<{
          project_id: string;
          name: string;
          description: string | null;
        }>(
          `SELECT p.id AS project_id, p.name, p.description
           FROM time_doctor.employee_project_assignments epa
           JOIN time_doctor.projects p ON p.id = epa.project_id
           WHERE epa.user_id = $1
           ORDER BY p.name ASC`,
          [uid],
        );
        const projects = result.rows.map((row) => ({
          project_id: row.project_id,
          name: row.name,
          description: row.description,
          projects: { id: row.project_id, name: row.name },
        }));
        return { success: true, projects };
      }
      case 'get_active_time_log': {
        const userId = data?.user_id;
        if (!userId) {
          throw new HttpException('Missing user_id', HttpStatus.BAD_REQUEST);
        }
        const uid = parseUserIdParam(userId);
        const deviceId = data?.device_id || null;
        const params: unknown[] = [uid];
        let deviceClause = '';
        if (deviceId) {
          params.push(deviceId);
          deviceClause = ` AND device_id = $${params.length}`;
        }
        const result = await this.db.query(
          `SELECT id, user_id::text AS user_id, project_id, start_time, end_time, status, device_id
           FROM time_doctor.time_logs
           WHERE user_id = $1
             AND end_time IS NULL
             AND status = 'active'
             ${deviceClause}
           ORDER BY start_time DESC
           LIMIT 1`,
          params,
        );
        return { success: true, time_log: result.rows[0] ?? null };
      }
      case 'get_today_time_logs': {
        const userId = data?.user_id;
        if (!userId) {
          throw new HttpException('Missing user_id', HttpStatus.BAD_REQUEST);
        }
        const uid = parseUserIdParam(userId);
        const start = data?.start_of_day;
        const end = data?.end_of_day;
        const startOfDay =
          start ||
          (() => {
            const d = new Date();
            return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
          })();
        const endOfDay =
          end ||
          (() => {
            const d = new Date();
            const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            return new Date(s.getTime() + 24 * 60 * 60 * 1000).toISOString();
          })();
        const result = await this.db.query<{
          id: string;
          start_time: string;
          end_time: string | null;
          status: string;
        }>(
          `SELECT id, start_time, end_time, status
           FROM time_doctor.time_logs
           WHERE user_id = $1
             AND start_time >= $2
             AND start_time < $3
           ORDER BY start_time DESC`,
          [uid, startOfDay, endOfDay],
        );
        return { success: true, time_logs: result.rows };
      }
      case 'get_time_logs_in_range': {
        const userId = data?.user_id;
        if (!userId) {
          throw new HttpException('Missing user_id', HttpStatus.BAD_REQUEST);
        }
        const uid = parseUserIdParam(userId);
        const filters: string[] = ['user_id = $1'];
        const params: unknown[] = [uid];
        if (data?.start) {
          params.push(data.start);
          filters.push(`start_time >= $${params.length}`);
        }
        if (data?.end) {
          params.push(data.end);
          filters.push(`start_time < $${params.length}`);
        } else if (data?.before_end) {
          params.push(data.before_end);
          filters.push(`start_time < $${params.length}`);
        }
        const limit = Math.min(Math.max(Number(data?.limit) || 5000, 1), 10000);
        const result = await this.db.query(
          `SELECT id, start_time, end_time, project_id, status, idle_seconds, deducted_seconds
           FROM time_doctor.time_logs
           WHERE ${filters.join(' AND ')}
           ORDER BY start_time ASC
           LIMIT ${limit}`,
          params,
        );
        return { success: true, time_logs: result.rows };
      }
      case 'list_app_logs': {
        const userId = data?.user_id;
        if (!userId) {
          throw new HttpException('Missing user_id', HttpStatus.BAD_REQUEST);
        }
        const uid = parseUserIdParam(userId);
        const filters: string[] = ['user_id = $1'];
        const params: unknown[] = [uid];
        if (data?.start) {
          params.push(data.start);
          filters.push(`COALESCE(timestamp, started_at) >= $${params.length}`);
        }
        if (data?.end) {
          params.push(data.end);
          filters.push(`COALESCE(timestamp, started_at) <= $${params.length}`);
        }
        const limit = Math.min(Math.max(Number(data?.limit) || 500, 1), 5000);
        const result = await this.db.query(
          `SELECT id, app_name, window_title, timestamp, started_at, ended_at
           FROM time_doctor.app_logs
           WHERE ${filters.join(' AND ')}
           ORDER BY COALESCE(timestamp, started_at) DESC
           LIMIT ${limit}`,
          params,
        );
        return { success: true, app_logs: result.rows };
      }
      case 'list_url_logs': {
        const userId = data?.user_id;
        if (!userId) {
          throw new HttpException('Missing user_id', HttpStatus.BAD_REQUEST);
        }
        const uid = parseUserIdParam(userId);
        const filters: string[] = ['user_id = $1'];
        const params: unknown[] = [uid];
        if (data?.start) {
          params.push(data.start);
          filters.push(`started_at >= $${params.length}`);
        }
        if (data?.end) {
          params.push(data.end);
          filters.push(`started_at <= $${params.length}`);
        }
        const limit = Math.min(Math.max(Number(data?.limit) || 500, 1), 5000);
        const result = await this.db.query(
          `SELECT id, site_url AS url, title, domain, browser, started_at AS timestamp
           FROM time_doctor.url_logs
           WHERE ${filters.join(' AND ')}
           ORDER BY started_at DESC
           LIMIT ${limit}`,
          params,
        );
        return { success: true, url_logs: result.rows };
      }
      case 'screenshot_upload_init': {
        if (!this.s3.isEnabled()) {
          throw new HttpException('S3 is not configured on the API', HttpStatus.SERVICE_UNAVAILABLE);
        }
        const userId = data?.user_id;
        if (!userId) {
          throw new HttpException('Missing user_id', HttpStatus.BAD_REQUEST);
        }
        const capturedAt = data?.captured_at || new Date().toISOString();
        const ext = String(data?.ext || 'jpg').replace(/^\./, '').toLowerCase();
        const contentType =
          data?.content_type ||
          (ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');
        const screenshotId = data?.screenshot_id || randomUUID();
        const workspaceId = await this.resolveWorkspaceId(userId, data?.organization_id);
        const s3Key = buildScreenshotS3Key({
          prefix: this.s3.getScreenshotsPrefix(),
          capturedAt,
          organizationId: workspaceId ? String(workspaceId) : null,
          userId: String(userId),
          screenshotId,
          ext,
        });
        const uploadUrl = await this.s3.getPresignedPutUrl(s3Key, contentType);
        return { success: true, id: screenshotId, s3_key: s3Key, upload_url: uploadUrl, content_type: contentType };
      }
      case 'list_screenshots': {
        const userId = data?.user_id;
        if (!userId) {
          throw new HttpException('Missing user_id', HttpStatus.BAD_REQUEST);
        }
        const start = data?.start;
        const end = data?.end;
        const limit = Math.min(Math.max(Number(data?.limit) || 50, 1), 500);
        const filters: string[] = ['s.user_id = $1'];
        const params: unknown[] = [parseUserIdParam(userId)];
        if (start) {
          params.push(start);
          filters.push(`s.captured_at >= $${params.length}`);
        }
        if (end) {
          params.push(end);
          filters.push(`s.captured_at <= $${params.length}`);
        }
        const result = await this.db.query(
          `SELECT s.id, s.user_id::text AS user_id, s.time_log_id, s.s3_key, s.file_path, s.file_size,
                  s.captured_at, s.activity_percent, s.focus_percent, s.mouse_clicks,
                  s.keystrokes, s.mouse_movements, s.app_name, s.window_title
           FROM time_doctor.screenshots s
           WHERE ${filters.join(' AND ')}
           ORDER BY s.captured_at DESC
           LIMIT ${limit}`,
          params,
        );
        const screenshots = await this.s3.attachPresignedUrls(result.rows);
        return { success: true, screenshots };
      }
      case 'screenshot_upload_complete': {
        const meta = data?.metadata || data || {};
        const screenshotId = meta.id || meta.screenshot_id;
        const userId = meta.user_id;
        const s3Key = meta.s3_key;
        if (!screenshotId || !userId || !s3Key) {
          throw new HttpException('Missing id, user_id, or s3_key', HttpStatus.BAD_REQUEST);
        }
        const workspaceId = await this.resolveWorkspaceId(userId, meta.organization_id);
        const timeLogId = await this.resolveTimeLogId(meta.time_log_id);
        const insert = await this.db.query<{ id: string }>(
          `INSERT INTO time_doctor.screenshots
            (id, user_id, time_log_id, image_url, file_path, file_size, s3_key, captured_at,
             activity_percent, focus_percent, mouse_clicks, keystrokes, mouse_movements,
             app_name, window_title, agent_version, workspace_id)
           VALUES ($1,$2,$3,NULL,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           ON CONFLICT (id) DO UPDATE SET
             s3_key = EXCLUDED.s3_key,
             file_path = EXCLUDED.file_path,
             file_size = EXCLUDED.file_size,
             captured_at = EXCLUDED.captured_at,
             time_log_id = COALESCE(EXCLUDED.time_log_id, time_doctor.screenshots.time_log_id)
           RETURNING id`,
          [
            screenshotId,
            parseUserIdParam(userId),
            timeLogId,
            s3Key,
            meta.file_size || null,
            s3Key,
            meta.captured_at || new Date().toISOString(),
            this.toScreenshotInt(meta.activity_percent, 0),
            this.toScreenshotInt(meta.focus_percent, 0),
            this.toScreenshotInt(meta.mouse_clicks, 0),
            this.toScreenshotInt(meta.keystrokes, 0),
            this.toScreenshotInt(meta.mouse_movements, 0),
            meta.app_name || null,
            meta.window_title || null,
            meta.agent_version || null,
            workspaceId,
          ],
        );
        return { success: true, id: insert.rows[0].id, s3_key: s3Key };
      }
      case 'upload_screenshot': {
        throw new HttpException(
          'upload_screenshot is deprecated; use screenshot_upload_init + PUT to S3 + screenshot_upload_complete',
          HttpStatus.GONE,
        );
      }
      default:
        throw new HttpException(`Unsupported action: ${action}`, HttpStatus.BAD_REQUEST);
    }
  }
}
