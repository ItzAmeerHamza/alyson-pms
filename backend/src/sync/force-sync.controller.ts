import { Controller, Post, Body, HttpStatus, HttpException, Logger, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { randomUUID } from 'crypto';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { DatabaseService } from '../database/database.service';
import { S3Service } from '../common/s3.service';
import { ScreenshotAiBackfillService } from '../screenshot-ai/screenshot-ai-backfill.service';
import { EffectiveTimeService } from '../pulse/effective-time.service';
import { buildScreenshotS3Key } from '../lib/screenshot-s3-key';
import { buildLogS3Key } from '../lib/log-s3-key';
import {
  parseTenantUserId as parseTenantUserIdStrict,
  parseWorkspaceId,
} from '../database/time-doctor-sql';
import {
  endOfWorkDayExclusiveIso,
  normalizeWorkTimezone,
  startOfWorkDayIso,
} from '../lib/work-timezone';

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

  /**
   * Last moment a session can be proven to have been alive, for `time_logs t`.
   *
   * last_alive_at is the dead-man's switch and is normally the answer, but
   * agents on older builds never stamp it. Closing those at COALESCE(.., start)
   * would collapse real work to a zero-length session, so this falls back to the
   * same evidence migration 022 backfilled from. Bounded by NOW() so a bad
   * ended_at in a log row cannot push a session into the future.
   */
  private static readonly LAST_PROOF_OF_LIFE_SQL = `LEAST(
    NOW(),
    GREATEST(
      t.start_time,
      COALESCE(t.last_alive_at, t.start_time),
      COALESCE((SELECT MAX(h.seen_at) FROM time_doctor.session_heartbeats h
                 WHERE h.time_log_id = t.id), t.start_time),
      COALESCE((SELECT MAX(s.captured_at) FROM time_doctor.screenshots s
                 WHERE s.time_log_id = t.id), t.start_time),
      COALESCE((SELECT MAX(COALESCE(a.ended_at, a.started_at, a.timestamp))
                 FROM time_doctor.app_logs a WHERE a.time_log_id = t.id), t.start_time),
      COALESCE((SELECT MAX(COALESCE(u.ended_at, u.started_at))
                 FROM time_doctor.url_logs u WHERE u.time_log_id = t.id), t.start_time)
    )
  )`;
  constructor(
    private readonly db: DatabaseService,
    private readonly s3: S3Service,
    private readonly screenshotAi: ScreenshotAiBackfillService,
    private readonly effectiveTime: EffectiveTimeService,
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

  /** Cap on time deducted per deleted screenshot — mirrors the desktop agent. */
  private static readonly MAX_SCREENSHOT_DEDUCTION_SECONDS = 240;

  /**
   * Midpoint deduction: a screenshot "owns" the interval from midpoint(prev, this) to
   * midpoint(this, next), clamped to the session window and capped. Mirrors the desktop
   * agent's screenshot-deletion util so estimates match on both platforms.
   */
  private async computeScreenshotDeductionSeconds(screenshot: {
    id: string;
    time_log_id: string | null;
    captured_at: string;
  }): Promise<number> {
    const MAX = ForceSyncController.MAX_SCREENSHOT_DEDUCTION_SECONDS;
    if (!screenshot.time_log_id) return Math.min(200, MAX);

    const tl = await this.db.query<{ start_time: string; end_time: string | null }>(
      'SELECT start_time, end_time FROM time_doctor.time_logs WHERE id = $1 LIMIT 1',
      [screenshot.time_log_id],
    );
    const timeLog = tl.rows[0];
    if (!timeLog) return Math.min(200, MAX);

    const neighbors = await this.db.query<{ captured_at: string }>(
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

  /** Fetch a screenshot for deletion/estimation and verify ownership when a user is provided. */
  private async loadOwnedScreenshot(
    screenshotId: unknown,
    userId: unknown,
  ): Promise<{
    id: string;
    user_id: number;
    time_log_id: string | null;
    s3_key: string | null;
    file_path: string | null;
    captured_at: string;
  }> {
    if (!screenshotId || typeof screenshotId !== 'string') {
      throw new HttpException('Missing screenshot_id', HttpStatus.BAD_REQUEST);
    }
    const result = await this.db.query<{
      id: string;
      user_id: number;
      time_log_id: string | null;
      s3_key: string | null;
      file_path: string | null;
      captured_at: string;
    }>(
      `SELECT id, user_id, time_log_id, s3_key, file_path, captured_at
       FROM time_doctor.screenshots WHERE id = $1 LIMIT 1`,
      [screenshotId],
    );
    const screenshot = result.rows[0];
    if (!screenshot) {
      throw new HttpException('Screenshot not found', HttpStatus.NOT_FOUND);
    }
    if (userId != null && String(userId).trim() !== '') {
      const requester = parseUserIdParam(userId);
      if (screenshot.user_id !== requester) {
        throw new HttpException(
          'Access denied: can only modify your own screenshots',
          HttpStatus.FORBIDDEN,
        );
      }
    }
    return screenshot;
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

  /**
   * Where an open session ends, and how long ago it went quiet.
   *
   * last_alive_at is the answer — the agent stamps it every 10s while alive, so
   * there is nothing to infer. Heartbeats are read only as a fallback for agents
   * older than that change; the 022 backfill already seeded last_alive_at for them.
   */
  private async inspectSessionLiveness(
    timeLogId: string,
    startTimeIso: string,
    clientLastSeenAt?: string | null,
  ): Promise<{
    last_heartbeat_at: string | null;
    client_checkpoint_at: string | null;
    suggested_end_at: string;
    age_seconds: number | null;
  }> {
    const result = await this.db.query<{
      last_alive_at: Date | string | null;
      heartbeat_at: Date | string | null;
    }>(
      `SELECT t.last_alive_at,
              (SELECT MAX(h.seen_at) FROM time_doctor.session_heartbeats h
                WHERE h.time_log_id = t.id) AS heartbeat_at
       FROM time_doctor.time_logs t WHERE t.id = $1`,
      [timeLogId],
    );
    const row = result.rows[0] || {};
    const toMs = (raw: unknown): number | null => {
      if (raw == null) return null;
      const ms = new Date(raw as string | Date).getTime();
      return Number.isFinite(ms) ? ms : null;
    };
    const startMs = toMs(startTimeIso) ?? Date.now();
    const heartbeatMs = toMs(row.heartbeat_at);
    const clientMs = toMs(clientLastSeenAt);
    const aliveMs = Math.max(
      toMs(row.last_alive_at) ?? 0,
      heartbeatMs ?? 0,
      clientMs ?? 0,
      startMs,
    );
    const ageSeconds = Math.max(0, Math.round((Date.now() - aliveMs) / 1000));

    return {
      last_heartbeat_at: heartbeatMs != null ? new Date(heartbeatMs).toISOString() : null,
      client_checkpoint_at: clientMs != null ? new Date(clientMs).toISOString() : null,
      suggested_end_at: new Date(Math.max(aliveMs, startMs + 30_000)).toISOString(),
      age_seconds: ageSeconds,
    };
  }

  private async flagStaleSession(
    timeLogId: string,
    meta: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO time_doctor.time_log_events
          (user_id, time_log_id, workspace_id, action, source, device_id, meta, shortened)
         SELECT t.user_id, t.id, t.workspace_id, 'stale_session_flagged', 'inspect_open_sessions',
                t.device_id, $2::jsonb, FALSE
         FROM time_doctor.time_logs t
         WHERE t.id = $1`,
        [timeLogId, JSON.stringify({ reason: 'stale_session_flagged', ...meta })],
      );
    } catch (err) {
      this.logger.warn(
        `stale_session_flagged event insert failed for ${timeLogId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Close one open session at a durable suggested end (heartbeat / checkpoint /
   * evidence). Never uses wall-clock NOW.
   */
  private async closeOpenSessionAtSuggestedEnd(
    timeLogId: string,
    userId: number,
    endTimeIso: string,
    reason: string,
    meta: Record<string, unknown> = {},
  ): Promise<boolean> {
    const updated = await this.db.query<{ id: string }>(
      `UPDATE time_doctor.time_logs t
       SET end_time = GREATEST(
             COALESCE(t.end_time, t.start_time),
             COALESCE(t.last_alive_at, t.start_time),
             LEAST($2::timestamptz, NOW())
           ),
           status = 'auto_closed',
           updated_at = NOW()
       WHERE t.id = $1
         AND t.user_id = $3
         AND t.end_time IS NULL
       RETURNING t.id`,
      [timeLogId, endTimeIso, userId],
    );
    if (!updated.rows[0]) return false;
    try {
      await this.db.query(
        `INSERT INTO time_doctor.time_log_events
          (user_id, time_log_id, workspace_id, action, source, device_id, meta,
           new_end_time, new_status, shortened)
         SELECT t.user_id, t.id, t.workspace_id, $2, 'closed_at_last_alive',
                t.device_id, $3::jsonb, t.end_time, t.status, TRUE
         FROM time_doctor.time_logs t WHERE t.id = $1`,
        [timeLogId, reason, JSON.stringify({ confirmed_end: endTimeIso, ...meta })],
      );
    } catch (_) {
      /* audit is best-effort */
    }
    return true;
  }

  /**
   * Inspect open sessions. Recover if fresh.
   * Stale (no heartbeat/evidence/checkpoint within freshness) is closed at
   * last heartbeat — not flagged-only, and never at wall-clock NOW.
   */
  private async inspectOpenSessionsInternal(opts: {
    userId: number;
    deviceId?: string | null;
    clientLastSeenAt?: string | null;
    freshnessMinutes: number;
    preferRecover: boolean;
    flagStale: boolean;
  }): Promise<{
    success: true;
    recovered: Record<string, unknown> | null;
    flagged: Array<Record<string, unknown>>;
    flagged_count: number;
    open: Array<Record<string, unknown>>;
    closed: Array<Record<string, unknown>>;
    closed_count: number;
  }> {
    const params: unknown[] = [opts.userId];
    let deviceClause = '';
    if (opts.deviceId) {
      params.push(opts.deviceId);
      deviceClause = ` AND device_id = $${params.length}`;
    }

    const openRows = await this.db.query<{
      id: string;
      user_id: number;
      project_id: string | null;
      workspace_id: number | null;
      start_time: Date | string;
      status: string;
      device_id: string | null;
      idle_seconds: number;
      deducted_seconds: number;
    }>(
      `SELECT id, user_id, project_id, workspace_id, start_time, status, device_id,
              idle_seconds, deducted_seconds
       FROM time_doctor.time_logs
       WHERE user_id = $1
         AND end_time IS NULL
         ${deviceClause}
       ORDER BY start_time DESC`,
      params,
    );

    const freshnessMs = opts.freshnessMinutes * 60_000;
    const flagged: Array<Record<string, unknown>> = [];
    const open: Array<Record<string, unknown>> = [];
    const closed: Array<Record<string, unknown>> = [];
    let recovered: Record<string, unknown> | null = null;

    for (const row of openRows.rows) {
      const startIso = new Date(row.start_time).toISOString();
      const live = await this.inspectSessionLiveness(row.id, startIso, opts.clientLastSeenAt);
      const ageMs = (live.age_seconds ?? 0) * 1000;
      const isFresh = live.age_seconds != null && ageMs <= freshnessMs;
      const base = {
        id: row.id,
        user_id: String(row.user_id),
        project_id: row.project_id,
        workspace_id: row.workspace_id,
        start_time: startIso,
        status: row.status,
        device_id: row.device_id,
        idle_seconds: row.idle_seconds,
        deducted_seconds: row.deducted_seconds,
        ...live,
        is_fresh: isFresh,
      };
      open.push(base);

      if (opts.preferRecover && isFresh && !recovered) {
        recovered = base;
        this.logger.log(
          `inspect_open_sessions: recover ${row.id} ageSec=${live.age_seconds}`,
        );
        continue;
      }

      if (!isFresh) {
        const didClose = await this.closeOpenSessionAtSuggestedEnd(
          row.id,
          opts.userId,
          live.suggested_end_at,
          'closed_at_last_alive',
          {
            age_seconds: live.age_seconds,
            last_heartbeat_at: live.last_heartbeat_at,
            client_checkpoint_at: live.client_checkpoint_at,
          },
        );
        if (didClose) {
          closed.push({ ...base, end_time: live.suggested_end_at, status: 'auto_closed' });
          this.logger.log(
            `inspect_open_sessions: auto-closed stale ${row.id} at ${live.suggested_end_at} (last_alive) ageSec=${live.age_seconds}`,
          );
        } else if (opts.flagStale) {
          await this.flagStaleSession(row.id, {
            age_seconds: live.age_seconds,
            last_heartbeat_at: live.last_heartbeat_at,
            suggested_end_at: live.suggested_end_at,
            note: 'Stale close did not mutate — session may already be closed',
          });
          flagged.push(base);
        }
      }
    }

    return {
      success: true,
      recovered,
      flagged,
      flagged_count: flagged.length,
      open,
      closed,
      closed_count: closed.length,
    };
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
      const siteUrl = String(urlLog.site_url).trim();
      const title = urlLog.title || 'Untitled';

      // Same continuous visit: keep the open row — do not close+reinsert.
      const existing = await this.db.query<{ id: string }>(
        `SELECT id FROM time_doctor.url_logs
          WHERE user_id = $1
            AND ended_at IS NULL
            AND site_url = $2
          ORDER BY started_at DESC
          LIMIT 1`,
        [userId, siteUrl],
      );
      if (existing.rows[0]?.id) {
        await this.db.query(
          `UPDATE time_doctor.url_logs
              SET title = COALESCE(NULLIF($2, ''), title),
                  domain = COALESCE(NULLIF($3, ''), domain),
                  browser = COALESCE(NULLIF($4, ''), browser),
                  time_log_id = COALESCE($5, time_log_id)
            WHERE id = $1`,
          [existing.rows[0].id, title, urlLog.domain || null, urlLog.browser || null, timeLogId],
        );
        this.logger.log(`Skipped duplicate URL insert (already open): ${existing.rows[0].id}`);
        return {
          success: true,
          skipped: true,
          reason: 'already_open',
          message: 'URL already open — not re-inserted',
          id: existing.rows[0].id,
          url: siteUrl,
          domain: urlLog.domain,
        };
      }

      // Different URL: close other open visits, then insert once.
      await this.db.query(
        `UPDATE time_doctor.url_logs
            SET ended_at = GREATEST(started_at, $1::timestamptz)
          WHERE user_id = $2
            AND ended_at IS NULL
            AND site_url IS DISTINCT FROM $3
            AND started_at <= $1::timestamptz`,
        [startedAt, userId, siteUrl],
      );

      const result = await this.db.query<{ id: string }>(
        `INSERT INTO time_doctor.url_logs
          (user_id, time_log_id, site_url, title, domain, browser, started_at, workspace_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id`,
        [
          userId,
          timeLogId,
          siteUrl,
          title,
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
        url: siteUrl,
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
      const appName = String(appLog.app_name).trim();
      const windowTitle = appLog.window_title || 'Unknown';

      // Same continuous app focus: keep open row — do not close+reinsert.
      const existing = await this.db.query<{ id: string }>(
        `SELECT id FROM time_doctor.app_logs
          WHERE user_id = $1
            AND ended_at IS NULL
            AND lower(app_name) = lower($2)
          ORDER BY started_at DESC
          LIMIT 1`,
        [userId, appName],
      );
      if (existing.rows[0]?.id) {
        await this.db.query(
          `UPDATE time_doctor.app_logs
              SET window_title = COALESCE(NULLIF($2, ''), window_title),
                  time_log_id = COALESCE($3, time_log_id)
            WHERE id = $1`,
          [existing.rows[0].id, windowTitle, timeLogId],
        );
        this.logger.log(`Skipped duplicate app insert (already open): ${existing.rows[0].id}`);
        return {
          success: true,
          skipped: true,
          reason: 'already_open',
          message: 'App already open — not re-inserted',
          id: existing.rows[0].id,
          app_name: appName,
          window_title: windowTitle,
        };
      }

      // Different app: close other open focuses, then insert once.
      await this.db.query(
        `UPDATE time_doctor.app_logs
            SET ended_at = GREATEST(started_at, $1::timestamptz)
          WHERE user_id = $2
            AND ended_at IS NULL
            AND lower(app_name) IS DISTINCT FROM lower($3)
            AND started_at <= $1::timestamptz`,
        [startedAt, userId, appName],
      );

      const result = await this.db.query<{ id: string }>(
        `INSERT INTO time_doctor.app_logs
          (user_id, time_log_id, app_name, window_title, started_at, timestamp, workspace_id)
         VALUES ($1,$2,$3,$4,$5,$5,$6)
         RETURNING id`,
        [
          userId,
          timeLogId,
          appName,
          windowTitle,
          startedAt,
          workspaceId,
        ],
      );

      this.logger.log(`Successfully inserted App with ID: ${result.rows[0].id}`);
      
      return {
        success: true,
        message: 'App inserted successfully',
        id: result.rows[0].id,
        app_name: appName,
        window_title: windowTitle,
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
        const ids: string[] = [];
        let inserted = 0;
        let skipped = 0;
        for (const log of logs) {
          const result = await this.forceAppInsert(log);
          if (result?.id) ids.push(result.id);
          if (result?.skipped) skipped += 1;
          else inserted += 1;
        }
        return { success: true, inserted, skipped, ids };
      }
      case 'insert_url_logs': {
        const logs = Array.isArray(data?.logs) ? data.logs : [];
        const ids: string[] = [];
        let inserted = 0;
        let skipped = 0;
        for (const log of logs) {
          const result = await this.forceUrlInsert(log);
          if (result?.id) ids.push(result.id);
          if (result?.skipped) skipped += 1;
          else inserted += 1;
        }
        return { success: true, inserted, skipped, ids };
      }
      case 'close_open_app_logs': {
        // Session model: close open app focus rows (no per-minute snapshots).
        const userId = parseUserIdParam(data?.user_id);
        const endedAt = data?.ended_at || new Date().toISOString();
        const appName = typeof data?.app_name === 'string' ? data.app_name.trim() : null;
        const params: any[] = [endedAt, userId];
        let sql = `
          UPDATE time_doctor.app_logs
             SET ended_at = GREATEST(started_at, $1::timestamptz)
           WHERE user_id = $2
             AND ended_at IS NULL
             AND started_at <= $1::timestamptz`;
        if (appName) {
          params.push(appName);
          sql += ` AND app_name = $${params.length}`;
        }
        const result = await this.db.query(sql, params);
        this.logger.log(
          `close_open_app_logs: user=${userId} closed=${result.rowCount ?? 0} app=${appName || '*'}`,
        );
        return { success: true, closed: result.rowCount ?? 0 };
      }
      case 'close_open_url_logs': {
        // Session model: close open URL visit rows.
        const userId = parseUserIdParam(data?.user_id);
        const endedAt = data?.ended_at || new Date().toISOString();
        const siteUrl = typeof data?.site_url === 'string' ? data.site_url.trim() : null;
        const params: any[] = [endedAt, userId];
        let sql = `
          UPDATE time_doctor.url_logs
             SET ended_at = GREATEST(started_at, $1::timestamptz)
           WHERE user_id = $2
             AND ended_at IS NULL
             AND started_at <= $1::timestamptz`;
        if (siteUrl) {
          params.push(siteUrl);
          sql += ` AND site_url = $${params.length}`;
        }
        const result = await this.db.query(sql, params);
        this.logger.log(
          `close_open_url_logs: user=${userId} closed=${result.rowCount ?? 0} url=${siteUrl || '*'}`,
        );
        return { success: true, closed: result.rowCount ?? 0 };
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
        const newStart = payload.start_time || new Date().toISOString();

        // A person cannot be in two sessions at once. Enforce that here, at the
        // only point every client must pass through, rather than trusting the
        // agent to have closed its previous session first.
        //
        // It does not reliably do so: Start waits 8s for a pending Stop while the
        // Stop's own backend call times out at 12s, so on a slow link the agent
        // opens a new session while the old one is still live. Reports sum
        // session durations, so each overlapping second is billed twice — 15.33
        // phantom hours across two days, concentrated in the users whose network
        // made their stops slow.
        //
        // The new session's start is the strongest possible proof the previous
        // one had ended. Same device only, so a second machine is untouched, and
        // GREATEST keeps a session from being pushed before its own start.
        // Only a session that is actually beginning proves the previous one
        // ended. The offline queue replays finished sessions with a historical
        // start_time, and treating one of those as "a new session started" would
        // close a currently-live session at that stale timestamp — turning a
        // sync into lost tracked time.
        const isLiveStart = !payload.end_time;
        if (payload.device_id && isLiveStart) {
          const closed = await this.db.query<{ id: string }>(
            `UPDATE time_doctor.time_logs t
             SET end_time = GREATEST(t.start_time, LEAST($3::timestamptz, NOW())),
                 status = 'auto_closed',
                 updated_at = NOW()
             WHERE t.user_id = $1
               AND t.device_id = $2
               AND t.end_time IS NULL
               AND t.id <> $4
               AND t.start_time <= $3::timestamptz
             RETURNING t.id`,
            [userId, payload.device_id, newStart, payload.id],
          );
          if (closed.rowCount > 0) {
            this.logger.warn(
              `Closed ${closed.rowCount} still-open session(s) for user ${userId} device ${payload.device_id} at ${newStart} (new session ${payload.id})`,
            );
          }
        }

        // PAYROLL CRITICAL: never shorten duration on upsert.
        // start_time only moves earlier; end_time only moves later (or stays).
        await this.db.query(
          `INSERT INTO time_doctor.time_logs
            (id, user_id, project_id, start_time, end_time, status, idle_seconds, deducted_seconds, workspace_id, device_id, agent_version, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
           ON CONFLICT (id) DO UPDATE SET
             project_id = COALESCE(EXCLUDED.project_id, time_doctor.time_logs.project_id),
             start_time = LEAST(time_doctor.time_logs.start_time, EXCLUDED.start_time),
             end_time = CASE
               WHEN EXCLUDED.end_time IS NULL THEN time_doctor.time_logs.end_time
               WHEN time_doctor.time_logs.end_time IS NULL THEN EXCLUDED.end_time
               ELSE GREATEST(time_doctor.time_logs.end_time, EXCLUDED.end_time)
             END,
             status = CASE
               WHEN EXCLUDED.status = 'completed' OR time_doctor.time_logs.status = 'completed'
                 THEN 'completed'
               ELSE COALESCE(EXCLUDED.status, time_doctor.time_logs.status)
             END,
             idle_seconds = GREATEST(
               COALESCE(time_doctor.time_logs.idle_seconds, 0),
               COALESCE(EXCLUDED.idle_seconds, 0)
             ),
             deducted_seconds = GREATEST(
               COALESCE(time_doctor.time_logs.deducted_seconds, 0),
               COALESCE(EXCLUDED.deducted_seconds, 0)
             ),
             workspace_id = COALESCE(EXCLUDED.workspace_id, time_doctor.time_logs.workspace_id),
             device_id = COALESCE(EXCLUDED.device_id, time_doctor.time_logs.device_id),
             agent_version = COALESCE(EXCLUDED.agent_version, time_doctor.time_logs.agent_version),
             updated_at = NOW()`,
          [
            payload.id,
            userId,
            projectId,
            newStart,
            payload.end_time || null,
            payload.status || 'active',
            payload.idle_seconds ?? 0,
            payload.deducted_seconds ?? 0,
            workspaceId,
            payload.device_id || null,
            payload.agent_version ? String(payload.agent_version).slice(0, 64) : null,
          ],
        );
        return { success: true, id: payload.id };
      }
      case 'update_time_log': {
        const id = data?.id;
        const updates = data?.updates || {};
        if (!id) throw new HttpException('Missing time log id', HttpStatus.BAD_REQUEST);
        const clientEnd = updates.end_time || null;
        const authorizedIdleCut = updates.authorized_idle_cut === true;
        // The agent computes this end while it is alive, so it is taken at face
        // value, bounded by the row's own start and last proof-of-life.
        // The floor is last_alive_at rather than a fixed interval: a client end
        // that precedes the start is garbage, and padding it to a constant
        // fabricates work. last_alive_at is the last moment we know the session
        // existed, so it is the only defensible answer.
        const proposedEnd = `GREATEST(t.start_time, COALESCE(t.last_alive_at, t.start_time), LEAST($2::timestamptz, NOW()))`;
        // Re-opening an already-completed row is retroactive: the agent is no
        // longer living that session, so its clock is not evidence about it.
        // Offline/pending recovery still needs to extend a premature short
        // close, but only as far as the session can be PROVEN to have been
        // alive. Capped only by NOW(), a write carrying the current time
        // extended sessions that had been cleanly closed hours earlier — one by
        // 4.69h, having genuinely run 91 seconds.
        //
        // GREATEST keeps this from shortening: proof-of-life below the stored
        // end leaves the row untouched (shortening has its own path). Postgres
        // evaluates SET expressions against the pre-update row, so the
        // last_alive_at written below cannot widen this cap for its own write.
        const provenExtension = `GREATEST(t.end_time, LEAST(${proposedEnd}, ${ForceSyncController.LAST_PROOF_OF_LIFE_SQL}))`;
        // authorized_idle_cut: the alert timeout cut (now − 10m) while completing.
        const endTimeSql = authorizedIdleCut
          ? `CASE
                 WHEN $2::timestamptz IS NULL THEN t.end_time
                 ELSE ${proposedEnd}
               END`
          : `CASE
                 WHEN $2::timestamptz IS NULL THEN t.end_time
                 -- Live stop: the agent is running this session right now, so
                 -- the request itself is the proof. Capping at the last 10s
                 -- checkpoint here would shave time off every honest stop.
                 WHEN t.end_time IS NULL THEN ${proposedEnd}
                 ELSE ${provenExtension}
               END`;
        const result = await this.db.query<{ id: string; end_time: Date | string | null }>(
          `UPDATE time_doctor.time_logs t
           SET end_time = ${endTimeSql},
               status = CASE
                 WHEN $3::text = 'completed' OR t.status = 'completed' THEN 'completed'
                 ELSE COALESCE($3, t.status)
               END,
               idle_seconds = GREATEST(COALESCE(t.idle_seconds, 0), COALESCE($4, 0)),
               deducted_seconds = GREATEST(COALESCE(t.deducted_seconds, 0), COALESCE($5, 0)),
               -- Dead-man's switch: monotonic, never in the future, and frozen
               -- once the session is over. A completed session is not alive, so
               -- a late checkpoint from an agent still holding a stale id must
               -- not advance it — proposedEnd reads last_alive_at, so letting it
               -- creep forward on a finished row drags end_time along with it.
               -- t.end_time here is the pre-update value, so a live stop that
               -- completes the row in this same statement still records its own.
               last_alive_at = CASE
                 WHEN t.end_time IS NOT NULL THEN t.last_alive_at
                 ELSE GREATEST(
                   COALESCE(t.last_alive_at, t.start_time),
                   LEAST(COALESCE($6::timestamptz, t.last_alive_at, t.start_time), NOW())
                 )
               END,
               updated_at = NOW()
           WHERE t.id = $1
           RETURNING t.id, t.end_time`,
          [
            id,
            clientEnd,
            updates.status || null,
            updates.idle_seconds ?? null,
            updates.deducted_seconds ?? null,
            updates.last_alive_at || data?.last_alive_at || null,
          ],
        );
        const rowCount = Number(result?.rowCount || 0);
        if (rowCount === 0) {
          // Caller must fall back to create — pretending success drops offline hours.
          return { success: false, id, updated: 0, reason: 'no_row' };
        }
        return { success: true, id, updated: rowCount, end_time: result.rows[0]?.end_time ?? null };
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
        // Idempotent: client retries after RDS/API timeout must not insert a second row
        // or fail forever. Same id → return existing row (preserve completed end_time).
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
           ON CONFLICT (id) DO UPDATE SET
             updated_at = NOW(),
             end_time = CASE
               WHEN EXCLUDED.end_time IS NULL THEN time_doctor.time_logs.end_time
               WHEN time_doctor.time_logs.end_time IS NULL THEN EXCLUDED.end_time
               ELSE GREATEST(time_doctor.time_logs.end_time, EXCLUDED.end_time)
             END,
             status = CASE
               WHEN time_doctor.time_logs.status = 'completed' THEN 'completed'
               WHEN EXCLUDED.status = 'completed' THEN 'completed'
               ELSE COALESCE(EXCLUDED.status, time_doctor.time_logs.status)
             END
           RETURNING id, user_id, project_id, start_time, end_time, status, device_id`,
          [
            id,
            userId,
            projectId,
            log.start_time,
            log.end_time || null,
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

        // KILL ALL: stop / lid-close / quit. Every open row is closed at ITS OWN
        // last proof-of-life, so one caller's stop time is never stamped onto a
        // session that died hours earlier. Needs no confirmation because it can
        // only ever shorten — there is no caller-supplied end to inflate with.
        if (data?.close_at_own_liveness === true) {
          const p: unknown[] = [uid];
          let devClause = '';
          if (deviceId) {
            p.push(deviceId);
            devClause = ` AND t.device_id = $${p.length}`;
          }
          const killed = await this.db.query<{ id: string; end_time: Date | string }>(
            `UPDATE time_doctor.time_logs t
             SET end_time = ${ForceSyncController.LAST_PROOF_OF_LIFE_SQL},
                 status = 'completed',
                 updated_at = NOW()
             WHERE t.user_id = $1
               AND t.end_time IS NULL
               ${devClause}
             RETURNING t.id AS id, t.end_time`,
            p,
          );
          for (const r of killed.rows) {
            try {
              await this.db.query(
                `INSERT INTO time_doctor.time_log_events
                  (user_id, time_log_id, workspace_id, action, source, device_id, meta,
                   new_end_time, new_status, shortened)
                 SELECT t.user_id, t.id, t.workspace_id, 'closed_at_own_liveness', $2,
                        t.device_id, $3::jsonb, t.end_time, t.status, TRUE
                 FROM time_doctor.time_logs t WHERE t.id = $1`,
                [
                  r.id,
                  data?.reason ? String(data.reason).slice(0, 64) : 'kill_all',
                  JSON.stringify({ closed_at: 'last_alive_at' }),
                ],
              );
            } catch (_) {
              /* audit is best-effort */
            }
          }
          this.logger.log(
            `close_at_own_liveness: killed ${killed.rowCount} session(s) for user ${uid}${deviceId ? ` device ${deviceId}` : ' (ALL DEVICES)'}`,
          );
          return {
            success: true,
            closed: killed.rowCount ?? killed.rows.length,
            closed_ids: killed.rows.map((r) => r.id),
            reason: 'closed_at_own_liveness',
          };
        }

        // Without an explicit end_time: inspect. Stale rows close at last heartbeat.
        if (!explicitEnd) {
          return this.inspectOpenSessionsInternal({
            userId: uid,
            deviceId,
            clientLastSeenAt: data?.client_last_seen_at || null,
            freshnessMinutes: Math.max(5, Number(data?.freshness_minutes) || 15),
            preferRecover: data?.prefer_recover === true,
            flagStale: true,
          });
        }

        // Mutating close requires confirmation (local durable checkpoint or admin),
        // OR allow_unconfirmed_end for intentional desktop stop cleanup with a known end.
        const confirmed =
          data?.confirm_with_local_checkpoint === true ||
          data?.admin_confirmed === true ||
          data?.allow_unconfirmed_end === true;
        if (!confirmed) {
          throw new HttpException(
            'Closing open sessions with end_time requires confirm_with_local_checkpoint, admin_confirmed, or allow_unconfirmed_end',
            HttpStatus.BAD_REQUEST,
          );
        }

        const closeReason =
          data?.admin_confirmed === true
            ? 'admin_confirmed_close'
            : data?.confirm_with_local_checkpoint === true
              ? 'local_checkpoint_confirmed_close'
              : 'confirmed_close';
        const status =
          data?.admin_confirmed === true || data?.confirm_with_local_checkpoint === true
            ? 'auto_closed'
            : 'completed';

        const params: unknown[] = [uid];
        let deviceClause = '';
        if (deviceId) {
          params.push(deviceId);
          deviceClause = ` AND t.device_id = $${params.length}`;
        }
        params.push(explicitEnd);
        params.push(status);
        // Per row, take whichever is later: the caller's end, or that row's own
        // last_alive_at. One session's stop time can therefore never shorten a
        // different session that was alive later.
        const closeResult = await this.db.query<{ id: string; end_time: Date | string }>(
          `UPDATE time_doctor.time_logs t
           SET end_time = GREATEST(
                 ${ForceSyncController.LAST_PROOF_OF_LIFE_SQL},
                 LEAST($${params.length - 1}::timestamptz, NOW())
               ),
               status = $${params.length},
               updated_at = NOW()
           WHERE t.user_id = $1
             AND t.end_time IS NULL
             ${deviceClause}
           RETURNING t.id AS id, t.end_time`,
          params,
        );
        for (const row of closeResult.rows) {
          try {
            await this.db.query(
              `INSERT INTO time_doctor.time_log_events
                (user_id, time_log_id, workspace_id, action, source, device_id, meta,
                 new_end_time, new_status, shortened)
               SELECT t.user_id, t.id, t.workspace_id, $2, 'confirmed_session_close',
                      t.device_id, $3::jsonb, t.end_time, t.status, TRUE
               FROM time_doctor.time_logs t WHERE t.id = $1`,
              [
                row.id,
                closeReason,
                JSON.stringify({
                  confirmed_end: explicitEnd,
                  confirm_with_local_checkpoint: !!data?.confirm_with_local_checkpoint,
                  admin_confirmed: !!data?.admin_confirmed,
                  allow_unconfirmed_end: !!data?.allow_unconfirmed_end,
                }),
              ],
            );
          } catch (_) {
            /* ignore audit failure */
          }
        }
        return {
          success: true,
          closed: closeResult.rowCount ?? closeResult.rows.length,
          closed_ids: closeResult.rows.map((r) => r.id),
          reason: closeReason,
        };
      }
      case 'inspect_open_sessions':
      case 'reconcile_open_sessions': {
        // Alias kept for older desktop builds. Stale rows close at last heartbeat.
        const userId = data?.user_id;
        if (!userId) {
          throw new HttpException('Missing user_id', HttpStatus.BAD_REQUEST);
        }
        return this.inspectOpenSessionsInternal({
          userId: parseUserIdParam(userId),
          deviceId: data?.device_id || null,
          clientLastSeenAt: data?.client_last_seen_at || null,
          freshnessMinutes: Math.max(5, Number(data?.freshness_minutes) || 15),
          preferRecover: data?.prefer_recover !== false,
          flagStale: data?.flag_stale !== false,
        });
      }
      case 'confirm_stale_session_close': {
        // Employee/admin confirmation with an explicit end_time (local checkpoint or chosen).
        const userId = parseUserIdParam(data?.user_id);
        const timeLogId = await this.resolveTimeLogId(data?.time_log_id);
        const endTime = data?.end_time;
        if (!timeLogId || !endTime) {
          throw new HttpException('Missing time_log_id or end_time', HttpStatus.BAD_REQUEST);
        }
        if (data?.confirm_with_local_checkpoint !== true && data?.admin_confirmed !== true) {
          throw new HttpException(
            'confirm_with_local_checkpoint or admin_confirmed required',
            HttpStatus.BAD_REQUEST,
          );
        }
        const endMs = new Date(endTime).getTime();
        if (!Number.isFinite(endMs)) {
          throw new HttpException('Invalid end_time', HttpStatus.BAD_REQUEST);
        }
        const status =
          data?.admin_confirmed === true || data?.confirm_with_local_checkpoint === true
            ? 'auto_closed'
            : 'completed';
        const reason =
          data?.admin_confirmed === true
            ? 'admin_confirmed_close'
            : 'local_checkpoint_confirmed_close';
        const updated = await this.db.query<{ id: string; end_time: Date | string }>(
          `UPDATE time_doctor.time_logs t
           SET end_time = GREATEST(
                 COALESCE(t.end_time, t.start_time),
                 COALESCE(t.last_alive_at, t.start_time),
                 LEAST($2::timestamptz, NOW())
               ),
               status = $3,
               updated_at = NOW()
           WHERE t.id = $1
             AND t.user_id = $4
             AND t.end_time IS NULL
           RETURNING t.id, t.end_time`,
          [timeLogId, new Date(endMs).toISOString(), status, userId],
        );
        if (!updated.rows[0]) {
          return { success: false, closed: 0, error: 'session_not_open_or_not_found' };
        }
        try {
          await this.db.query(
            `INSERT INTO time_doctor.time_log_events
              (user_id, time_log_id, workspace_id, action, source, device_id, meta,
               new_end_time, new_status, shortened)
             SELECT t.user_id, t.id, t.workspace_id, $2, 'confirm_stale_session_close',
                    t.device_id, $3::jsonb, t.end_time, t.status, TRUE
             FROM time_doctor.time_logs t WHERE t.id = $1`,
            [
              timeLogId,
              reason,
              JSON.stringify({
                confirmed_end: new Date(endMs).toISOString(),
                confirm_with_local_checkpoint: !!data?.confirm_with_local_checkpoint,
                admin_confirmed: !!data?.admin_confirmed,
              }),
            ],
          );
        } catch (_) {
          /* ignore */
        }
        return {
          success: true,
          closed: 1,
          time_log_id: timeLogId,
          end_time: updated.rows[0].end_time,
          reason,
        };
      }
      case 'insert_session_heartbeat':
      case 'upsert_session_heartbeat': {
        // Append-only telemetry. Alias upsert_* kept for desktop builds already calling it.
        const userId = parseUserIdParam(data?.user_id);
        const timeLogId = await this.resolveTimeLogId(data?.time_log_id);
        if (!timeLogId) {
          throw new HttpException('Missing or unknown time_log_id', HttpStatus.BAD_REQUEST);
        }
        const seenRaw = data?.seen_at || data?.last_seen_at || new Date().toISOString();
        const seenMs = new Date(seenRaw).getTime();
        if (!Number.isFinite(seenMs)) {
          throw new HttpException('Invalid seen_at', HttpStatus.BAD_REQUEST);
        }
        const seenAt = new Date(Math.min(Date.now() + 120_000, seenMs)).toISOString();
        const workspaceId = await this.resolveWorkspaceId(userId, data?.organization_id);
        const meta =
          data?.meta && typeof data.meta === 'object' && !Array.isArray(data.meta)
            ? data.meta
            : {};
        await this.db.query(
          `INSERT INTO time_doctor.session_heartbeats
             (time_log_id, user_id, device_id, workspace_id, seen_at, reason, agent_version, meta)
           VALUES ($1,$2,$3,$4,$5::timestamptz,$6,$7,$8::jsonb)`,
          [
            timeLogId,
            userId,
            data?.device_id ? String(data.device_id).slice(0, 128) : null,
            workspaceId,
            seenAt,
            data?.reason ? String(data.reason).slice(0, 64) : 'interval',
            data?.agent_version ? String(data.agent_version).slice(0, 64) : null,
            JSON.stringify(meta),
          ],
        );
        return { success: true, time_log_id: timeLogId, seen_at: seenAt };
      }
      case 'reconcile_inflated_time_logs': {
        // No-op for duration: never shorten employee time.
        // Kept as a success stub so older agents calling this action do not fail.
        return { success: true, reconciled: 0 };
      }
      case 'get_effective_stats': {
        // Idle and low-activity seconds under the same rules the web reports
        // use. The agent used to work these out itself and the two answers
        // drifted — it counted isolated low screenshots, counted video meetings
        // against people, and treated any pause over a minute as idle, so the
        // same day read 24m non-effective on the web and 1h16m on the desktop.
        //
        // Only the two inputs are returned, not a total. The agent applies
        // min(total, idle + low) against the total it is already displaying, so
        // its clock never depends on this call.
        const userId = parseUserIdParam(data?.user_id);
        const workspaceId = await this.resolveWorkspaceId(userId, data?.workspace_id);
        if (!data?.start || !data?.end) {
          throw new HttpException('Missing start/end', HttpStatus.BAD_REQUEST);
        }

        let lowActivityThreshold = 10;
        let intervalMinutes = 10;
        let tz: string | undefined = typeof data?.tz === 'string' ? data.tz : undefined;
        if (workspaceId) {
          const wsResult = await this.db.query<{ settings: Record<string, unknown> }>(
            `SELECT settings FROM time_doctor.workspace_settings WHERE workspace_id = $1 LIMIT 1`,
            [workspaceId],
          );
          const raw = wsResult.rows[0]?.settings ?? {};
          const rawThreshold = Number(raw.low_activity_threshold);
          // Same cap Pulse applies, so the agent cannot be handed a looser one.
          lowActivityThreshold = Math.min(
            Math.max(Number.isFinite(rawThreshold) ? rawThreshold : 10, 0),
            10,
          );
          const rawInterval = Number(raw.screenshot_interval_minutes);
          if (Number.isFinite(rawInterval) && rawInterval > 0) intervalMinutes = rawInterval;
          if (!tz && typeof raw.timezone === 'string') tz = raw.timezone;
        }

        const stats = await this.effectiveTime.idleAndLowActivitySecondsForUser({
          userId,
          workspaceId,
          startIso: String(data.start),
          endIso: String(data.end),
          lowActivityThreshold,
          intervalMinutes,
          tz,
        });

        return {
          success: true,
          idle_seconds: stats.idleSeconds,
          low_activity_seconds: stats.lowActivitySeconds,
          low_activity_threshold: lowActivityThreshold,
          screenshot_interval_minutes: intervalMinutes,
        };
      }
      case 'get_workspace_settings': {
        const userId = parseUserIdParam(data?.user_id);
        const workspaceId = await this.resolveWorkspaceId(userId, data?.workspace_id);
        const defaults = {
          hours_threshold: 7,
          high_activity_threshold: 60,
          low_activity_threshold: 10,
          screenshot_interval_minutes: 10,
          timezone: normalizeWorkTimezone(null),
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
            timezone: normalizeWorkTimezone(
              typeof raw.timezone === 'string' ? raw.timezone : defaults.timezone,
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
        const startOfDay = start || startOfWorkDayIso();
        const endOfDay = end || endOfWorkDayExclusiveIso();
        const result = await this.db.query<{
          id: string;
          start_time: string;
          end_time: string | null;
          status: string;
          idle_seconds: number | null;
        }>(
          `SELECT id, start_time, end_time, status, idle_seconds
           FROM time_doctor.time_logs
           WHERE user_id = $1
             AND start_time < $3::timestamptz
             AND COALESCE(end_time, NOW()) > $2::timestamptz
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
      case 'list_idle_logs': {
        // The agent could write idle_logs but never read them back, so its own
        // session summary had no source for idle/active seconds once the legacy
        // path was removed. Read-side counterpart to insert_idle_log.
        const userId = data?.user_id;
        if (!userId) {
          throw new HttpException('Missing user_id', HttpStatus.BAD_REQUEST);
        }
        const uid = parseUserIdParam(userId);
        const filters: string[] = ['user_id = $1'];
        const params: unknown[] = [uid];
        if (data?.start) {
          params.push(data.start);
          filters.push(`COALESCE(idle_end, idle_start) >= $${params.length}`);
        }
        if (data?.end) {
          params.push(data.end);
          filters.push(`idle_start <= $${params.length}`);
        }
        if (data?.time_log_id) {
          const tlId = await this.resolveTimeLogId(data.time_log_id);
          if (tlId) {
            params.push(tlId);
            filters.push(`time_log_id = $${params.length}`);
          }
        }
        const idleLimit = Math.min(Math.max(Number(data?.limit) || 500, 1), 5000);
        const idleResult = await this.db.query(
          `SELECT id, time_log_id, idle_start, idle_end, duration_seconds
           FROM time_doctor.idle_logs
           WHERE ${filters.join(' AND ')}
           ORDER BY idle_start DESC
           LIMIT ${idleLimit}`,
          params,
        );
        return { success: true, idle_logs: idleResult.rows };
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
          // ended_at and duration are returned so a visit can be reported as
          // "this link, roughly this long". Without them the read path could only
          // answer which links were opened, never for how long.
          `SELECT id, site_url AS url, title, domain, browser,
                  started_at AS timestamp, started_at, ended_at,
                  CASE
                    WHEN ended_at IS NOT NULL
                      THEN GREATEST(0, EXTRACT(EPOCH FROM (ended_at - started_at))::int)
                    ELSE NULL
                  END AS duration_seconds
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
      case 'log_upload_init': {
        // Desktop-agent diagnostic JSONL — Hive-partitioned for Athena; PUT directly to S3.
        if (!this.s3.isEnabled()) {
          throw new HttpException('S3 is not configured on the API', HttpStatus.SERVICE_UNAVAILABLE);
        }
        const userId = parseUserIdParam(data?.user_id);
        const logDate = typeof data?.log_date === 'string' ? data.log_date : null;
        if (!logDate || !/^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
          throw new HttpException('Missing or invalid log_date (YYYY-MM-DD)', HttpStatus.BAD_REQUEST);
        }
        const workspaceId = await this.resolveWorkspaceId(userId, data?.organization_id);
        const s3Key = buildLogS3Key({
          workspaceId,
          userId,
          deviceId: typeof data?.device_id === 'string' ? data.device_id : null,
          agentVersion: typeof data?.agent_version === 'string' ? data.agent_version : null,
          logDate,
        });
        const uploadUrl = await this.s3.getPresignedPutUrl(s3Key, 'application/x-ndjson');
        return { success: true, s3_key: s3Key, upload_url: uploadUrl, content_type: 'application/x-ndjson' };
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
                  s.keystrokes, s.mouse_movements, s.app_name, s.window_title,
                  s.ai_analysis_status, s.category, s.is_work_related,
                  s.confidence_score, s.distraction_score
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
             app_name, window_title, agent_version, workspace_id, ai_analysis_status)
           VALUES ($1,$2,$3,NULL,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'pending')
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
        const capturedAt = meta.captured_at || new Date().toISOString();
        void this.screenshotAi
          .enqueueAfterUpload({
            id: insert.rows[0].id,
            user_id: parseUserIdParam(userId),
            workspace_id: workspaceId,
            s3_key: s3Key,
            captured_at: capturedAt,
            app_name: meta.app_name || null,
            window_title: meta.window_title || null,
          })
          .catch((err) => {
            this.logger.warn(
              `Failed to enqueue AI analysis for screenshot ${insert.rows[0].id}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          });
        return { success: true, id: insert.rows[0].id, s3_key: s3Key };
      }
      case 'estimate_screenshot_deduction': {
        const screenshot = await this.loadOwnedScreenshot(
          data?.screenshot_id ?? data?.screenshotId,
          data?.user_id,
        );
        const deductedSeconds = await this.computeScreenshotDeductionSeconds(screenshot);
        return { success: true, deductedSeconds, capturedAt: screenshot.captured_at };
      }
      case 'delete_screenshot': {
        const screenshot = await this.loadOwnedScreenshot(
          data?.screenshot_id ?? data?.screenshotId,
          data?.user_id,
        );
        const deductedSeconds = await this.computeScreenshotDeductionSeconds(screenshot);

        // Remove the S3 object (best-effort; row deletion is the source of truth).
        await this.s3.deleteObject(screenshot.s3_key || screenshot.file_path);

        // Deduct the owned interval from the parent session's tracked time.
        if (screenshot.time_log_id && deductedSeconds > 0) {
          await this.db.query(
            `UPDATE time_doctor.time_logs
             SET deducted_seconds = COALESCE(deducted_seconds, 0) + $1, updated_at = NOW()
             WHERE id = $2`,
            [deductedSeconds, screenshot.time_log_id],
          );
        }

        await this.db.query('DELETE FROM time_doctor.screenshots WHERE id = $1', [screenshot.id]);

        this.logger.log(
          `delete_screenshot: id=${screenshot.id} user=${screenshot.user_id} deducted=${deductedSeconds}s`,
        );
        return { success: true, deductedSeconds, timeLogId: screenshot.time_log_id };
      }
      case 'upload_screenshot': {
        throw new HttpException(
          'upload_screenshot is deprecated; use screenshot_upload_init + PUT to S3 + screenshot_upload_complete',
          HttpStatus.GONE,
        );
      }
      case 'insert_time_log_events': {
        // Desktop agent diagnostics / audit breadcrumbs (e.g. CPU samples).
        // Does not mutate time_logs — append-only into time_log_events.
        const events = Array.isArray(data?.events) ? data.events : data?.event ? [data.event] : [];
        if (!events.length) {
          throw new HttpException('Missing events', HttpStatus.BAD_REQUEST);
        }
        let inserted = 0;
        for (const ev of events.slice(0, 50)) {
          const userId = parseUserIdParam(ev.user_id);
          const action = String(ev.action || '').trim().slice(0, 64);
          if (!action) continue;
          const workspaceId =
            (await this.resolveWorkspaceId(ev.user_id, ev.organization_id)) ?? null;
          const timeLogId = await this.resolveTimeLogId(ev.time_log_id);
          const meta =
            ev.meta && typeof ev.meta === 'object' && !Array.isArray(ev.meta) ? ev.meta : {};
          await this.db.query(
            `INSERT INTO time_doctor.time_log_events
              (user_id, time_log_id, workspace_id, action, source, device_id, agent_version, request_id, meta)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
            [
              userId,
              timeLogId,
              workspaceId,
              action,
              String(ev.source || 'desktop-agent').slice(0, 64),
              ev.device_id ? String(ev.device_id).slice(0, 128) : null,
              ev.agent_version ? String(ev.agent_version).slice(0, 64) : null,
              ev.request_id ? String(ev.request_id).slice(0, 128) : null,
              JSON.stringify(meta),
            ],
          );
          inserted += 1;
        }
        this.logger.log(`insert_time_log_events: inserted=${inserted}`);
        return { success: true, inserted };
      }
      default:
        throw new HttpException(`Unsupported action: ${action}`, HttpStatus.BAD_REQUEST);
    }
  }
}
