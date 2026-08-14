/**
 * Reports IPC Handlers - Unified tracking snapshot and activity data
 * Provides consistent data contracts for the My Reports screen
 */

const { z } = require('zod');

// Zod schemas for type safety and validation
const TrackingSnapshotSchema = z.object({
  session: z.object({
    isTracking: z.boolean(),
    isPaused: z.boolean(),
    isIdle: z.boolean(),
    startedAt: z.string().optional(),
    pausedAt: z.string().optional(),
    idleSince: z.string().optional(),
  }),
  stats: z.object({
    mouseMoves: z.number(),
    keyPresses: z.number(),
    mouseClicks: z.number(),
    activeSeconds: z.number(),
    updatedAt: z.string(),
  }),
  security: z.object({
    screenPermOk: z.boolean(),
    antiCheatFlags: z.array(z.string()),
    updatedAt: z.string(),
  }),
  logs: z.object({
    items: z.array(z.object({
      ts: z.string(),
      type: z.enum(['Idle Start', 'Idle End', 'App Switch', 'Screenshot', 'Warning', 'Error', 'Input Activity', 'Web Activity']),
      message: z.string(),
      meta: z.record(z.any()).optional(),
    })),
    hasMore: z.boolean(),
    nextCursor: z.string().optional(),
    updatedAt: z.string(),
  }),
  network: z.object({
    offlineQueue: z.number(),
    isOnline: z.boolean(),
  }),
});

class ReportsIPCHandlers {
  constructor(dependencies = {}) {
    this.ipcMain = dependencies.ipcMain;
    this.activityManager = dependencies.activityManager;
    this.trackingManager = dependencies.trackingManager;
    this.config = dependencies.config;
    this.global = dependencies.global || global;
    
    console.log('✅ ReportsIPCHandlers initialized');
  }

  /**
   * Register all reports-related IPC handlers
   */
  registerHandlers() {
    this.registerTrackingSnapshotHandler();
    this.registerSessionSummaryHandler();
    
    console.log('✅ Reports IPC handlers registered');
  }

  /**
   * Main unified handler for tracking snapshot
   */
  registerTrackingSnapshotHandler() {
    this.ipcMain.handle('reports:get-tracking-snapshot', async (event, options = {}) => {
      try {
        const { cursor, limit = 20, typeFilter, timeRange = '24h' } = options;
        
        console.log('📊 [REPORTS] Getting tracking snapshot with options:', options);

        // Get current session state
        const session = this.getCurrentSession();
        
        // Get activity stats (session-based when tracking, DB-based when not)
        const stats = await this.getActivityStats(session);
        
        // Get security status
        const security = this.getSecurityStatus();
        
        // Get paginated activity logs
        const logs = await this.getActivityLogs(cursor, limit, typeFilter, timeRange);
        
        // Get network status
        const network = this.getNetworkStatus();

        const snapshot = {
          session,
          stats,
          security,
          logs,
          network
        };

        // Validate against schema
        const validatedSnapshot = TrackingSnapshotSchema.parse(snapshot);
        
        console.log('✅ [REPORTS] Tracking snapshot generated successfully');
        return { success: true, data: validatedSnapshot };

      } catch (error) {
        console.error('❌ [REPORTS] Error generating tracking snapshot:', error);
        return { 
          success: false, 
          error: error.message,
          data: this.getFallbackSnapshot()
        };
      }
    });
  }

  /**
   * Get current session state
   */
  getCurrentSession() {
    const trackingStatus = this.trackingManager?.getTrackingStatus() || {};
    const currentSession = this.global.currentSession || {};
    const idleManager = this.global.idleManager || {};

    return {
      isTracking: trackingStatus.isTracking || false,
      isPaused: trackingStatus.isPaused || false,
      isIdle: idleManager.isIdle || false,
      startedAt: currentSession.start_time || trackingStatus.sessionStart,
      pausedAt: trackingStatus.pausedAt,
      idleSince: idleManager.idleSince,
    };
  }

  /**
   * Get activity statistics
   */
  async getActivityStats(session) {
    const now = new Date().toISOString();
    
    if (session.isTracking) {
      // Use session-based stats when tracking
      const sessionStats = this.activityManager?.getActivityStats() || {};
      
      return {
        mouseMoves: sessionStats.mouseMovements || 0,
        keyPresses: sessionStats.keyPresses || 0,
        mouseClicks: sessionStats.mouseClicks || 0,
        activeSeconds: sessionStats.activeTime || 0,
        updatedAt: now,
      };
    } else {
      // Use DB-based stats when not tracking (last 24h)
      return await this.getDBActivityStats(now);
    }
  }

  /**
   * Get activity stats from database for last 24h
   */
  async getDBActivityStats(now) {
    const { isBackendRdsEnabled, getTimeLogsInRange } = require('../utils/backend-rds-reads');
    if (!isBackendRdsEnabled(this.config) || !this.global.currentUserId) {
      return {
        mouseMoves: 0,
        keyPresses: 0,
        mouseClicks: 0,
        activeSeconds: 0,
        updatedAt: now,
      };
    }

    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const userId = this.global.currentUserId;

      // Per-event counts came from the Supabase `activities` table, which has no RDS
      // equivalent — only the screenshot rollup remains.
      const { fetchScreenshotsFromBackend } = require('../utils/backend-screenshots');
      const screenshots = await fetchScreenshotsFromBackend(userId, this.config, {
        startIso: oneDayAgo,
        endIso: new Date().toISOString(),
      });

      let mouseMoves = 0, keyPresses = 0, mouseClicks = 0;

      if (screenshots?.length) {
        mouseMoves = screenshots.reduce((sum, s) => sum + (s.mouse_movements || 0), 0);
        keyPresses = screenshots.reduce((sum, s) => sum + (s.keystrokes || 0), 0);
        mouseClicks = screenshots.reduce((sum, s) => sum + (s.mouse_clicks || 0), 0);
      }

      // Calculate active time from time logs (last 24h)
      const timeLogs = await getTimeLogsInRange(userId, { start: oneDayAgo }, this.config);

      let activeSeconds = 0;
      if (timeLogs?.length) {
        timeLogs.forEach(log => {
          if (log.end_time) {
            const duration = (new Date(log.end_time) - new Date(log.start_time)) / 1000;
            const idle = log.idle_seconds || 0;
            activeSeconds += Math.max(0, duration - idle);
          }
        });
      }

      return {
        mouseMoves,
        keyPresses,
        mouseClicks,
        activeSeconds: Math.floor(activeSeconds),
        updatedAt: now,
      };

    } catch (error) {
      console.error('❌ [REPORTS] Error getting DB activity stats:', error);
      return {
        mouseMoves: 0,
        keyPresses: 0,
        mouseClicks: 0,
        activeSeconds: 0,
        updatedAt: now,
      };
    }
  }

  /**
   * Get security status
   */
  getSecurityStatus() {
    const now = new Date().toISOString();
    const antiCheatManager = this.global.antiCheatManager || {};
    
    // Check screen recording permission (macOS)
    let screenPermOk = true;
    if (process.platform === 'darwin') {
      const { systemPreferences } = require('electron');
      screenPermOk = systemPreferences.getMediaAccessStatus('screen') === 'granted';
    }

    return {
      screenPermOk,
      antiCheatFlags: antiCheatManager.getFlags?.() || [],
      updatedAt: now,
    };
  }

  /**
   * Get paginated activity logs
   */
  async getActivityLogs(cursor, limit, typeFilter, timeRange) {
    const now = new Date().toISOString();

    const { isBackendRdsEnabled, listAppLogs, listUrlLogs } = require('../utils/backend-rds-reads');
    if (!isBackendRdsEnabled(this.config) || !this.global.currentUserId) {
      return {
        items: [],
        hasMore: false,
        updatedAt: now,
      };
    }

    try {
      const userId = this.global.currentUserId;
      let startTime;
      
      // Calculate time range
      switch (timeRange) {
        case '1h':
          startTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
          break;
        case '24h':
        default:
          startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          break;
        case '7d':
          startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          break;
      }

      const logs = [];
      const endTime = new Date().toISOString();
      const perSourceLimit = Math.ceil(limit / 4);

      // 'Input Activity' and 'Idle Start'/'Idle End' entries came from the Supabase
      // `activities` and `idle_logs` tables; neither has an RDS read action, so those
      // log types are no longer produced here.
      const { fetchScreenshotsFromBackend } = require('../utils/backend-screenshots');
      const [appLogs, urlLogs, screenshots] = await Promise.all([
        listAppLogs(userId, { start: startTime, end: endTime, limit: perSourceLimit }, this.config),
        listUrlLogs(userId, { start: startTime, end: endTime, limit: perSourceLimit }, this.config),
        fetchScreenshotsFromBackend(userId, this.config, {
          startIso: startTime,
          endIso: endTime,
          limit: perSourceLimit,
        }),
      ]);

      // Process app logs
      if (appLogs?.length) {
        appLogs.forEach(log => {
          logs.push({
            ts: log.timestamp,
            type: 'App Switch',
            message: `Switched to ${log.app_name}${log.window_title ? ` (${log.window_title})` : ''}`,
            meta: { app: log.app_name, timeLogId: log.time_log_id }
          });
        });
      }

      // Process URL logs
      if (urlLogs?.length) {
        urlLogs.forEach(log => {
          logs.push({
            ts: log.timestamp,
            type: 'Web Activity',
            message: `Visited ${log.domain || log.url}${log.title ? ` - ${log.title}` : ''}`,
            meta: { url: log.url, browser: log.browser, timeLogId: log.time_log_id }
          });
        });
      }

      // Process screenshots — RDS names the capture time `captured_at`
      if (screenshots?.length) {
        screenshots.forEach(log => {
          logs.push({
            ts: log.captured_at,
            type: 'Screenshot',
            message: `Screenshot captured automatically (${log.activity_percent || 0}% activity)`,
            meta: { activity: log.activity_percent, timeLogId: log.time_log_id }
          });
        });
      }

      // Sort all logs by timestamp (most recent first)
      logs.sort((a, b) => new Date(b.ts) - new Date(a.ts));

      // Apply type filter if specified
      const filteredLogs = typeFilter ? 
        logs.filter(log => log.type === typeFilter) : 
        logs;

      // Apply pagination
      const startIndex = cursor ? parseInt(cursor) : 0;
      const endIndex = startIndex + limit;
      const paginatedLogs = filteredLogs.slice(startIndex, endIndex);
      
      return {
        items: paginatedLogs,
        hasMore: endIndex < filteredLogs.length,
        nextCursor: endIndex < filteredLogs.length ? endIndex.toString() : undefined,
        updatedAt: now,
      };

    } catch (error) {
      console.error('❌ [REPORTS] Error getting activity logs:', error);
      return {
        items: [],
        hasMore: false,
        updatedAt: now,
      };
    }
  }

  /**
   * Get network status
   */
  getNetworkStatus() {
    const offlineQueue = this.global.offlineQueue || {};
    
    return {
      offlineQueue: Object.keys(offlineQueue).length || 0,
      isOnline: true, // Default to online in main process - renderer can provide actual status
    };
  }

  /**
   * Get fallback snapshot for error cases
   */
  getFallbackSnapshot() {
    const now = new Date().toISOString();
    
    return {
      session: {
        isTracking: false,
        isPaused: false,
        isIdle: false,
      },
      stats: {
        mouseMoves: 0,
        keyPresses: 0,
        mouseClicks: 0,
        activeSeconds: 0,
        updatedAt: now,
      },
      security: {
        screenPermOk: true,
        antiCheatFlags: [],
        updatedAt: now,
      },
      logs: {
        items: [],
        hasMore: false,
        updatedAt: now,
      },
      network: {
        offlineQueue: 0,
        isOnline: true,
      },
    };
  }

  /**
   * Register session summary handler for specific time ranges
   */
  registerSessionSummaryHandler() {
    this.ipcMain.handle('reports:get-session-summary', async (event, options = {}) => {
      try {
        const { timeLogId, fromLocal, toLocal } = options;
        
        console.log('📊 [REPORTS] Getting session summary:', options);

        let fromUTC, toUTC;
        
        if (timeLogId) {
          // Resolving a window from a single time_log id was a Supabase point-lookup;
          // there is no RDS action to fetch one time log by id.
          console.warn(
            '⚠️ [REPORTS] Session summary by timeLogId is unavailable (no RDS lookup by id) — returning empty summary',
          );
          return { success: true, data: this.getEmptySessionSummary() };
        } else {
          // Convert local times to UTC
          fromUTC = new Date(fromLocal).toISOString();
          toUTC = new Date(toLocal || Date.now()).toISOString();
        }

        console.log(`📊 [REPORTS] Summary window: ${fromUTC} to ${toUTC}`);

        // Calculate session metrics using the comprehensive SQL logic
        const summary = await this.calculateSessionSummary(fromUTC, toUTC);
        
        return { success: true, data: summary };

      } catch (error) {
        console.error('❌ [REPORTS] Error getting session summary:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Zeroed session summary used when no data source can answer the request.
   */
  getEmptySessionSummary() {
    return {
      totalSeconds: 0,
      idleSeconds: 0,
      activeSeconds: 0,
      mouseMoves: 0,
      keyPresses: 0,
      mouseClicks: 0,
      appsCount: 0,
      screenshotCount: 0,
    };
  }

  /**
   * Calculate comprehensive session summary for a time window
   */
  async calculateSessionSummary(fromUTC, toUTC) {
    const { isBackendRdsEnabled, listAppLogs } = require('../utils/backend-rds-reads');
    if (!isBackendRdsEnabled(this.config) || !this.global.currentUserId) {
      return this.getEmptySessionSummary();
    }

    const userId = this.global.currentUserId;
    
    try {
      // Calculate total time window
      const totalSeconds = Math.floor((new Date(toUTC) - new Date(fromUTC)) / 1000);

      // Idle overlap, clipped to the requested window so a period straddling the
      // boundary only contributes the part inside it.
      let idleSeconds = 0;
      try {
        const { listIdleLogs } = require('../utils/backend-rds-reads');
        const idleLogs = await listIdleLogs(userId, { start: fromUTC, end: toUTC }, this.config);
        const windowStart = new Date(fromUTC).getTime();
        const windowEnd = new Date(toUTC).getTime();
        for (const row of idleLogs) {
          const s = Math.max(new Date(row.idle_start).getTime(), windowStart);
          const rawEnd = row.idle_end
            ? new Date(row.idle_end).getTime()
            : new Date(row.idle_start).getTime() + (Number(row.duration_seconds) || 0) * 1000;
          const e = Math.min(rawEnd, windowEnd);
          if (e > s) idleSeconds += Math.floor((e - s) / 1000);
        }
      } catch (idleErr) {
        console.warn('⚠️ [REPORTS] Idle read failed:', idleErr?.message || idleErr);
      }
      const activeSeconds = Math.max(0, totalSeconds - idleSeconds);

      // Per-event counts came from the Supabase `activities` table (no RDS equivalent);
      // only the screenshot rollup remains.
      const { fetchScreenshotsFromBackend } = require('../utils/backend-screenshots');
      const screenshots = await fetchScreenshotsFromBackend(userId, this.config, {
        startIso: fromUTC,
        endIso: toUTC,
      });

      let mouseMoves = 0, keyPresses = 0, mouseClicks = 0;
      if (screenshots?.length) {
        mouseMoves = screenshots.reduce((sum, s) => sum + (s.mouse_movements || 0), 0);
        keyPresses = screenshots.reduce((sum, s) => sum + (s.keystrokes || 0), 0);
        mouseClicks = screenshots.reduce((sum, s) => sum + (s.mouse_clicks || 0), 0);
      }

      // Get apps count
      const appLogs = await listAppLogs(userId, { start: fromUTC, end: toUTC }, this.config);

      const appsCount = appLogs ? new Set(appLogs.map(log => log.app_name)).size : 0;

      return {
        totalSeconds,
        idleSeconds,
        activeSeconds,
        mouseMoves,
        keyPresses,
        mouseClicks,
        appsCount,
        screenshotCount: screenshots?.length || 0,
      };

    } catch (error) {
      console.error('❌ [REPORTS] Error calculating session summary:', error);
      return this.getEmptySessionSummary();
    }
  }
}

module.exports = ReportsIPCHandlers;
