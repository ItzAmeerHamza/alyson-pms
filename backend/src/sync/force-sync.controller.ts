import { Controller, Post, Body, HttpStatus, HttpException, Logger, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { randomUUID } from 'crypto';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { DatabaseService } from '../database/database.service';
import { S3Service } from '../common/s3.service';
import { buildScreenshotS3Key } from '../lib/screenshot-s3-key';

@Controller('sync')
@UseGuards(ApiKeyGuard)
@Throttle({ default: { ttl: 60000, limit: 30 } })
export class ForceSyncController {
  private readonly logger = new Logger(ForceSyncController.name);
  constructor(
    private readonly db: DatabaseService,
    private readonly s3: S3Service,
  ) {}

  private async resolveOrgId(userId: string, provided?: string): Promise<string | null> {
    if (provided) return provided;
    const result = await this.db.query<{ organization_id: string | null }>(
      'SELECT organization_id FROM public.users WHERE id = $1 LIMIT 1',
      [userId],
    );
    return result.rows[0]?.organization_id ?? null;
  }

  /** RDS screenshots columns are integer — agent may send floats for activity/focus %. */
  private toScreenshotInt(value: unknown, fallback = 0): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.round(n);
  }

  /** Desktop may send a session id before upsert_time_log has landed in RDS. */
  private async resolveTimeLogId(timeLogId: unknown): Promise<string | null> {
    if (!timeLogId || typeof timeLogId !== 'string') return null;
    const result = await this.db.query<{ id: string }>(
      'SELECT id FROM public.time_logs WHERE id = $1 LIMIT 1',
      [timeLogId],
    );
    if (!result.rows[0]) {
      this.logger.warn(
        `screenshot_upload_complete: time_log_id ${timeLogId} not in RDS — saving screenshot without session link`,
      );
      return null;
    }
    return timeLogId;
  }

  @Post('force-url-insert')
  async forceUrlInsert(@Body() urlLog: any) {
    try {
      this.logger.log(`Force inserting URL: ${urlLog.domain} (${urlLog.browser})`);
      
      // Validate required fields
      if (!urlLog.user_id || !urlLog.time_log_id || !urlLog.site_url) {
        throw new HttpException('Missing required fields', HttpStatus.BAD_REQUEST);
      }

      // Resolve organization_id from user if not provided
      const orgId = await this.resolveOrgId(urlLog.user_id, urlLog.organization_id);

      // Prepare the URL log for insertion
      const urlPayload = {
        user_id: urlLog.user_id,
        time_log_id: urlLog.time_log_id,
        site_url: urlLog.site_url,
        url: urlLog.site_url, // Duplicate for compatibility
        title: urlLog.title || 'Untitled',
        domain: urlLog.domain,
        browser: urlLog.browser,
        timestamp: urlLog.timestamp,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        organization_id: orgId || null
      };

      // Insert into database
      const result = await this.db.query<{ id: string }>(
        `INSERT INTO public.url_logs
          (user_id, time_log_id, site_url, url, title, domain, browser, timestamp, created_at, updated_at, organization_id)
         VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id`,
        [
          urlPayload.user_id,
          urlPayload.time_log_id,
          urlPayload.site_url,
          urlPayload.url,
          urlPayload.title,
          urlPayload.domain,
          urlPayload.browser,
          urlPayload.timestamp,
          urlPayload.created_at,
          urlPayload.updated_at,
          urlPayload.organization_id,
        ],
      );

      this.logger.log(`Successfully inserted URL with ID: ${result.rows[0].id}`);
      
      return {
        success: true,
        message: 'URL inserted successfully',
        id: result.rows[0].id,
        url: urlPayload.site_url,
        domain: urlPayload.domain
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
      if (!appLog.user_id || !appLog.time_log_id || !appLog.app_name) {
        throw new HttpException('Missing required fields', HttpStatus.BAD_REQUEST);
      }

      // Resolve organization_id from user if not provided
      const orgId = await this.resolveOrgId(appLog.user_id, appLog.organization_id);

      // Prepare the app log for insertion
      const appPayload = {
        user_id: appLog.user_id,
        time_log_id: appLog.time_log_id,
        app_name: appLog.app_name,
        window_title: appLog.window_title || 'Unknown',
        app_path: appLog.app_path,
        timestamp: appLog.timestamp,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        organization_id: orgId || null
      };

      // Insert into database
      const result = await this.db.query<{ id: string }>(
        `INSERT INTO public.app_logs
          (user_id, time_log_id, app_name, window_title, app_path, timestamp, created_at, updated_at, organization_id)
         VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id`,
        [
          appPayload.user_id,
          appPayload.time_log_id,
          appPayload.app_name,
          appPayload.window_title,
          appPayload.app_path,
          appPayload.timestamp,
          appPayload.created_at,
          appPayload.updated_at,
          appPayload.organization_id,
        ],
      );

      this.logger.log(`Successfully inserted App with ID: ${result.rows[0].id}`);
      
      return {
        success: true,
        message: 'App inserted successfully',
        id: result.rows[0].id,
        app_name: appPayload.app_name,
        window_title: appPayload.window_title
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
      await this.db.query('SELECT id FROM public.users LIMIT 1');
      await this.db.query('SELECT id FROM public.url_logs LIMIT 1');
      await this.db.query('SELECT id FROM public.app_logs LIMIT 1');

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
          `SELECT id, timestamp, domain
           FROM public.url_logs
           WHERE timestamp >= $1
           ORDER BY timestamp DESC
           LIMIT 10`,
          [oneHourAgo.toISOString()],
        )
      ).rows;

      const recentApps = (
        await this.db.query(
          `SELECT id, timestamp, app_name
           FROM public.app_logs
           WHERE timestamp >= $1
           ORDER BY timestamp DESC
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
        await this.db.query(
          `INSERT INTO public.idle_logs
            (user_id, time_log_id, idle_start, idle_end, idle_duration_seconds, created_at, updated_at, organization_id)
           VALUES ($1,$2,$3,$4,$5,NOW(),NOW(),$6)`,
          [
            log.user_id,
            log.time_log_id || null,
            log.idle_start || log.start_time || new Date().toISOString(),
            log.idle_end || log.end_time || new Date().toISOString(),
            log.idle_duration_seconds || log.idle_seconds || 0,
            await this.resolveOrgId(log.user_id, log.organization_id),
          ],
        );
        return { success: true };
      }
      case 'upsert_time_log': {
        const log = data?.log;
        const payload = log?.data ? { ...log.data, id: log.id || log.data.id } : log;
        if (!payload?.id) throw new HttpException('Missing time log id', HttpStatus.BAD_REQUEST);
        await this.db.query(
          `INSERT INTO public.time_logs
            (id, user_id, project_id, start_time, end_time, status, description, idle_seconds, deducted_seconds, organization_id, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
           ON CONFLICT (id) DO UPDATE SET
             project_id = EXCLUDED.project_id,
             start_time = EXCLUDED.start_time,
             end_time = EXCLUDED.end_time,
             status = EXCLUDED.status,
             description = EXCLUDED.description,
             idle_seconds = EXCLUDED.idle_seconds,
             deducted_seconds = EXCLUDED.deducted_seconds,
             organization_id = EXCLUDED.organization_id,
             updated_at = NOW()`,
          [
            payload.id,
            payload.user_id,
            payload.project_id || null,
            payload.start_time || new Date().toISOString(),
            payload.end_time || null,
            payload.status || 'active',
            payload.description || null,
            payload.idle_seconds || null,
            payload.deducted_seconds || null,
            payload.organization_id || (await this.resolveOrgId(payload.user_id)),
          ],
        );
        return { success: true, id: payload.id };
      }
      case 'update_time_log': {
        const id = data?.id;
        const updates = data?.updates || {};
        if (!id) throw new HttpException('Missing time log id', HttpStatus.BAD_REQUEST);
        await this.db.query(
          `UPDATE public.time_logs
           SET end_time = COALESCE($2, end_time),
               status = COALESCE($3, status),
               idle_seconds = COALESCE($4, idle_seconds),
               deducted_seconds = COALESCE($5, deducted_seconds),
               updated_at = NOW()
           WHERE id = $1`,
          [id, updates.end_time || null, updates.status || null, updates.idle_seconds || null, updates.deducted_seconds || null],
        );
        return { success: true, id };
      }
      case 'create_time_log': {
        const log = data?.log;
        if (!log?.user_id || !log?.start_time) {
          throw new HttpException('Missing user_id or start_time', HttpStatus.BAD_REQUEST);
        }
        const id = log.id || randomUUID();
        const orgId = await this.resolveOrgId(log.user_id, log.organization_id);
        const result = await this.db.query<{
          id: string;
          user_id: string;
          project_id: string | null;
          start_time: string;
          end_time: string | null;
          status: string;
          device_id: string | null;
        }>(
          `INSERT INTO public.time_logs
            (id, user_id, project_id, start_time, end_time, status, is_manual, device_id, organization_id, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
           RETURNING id, user_id, project_id, start_time, end_time, status, device_id`,
          [
            id,
            log.user_id,
            log.project_id || null,
            log.start_time,
            null,
            log.status || 'active',
            log.is_manual ?? false,
            log.device_id || null,
            orgId,
          ],
        );
        return { success: true, time_log: result.rows[0] };
      }
      case 'close_active_sessions': {
        const userId = data?.user_id;
        if (!userId) {
          throw new HttpException('Missing user_id', HttpStatus.BAD_REQUEST);
        }
        const deviceId = data?.device_id || null;
        const now = new Date().toISOString();
        const params: unknown[] = [userId, now];
        let deviceClause = '';
        if (deviceId) {
          params.push(deviceId);
          deviceClause = ` AND device_id = $${params.length}`;
        }
        const result = await this.db.query<{ id: string }>(
          `UPDATE public.time_logs
           SET end_time = $2, status = 'completed', updated_at = NOW()
           WHERE user_id = $1
             AND (end_time IS NULL OR status = 'active')
             ${deviceClause}
           RETURNING id`,
          params,
        );
        return { success: true, closed: result.rowCount ?? result.rows.length };
      }
      case 'get_active_time_log': {
        const userId = data?.user_id;
        if (!userId) {
          throw new HttpException('Missing user_id', HttpStatus.BAD_REQUEST);
        }
        const deviceId = data?.device_id || null;
        const params: unknown[] = [userId];
        let deviceClause = '';
        if (deviceId) {
          params.push(deviceId);
          deviceClause = ` AND device_id = $${params.length}`;
        }
        const result = await this.db.query(
          `SELECT id, user_id, project_id, start_time, end_time, status, device_id
           FROM public.time_logs
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
        }>(
          `SELECT id, start_time, end_time
           FROM public.time_logs
           WHERE user_id = $1
             AND start_time >= $2
             AND start_time < $3
           ORDER BY start_time DESC`,
          [userId, startOfDay, endOfDay],
        );
        return { success: true, time_logs: result.rows };
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
        const orgId = await this.resolveOrgId(userId, data?.organization_id);
        const s3Key = buildScreenshotS3Key({
          prefix: this.s3.getScreenshotsPrefix(),
          capturedAt,
          organizationId: orgId,
          userId,
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
        const params: unknown[] = [userId];
        if (start) {
          params.push(start);
          filters.push(`s.captured_at >= $${params.length}`);
        }
        if (end) {
          params.push(end);
          filters.push(`s.captured_at <= $${params.length}`);
        }
        const result = await this.db.query(
          `SELECT s.id, s.user_id, s.time_log_id, s.s3_key, s.file_path, s.file_size,
                  s.captured_at, s.activity_percent, s.focus_percent, s.mouse_clicks,
                  s.keystrokes, s.mouse_movements, s.app_name, s.window_title,
                  s.is_duplicate, s.duplicate_reason, s.duplicate_group_hash
           FROM public.screenshots s
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
        const orgId = await this.resolveOrgId(userId, meta.organization_id);
        const timeLogId = await this.resolveTimeLogId(meta.time_log_id);
        const insert = await this.db.query<{ id: string }>(
          `INSERT INTO public.screenshots
            (id, user_id, time_log_id, image_url, file_path, file_size, s3_key, captured_at,
             activity_percent, focus_percent, mouse_clicks, keystrokes, mouse_movements,
             app_name, window_title, agent_version, perceptual_hash, needs_vision_validation, organization_id)
           VALUES ($1,$2,$3,NULL,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
           ON CONFLICT (id) DO UPDATE SET
             s3_key = EXCLUDED.s3_key,
             file_path = EXCLUDED.file_path,
             file_size = EXCLUDED.file_size,
             captured_at = EXCLUDED.captured_at,
             time_log_id = COALESCE(EXCLUDED.time_log_id, screenshots.time_log_id)
           RETURNING id`,
          [
            screenshotId,
            userId,
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
            meta.perceptual_hash || null,
            meta.needs_vision_validation !== false,
            orgId,
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
