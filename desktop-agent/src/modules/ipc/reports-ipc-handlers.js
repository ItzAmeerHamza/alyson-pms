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
    this.supabaseService = dependencies.supabaseService;
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
    if (!this.supabaseService || !this.global.currentUserId) {
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

      // Get activity from activities table (preferred)
      const { data: activities } = await this.supabaseService
        .from('activities')
        .select('activity_type')
        .eq('user_id', userId)
        .gte('created_at', oneDayAgo);

      let mouseMoves = 0, keyPresses = 0, mouseClicks = 0;
      
      if (activities?.length) {
        activities.forEach(activity => {
          switch (activity.activity_type) {
            case 'mouse_move': mouseMoves++; break;
            case 'keystroke': keyPresses++; break;
            case 'mouse_click': mouseClicks++; break;
          }
        });
      } else {
        // Fallback to screenshots rollup data
        const { data: screenshots } = await this.supabaseService
          .from('screenshots')
          .select('mouse_movements, keystrokes, mouse_clicks')
          .eq('user_id', userId)
          .gte('timestamp', oneDayAgo);

        if (screenshots?.length) {
          mouseMoves = screenshots.reduce((sum, s) => sum + (s.mouse_movements || 0), 0);
          keyPresses = screenshots.reduce((sum, s) => sum + (s.keystrokes || 0), 0);
          mouseClicks = screenshots.reduce((sum, s) => sum + (s.mouse_clicks || 0), 0);
        }
      }

      // Calculate active time from time logs (last 24h)
      const { data: timeLogs } = await this.supabaseService
        .from('time_logs')
        .select('start_time, end_time, idle_seconds')
        .eq('user_id', userId)
        .gte('start_time', oneDayAgo);

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
    
    if (!this.supabaseService || !this.global.currentUserId) {
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

      // Fetch from multiple sources concurrently
      const [appLogs, urlLogs, screenshots, activities, idleLogs] = await Promise.all([
        this.supabaseService.from('app_logs')
          .select('app_name, window_title, timestamp, time_log_id')
          .eq('user_id', userId)
          .gte('timestamp', startTime)
          .order('timestamp', { ascending: false })
          .limit(Math.ceil(limit / 4)),
          
        this.supabaseService.from('url_logs')
          .select('url, title, domain, browser, timestamp, time_log_id')
          .eq('user_id', userId)
          .gte('timestamp', startTime)
          .order('timestamp', { ascending: false })
          .limit(Math.ceil(limit / 4)),
          
        this.supabaseService.from('screenshots')
          .select('timestamp, activity_percent, time_log_id')
          .eq('user_id', userId)
          .gte('timestamp', startTime)
          .order('timestamp', { ascending: false })
          .limit(Math.ceil(limit / 4)),
          
        this.supabaseService.from('activities')
          .select('activity_type, created_at, time_log_id')
          .eq('user_id', userId)
          .gte('created_at', startTime)
          .order('created_at', { ascending: false })
          .limit(Math.ceil(limit / 4)),
          
        this.supabaseService.from('idle_logs')
          .select('idle_start, idle_end, duration_seconds')
          .eq('user_id', userId)
          .gte('idle_start', startTime)
          .order('idle_start', { ascending: false })
          .limit(Math.ceil(limit / 4))
      ]);

      // Process app logs
      if (appLogs.data?.length) {
        appLogs.data.forEach(log => {
          logs.push({
            ts: log.timestamp,
            type: 'App Switch',
            message: `Switched to ${log.app_name}${log.window_title ? ` (${log.window_title})` : ''}`,
            meta: { app: log.app_name, timeLogId: log.time_log_id }
          });
        });
      }

      // Process URL logs
      if (urlLogs.data?.length) {
        urlLogs.data.forEach(log => {
          logs.push({
            ts: log.timestamp,
            type: 'Web Activity',
            message: `Visited ${log.domain || log.url}${log.title ? ` - ${log.title}` : ''}`,
            meta: { url: log.url, browser: log.browser, timeLogId: log.time_log_id }
          });
        });
      }

      // Process screenshots
      if (screenshots.data?.length) {
        screenshots.data.forEach(log => {
          logs.push({
            ts: log.timestamp,
            type: 'Screenshot',
            message: `Screenshot captured automatically (${log.activity_percent || 0}% activity)`,
            meta: { activity: log.activity_percent, timeLogId: log.time_log_id }
          });
        });
      }

      // Process activities
      if (activities.data?.length) {
        const activityCounts = activities.data.reduce((acc, activity) => {
          acc[activity.activity_type] = (acc[activity.activity_type] || 0) + 1;
          return acc;
        }, {});

        if (Object.keys(activityCounts).length > 0) {
          const latest = activities.data[0];
          logs.push({
            ts: latest.created_at,
            type: 'Input Activity',
            message: `Input detected: ${activityCounts.mouse_click || 0} clicks, ${activityCounts.keystroke || 0} keys, ${activityCounts.mouse_move || 0} moves`,
            meta: { counts: activityCounts, timeLogId: latest.time_log_id }
          });
        }
      }

      // Process idle logs
      if (idleLogs.data?.length) {
        idleLogs.data.forEach(log => {
          logs.push({
            ts: log.idle_start,
            type: 'Idle Start',
            message: `User became idle - no activity detected`,
            meta: { duration: log.duration_seconds }
          });
          
          if (log.idle_end) {
            logs.push({
              ts: log.idle_end,
              type: 'Idle End',
              message: `User returned from idle state`,
              meta: { duration: log.duration_seconds }
            });
          }
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
          // Get time window from time_logs table
          const { data: timeLog } = await this.supabaseService
            .from('time_logs')
            .select('start_time, end_time')
            .eq('id', timeLogId)
            .eq('user_id', this.global.currentUserId)
            .single();
            
          if (!timeLog) {
            throw new Error('Time log not found');
          }
          
          fromUTC = timeLog.start_time;
          toUTC = timeLog.end_time || new Date().toISOString();
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
   * Calculate comprehensive session summary for a time window
   */
  async calculateSessionSummary(fromUTC, toUTC) {
    if (!this.supabaseService || !this.global.currentUserId) {
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

    const userId = this.global.currentUserId;
    
    try {
      // Calculate total time window
      const totalSeconds = Math.floor((new Date(toUTC) - new Date(fromUTC)) / 1000);

      // Get idle periods that overlap with the window
      const { data: idlePeriods } = await this.supabaseService
        .from('idle_logs')
        .select('idle_start, idle_end, duration_seconds')
        .eq('user_id', userId)
        .not('idle_end', 'is', null)
        .lte('idle_start', toUTC)
        .gte('idle_end', fromUTC);

      // Calculate overlapping idle time
      let idleSeconds = 0;
      if (idlePeriods?.length) {
        idlePeriods.forEach(period => {
          const overlapStart = new Date(Math.max(new Date(period.idle_start), new Date(fromUTC)));
          const overlapEnd = new Date(Math.min(new Date(period.idle_end), new Date(toUTC)));
          const overlapDuration = Math.max(0, (overlapEnd - overlapStart) / 1000);
          idleSeconds += overlapDuration;
        });
      }

      // Get activity counts from activities table
      const { data: activities } = await this.supabaseService
        .from('activities')
        .select('activity_type')
        .eq('user_id', userId)
        .gte('created_at', fromUTC)
        .lte('created_at', toUTC);

      let mouseMoves = 0, keyPresses = 0, mouseClicks = 0;
      if (activities?.length) {
        activities.forEach(activity => {
          switch (activity.activity_type) {
            case 'mouse_move': mouseMoves++; break;
            case 'keystroke': keyPresses++; break;
            case 'mouse_click': mouseClicks++; break;
          }
        });
      } else {
        // Fallback to screenshots rollup
        const { data: screenshots } = await this.supabaseService
          .from('screenshots')
          .select('mouse_movements, keystrokes, mouse_clicks')
          .eq('user_id', userId)
          .gte('timestamp', fromUTC)
          .lte('timestamp', toUTC);

        if (screenshots?.length) {
          mouseMoves = screenshots.reduce((sum, s) => sum + (s.mouse_movements || 0), 0);
          keyPresses = screenshots.reduce((sum, s) => sum + (s.keystrokes || 0), 0);
          mouseClicks = screenshots.reduce((sum, s) => sum + (s.mouse_clicks || 0), 0);
        }
      }

      // Get apps count
      const { data: appLogs } = await this.supabaseService
        .from('app_logs')
        .select('app_name')
        .eq('user_id', userId)
        .gte('timestamp', fromUTC)
        .lte('timestamp', toUTC);

      const appsCount = appLogs ? new Set(appLogs.map(log => log.app_name)).size : 0;

      // Get screenshot count
      const { data: screenshots, count: screenshotCount } = await this.supabaseService
        .from('screenshots')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('timestamp', fromUTC)
        .lte('timestamp', toUTC);

      const activeSeconds = Math.max(0, totalSeconds - idleSeconds);

      return {
        totalSeconds,
        idleSeconds: Math.floor(idleSeconds),
        activeSeconds: Math.floor(activeSeconds),
        mouseMoves,
        keyPresses,
        mouseClicks,
        appsCount,
        screenshotCount: screenshotCount || 0,
      };

    } catch (error) {
      console.error('❌ [REPORTS] Error calculating session summary:', error);
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
  }
}

module.exports = ReportsIPCHandlers;
