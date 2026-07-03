/**
 * DATA STATS MANAGER MODULE
 * 
 * Manages data and statistics-related IPC handlers for the TimeFlow desktop agent.
 * This includes configuration retrieval, comprehensive stats reporting, and data fetching.
 * 
 * Part of TimeFlow Desktop Agent modular refactoring
 */

class DataStatsManager {
  constructor(dependencies = {}) {
    this.ipcMain = dependencies.ipcMain;
    this.config = dependencies.config;
    this.appSettings = dependencies.appSettings;
    this.supabaseService = dependencies.supabaseService;
    this.global = dependencies.global || global;
    this.require = dependencies.require || require;
    this.process = dependencies.process || process;
    this.systemMonitor = dependencies.systemMonitor;
    this.safeLog = dependencies.safeLog;
    this.calculateActivityPercent = dependencies.calculateActivityPercent;
    this.calculateIdleTimeSeconds = dependencies.calculateIdleTimeSeconds;
    
    try {
      const { logger } = require('../utils/logger');
      this.logger = logger;
    } catch {}
    
    this.initialized = false;
    console.log('✅ DataStatsManager initialized');
  }

  /** RDS (time_doctor.* + tenant.user) via NestJS — not legacy Supabase public.* tables. */
  _usesRdsBackend() {
    try {
      const { isBackendRdsEnabled } = require('../utils/backend-rds-reads');
      return isBackendRdsEnabled(this.config);
    } catch {
      return false;
    }
  }

  async _fetchTimeLogs(userId, opts = {}) {
    const { isBackendRdsEnabled, getTimeLogsInRange } = require('../utils/backend-rds-reads');
    if (isBackendRdsEnabled(this.config)) {
      try {
        const data = await getTimeLogsInRange(
          userId,
          { start: opts.start, end: opts.end, beforeEnd: opts.beforeEnd },
          this.config,
        );
        return { data, error: null };
      } catch (err) {
        return { data: [], error: { message: err?.message || String(err) } };
      }
    }
    if (!this.supabaseService) {
      return { data: [], error: { message: 'Database service not available' } };
    }
    const select = opts.select || 'id, start_time, end_time';
    let query = this.supabaseService.from('time_logs').select(select).eq('user_id', userId);
    if (opts.start) query = query.gte('start_time', opts.start);
    if (opts.end) query = query.lt('start_time', opts.end);
    else if (opts.beforeEnd) query = query.lt('start_time', opts.beforeEnd);
    query = query.order('start_time', { ascending: opts.ascending !== false });
    return query;
  }

  async _fetchAppLogs(userId, { start, end, limit } = {}) {
    const { isBackendRdsEnabled, listAppLogs } = require('../utils/backend-rds-reads');
    if (isBackendRdsEnabled(this.config)) {
      try {
        const data = await listAppLogs(userId, { start, end, limit }, this.config);
        return { data, error: null };
      } catch (err) {
        return { data: [], error: { message: err?.message || String(err) } };
      }
    }
    if (!this.supabaseService) return { data: [], error: { message: 'Database service not available' } };
    let query = this.supabaseService
      .from('app_logs')
      .select('app_name, timestamp, started_at, ended_at')
      .eq('user_id', userId);
    if (start) query = query.gte('timestamp', start);
    if (end) query = query.lte('timestamp', end);
    return query;
  }

  async _fetchUrlLogs(userId, { start, end, limit } = {}) {
    const { isBackendRdsEnabled, listUrlLogs } = require('../utils/backend-rds-reads');
    if (isBackendRdsEnabled(this.config)) {
      try {
        const data = await listUrlLogs(userId, { start, end, limit }, this.config);
        return { data, error: null };
      } catch (err) {
        return { data: [], error: { message: err?.message || String(err) } };
      }
    }
    if (!this.supabaseService) return { data: [], error: { message: 'Database service not available' } };
    let query = this.supabaseService
      .from('url_logs')
      .select('url, timestamp')
      .eq('user_id', userId);
    if (start) query = query.gte('timestamp', start);
    if (end) query = query.lte('timestamp', end);
    return query;
  }

  /**
   * Register all data/stats-related IPC handlers
   */
  registerHandlers() {
    this.registerGetConfig();
    this.registerGetStats();
    // Enable enhanced screenshots handler – renderer calls 'fetch-screenshots-enhanced'
    this.registerFetchScreenshotsEnhanced();
    this.registerGetScreenshotActivity();
    this.registerFetchScreenshots();
    this.registerSetCurrentUserId();
    this.registerGetUrlActivity();
    this.registerGetUrlHistory();
    this.registerGetAppHistory();
    this.registerGetAppActivity();
    this.registerGetTodayStats();
    this.registerGetTodayScreenshots();
    this.registerGetTodayActivityLog();
    // Time analytics
    this.registerGetWeeklyTimeStats();
    this.registerGetMonthlyTimeStats();
    this.registerGetDailyTimeBreakdown();
    this.registerGetMonthlyReportData();
    // Screenshot deletion with time deduction
    this.registerEstimateScreenshotDeduction();
    this.registerDeleteScreenshot();
    // Test helpers
    this.registerTestOpenAppDetection();
    
    console.log('✅ All data/stats IPC handlers registered');
  }

  /**
   * Weekly time statistics (per-day breakdown for current week)
   */
  registerGetWeeklyTimeStats() {
    console.log('📊 [DataStatsManager] Registering get-weekly-time-stats handler');
    try { this.ipcMain.removeHandler('get-weekly-time-stats'); } catch {}
    this.ipcMain.handle('get-weekly-time-stats', async () => {
      try {
        if (!this._usesRdsBackend() && !this.supabaseService) {
          return { totalTime: 0, dailyBreakdown: [], error: 'Database service not available' };
        }
        const userId = this.global.currentUserId || this.config?.user_id || this.config?.userId;
        if (!userId) {
          return { totalTime: 0, dailyBreakdown: [], error: 'User not authenticated' };
        }

        const today = new Date();
        const dow = today.getDay();
        const sundayOffset = -dow; // Sunday as start (Sunday is 0, so go back by dow days)
        const sunday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + sundayOffset);
        const saturday = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + 6);
        const weekStartIso = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate()).toISOString();
        const weekEndExclusive = new Date(saturday.getFullYear(), saturday.getMonth(), saturday.getDate() + 1).toISOString();

        // Fetch logs starting before week end; clamp in JS
        const { data: timeLogs, error } = await this._fetchTimeLogs(userId, {
          beforeEnd: weekEndExclusive,
          ascending: true,
        });
        if (error) return { totalTime: 0, dailyBreakdown: [], error: error.message };

        const dailyBreakdown = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i);
          dailyBreakdown.push({
            date: d.toISOString().split('T')[0],
            dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
            totalTime: 0,
            sessions: 0
          });
        }

        const clamp = (a, b, c, d) => Math.max(0, Math.min(b, d) - Math.max(a, c));
        let totalSeconds = 0;
        const weekStartMs = new Date(weekStartIso).getTime();
        const weekEndMs = new Date(weekEndExclusive).getTime();
        
        // CRITICAL FIX: Only treat the MOST RECENT unclosed session as "ongoing"
        // Other unclosed sessions are stale data and should be skipped
        const sortedLogs = [...(timeLogs || [])].sort((a, b) => 
          new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
        );
        const mostRecentUnclosedId = sortedLogs.find(l => !l.end_time)?.id || null;
        const isTracking = !!(this.global.isTracking || this.global.trackingManager?.isTracking);
        const currentTimeLogId = isTracking ? this.global.trackingManager?.currentTimeLogId : null;
        
        
        (timeLogs || []).forEach(log => {
          if (!log.start_time) return;
          const startMs = new Date(log.start_time).getTime();
          
          let endMs;
          if (log.end_time) {
            endMs = new Date(log.end_time).getTime();
          } else if (isTracking && log.id === currentTimeLogId) {
            endMs = Date.now();
          } else {
            return;
          }
          
          if (endMs <= weekStartMs || startMs >= weekEndMs) return;
          for (let i = 0; i < 7; i++) {
            const dayStart = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i).getTime();
            const dayEnd = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i + 1).getTime();
            const sec = Math.floor(clamp(startMs, endMs, dayStart, dayEnd) / 1000);
            if (sec > 0) {
              dailyBreakdown[i].totalTime += sec;
              dailyBreakdown[i].sessions += 1;
              totalSeconds += sec;
            }
          }
        });

        return { totalTime: totalSeconds, dailyBreakdown, userId, weekStart: dailyBreakdown[0]?.date, weekEnd: dailyBreakdown[6]?.date };
      } catch (e) {
        return { totalTime: 0, dailyBreakdown: [], error: e.message };
      }
    });
  }

  /**
   * Monthly time statistics (per-week breakdown for current month)
   */
  registerGetMonthlyTimeStats() {
    console.log('📊 [DataStatsManager] Registering get-monthly-time-stats handler');
    try { this.ipcMain.removeHandler('get-monthly-time-stats'); } catch {}
    this.ipcMain.handle('get-monthly-time-stats', async () => {
      try {
        if (!this._usesRdsBackend() && !this.supabaseService) {
          return { totalTime: 0, weeklyBreakdown: [], error: 'Database service not available' };
        }
        const userId = this.global.currentUserId || this.config?.user_id || this.config?.userId;
        if (!userId) return { totalTime: 0, weeklyBreakdown: [], error: 'User not authenticated' };

        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        const monthStartIso = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth(), 1).toISOString();
        const monthEndExclusive = new Date(endOfMonth.getFullYear(), endOfMonth.getMonth(), endOfMonth.getDate() + 1).toISOString();

        const { data: timeLogs, error } = await this._fetchTimeLogs(userId, {
          beforeEnd: monthEndExclusive,
          ascending: true,
        });
        if (error) return { totalTime: 0, weeklyBreakdown: [], error: error.message };

        const weeklyBreakdown = [];
        // Build week ranges inside this month: Sunday..Saturday groups overlapping month
        const temp = new Date(startOfMonth);
        // Move temp back to Sunday of its week to start grouping consistently
        const tempDow = temp.getDay();
        const tempSunOffset = -tempDow; // Sunday is 0, go back by tempDow days
        temp.setDate(temp.getDate() + tempSunOffset);
        while (temp <= endOfMonth) {
          const wStart = new Date(temp);
          const wEnd = new Date(temp.getFullYear(), temp.getMonth(), temp.getDate() + 6);
          weeklyBreakdown.push({
            weekStart: wStart.toISOString().split('T')[0],
            weekEnd: wEnd.toISOString().split('T')[0],
            totalTime: 0,
            days: 0
          });
          temp.setDate(temp.getDate() + 7);
        }

        const clamp = (a, b, c, d) => Math.max(0, Math.min(b, d) - Math.max(a, c));
        let totalSeconds = 0;
        const mStartMs = new Date(monthStartIso).getTime();
        const mEndMs = new Date(monthEndExclusive).getTime();
        
        // CRITICAL FIX: Only treat the MOST RECENT unclosed session as "ongoing"
        const sortedLogs = [...(timeLogs || [])].sort((a, b) => 
          new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
        );
        const mostRecentUnclosedId = sortedLogs.find(l => !l.end_time)?.id || null;
        const isTracking = !!(this.global.isTracking || this.global.trackingManager?.isTracking);
        const currentTimeLogId = isTracking ? this.global.trackingManager?.currentTimeLogId : null;
        
        
        (timeLogs || []).forEach(log => {
          if (!log.start_time) return;
          const startMs = new Date(log.start_time).getTime();
          
          let endMs;
          if (log.end_time) {
            endMs = new Date(log.end_time).getTime();
          } else if (isTracking && log.id === currentTimeLogId) {
            endMs = Date.now();
          } else {
            return;
          }
          
          if (endMs <= mStartMs || startMs >= mEndMs) return;
          weeklyBreakdown.forEach((w) => {
            const wStartMs = new Date(w.weekStart + 'T00:00:00.000Z').getTime();
            const wEndMs = new Date(w.weekEnd + 'T23:59:59.999Z').getTime() + 1;
            const sec = Math.floor(clamp(startMs, endMs, wStartMs, wEndMs) / 1000);
            if (sec > 0) { w.totalTime += sec; totalSeconds += sec; }
          });
        });

        return { totalTime: totalSeconds, weeklyBreakdown, userId, monthStart: startOfMonth.toISOString().split('T')[0], monthEnd: endOfMonth.toISOString().split('T')[0] };
      } catch (e) {
        return { totalTime: 0, weeklyBreakdown: [], error: e.message };
      }
    });
  }

  /**
   * Daily time breakdown (per-hour for today)
   */
  registerGetDailyTimeBreakdown() {
    try { this.ipcMain.removeHandler('get-daily-time-breakdown'); } catch {}
    this.ipcMain.handle('get-daily-time-breakdown', async () => {
      try {
        if (!this._usesRdsBackend() && !this.supabaseService) return { totalTime: 0, hourlyBreakdown: [], error: 'Database service not available' };
        const userId = this.global.currentUserId || this.config?.user_id || this.config?.userId;
        if (!userId) return { totalTime: 0, hourlyBreakdown: [], error: 'User not authenticated' };

        const start = new Date(); start.setHours(0,0,0,0);
        const endExclusive = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
        const { data: timeLogs, error } = await this._fetchTimeLogs(userId, {
          beforeEnd: endExclusive.toISOString(),
          ascending: true,
        });
        if (error) return { totalTime: 0, hourlyBreakdown: [], error: error.message };

        const clamp = (a, b, c, d) => Math.max(0, Math.min(b, d) - Math.max(a, c));
        const hourlyBreakdown = Array.from({ length: 24 }, (_, h) => ({ hour: h, totalTime: 0, sessions: 0 }));
        let totalSeconds = 0;
        const dayStartMs = start.getTime();
        const dayEndMs = endExclusive.getTime();
        const isTracking = !!(this.global.isTracking || this.global.trackingManager?.isTracking);
        const activeLogId = isTracking ? this.global.trackingManager?.currentTimeLogId : null;
        (timeLogs || []).forEach(log => {
          if (!log.start_time) return;
          const s = new Date(log.start_time).getTime();
          let e;
          if (log.end_time) {
            e = new Date(log.end_time).getTime();
          } else if (isTracking && log.id === activeLogId) {
            e = Date.now();
          } else {
            return;
          }
          if (e <= dayStartMs || s >= dayEndMs) return;
          for (let h = 0; h < 24; h++) {
            const hStart = new Date(start.getFullYear(), start.getMonth(), start.getDate(), h).getTime();
            const hEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate(), h + 1).getTime();
            const sec = Math.floor(clamp(s, e, hStart, hEnd) / 1000);
            if (sec > 0) { hourlyBreakdown[h].totalTime += sec; hourlyBreakdown[h].sessions += 1; totalSeconds += sec; }
          }
        });

        return { totalTime: totalSeconds, hourlyBreakdown };
      } catch (e) {
        return { totalTime: 0, hourlyBreakdown: [], error: e.message };
      }
    });
  }

  /**
   * Monthly report data: sessions, project breakdown, daily breakdown, avg activity
   */
  registerGetMonthlyReportData() {
    // Registered early in main.js so the renderer can load before initialize() completes.
    console.log('📊 [DataStatsManager] Skipping get-monthly-report-data — using early handler from main.js');
  }

  /**
   * Get application configuration
   */
  registerGetConfig() {
    // Skip registering get-config handler - using early handler from main.js to prevent conflicts
    console.log('📡 [DataStatsManager] Skipping get-config registration - using early handler from main.js');
    return;
    
    // DISABLED: Check if handler already exists before registering
    try {
      // Try to remove existing handler first - this will throw if none exists
      this.ipcMain.removeHandler('get-config');
      console.log('📡 [DataStatsManager] Removed existing get-config handler');
    } catch (e) {
      // No existing handler, which is fine
    }
    
    this.ipcMain.handle('get-config', () => {
      try {
        this.safeLog && this.safeLog('⚙️ Getting app configuration...');
        this.logger && this.logger.info({ category: 'IPC', step: 'get-config: START' });
        
        // Debug logging to see what's being returned
        const result = {
          success: true,
          supabase_url: this.config.supabase_url,
          supabase_key: this.config.supabase_key,
          user_id: this.config.user_id || this.config.userId,
          userEmail: this.config.userEmail,
          project_id: this.config.project_id || this.config.projectId,
          screenshotInterval: this.config.screenshotInterval || (this.appSettings.screenshot_interval_seconds * 1000) || 300000,
          idleThreshold: this.config.idleThreshold || (this.appSettings.idle_threshold_seconds * 1000) || 60000,
          isTracking: this.global.isTracking,
          isPaused: this.global.isPaused,
          platform: this.process.platform,
          version: this.require('../../../package.json').version || '1.0.0',
          NODE_ENV: this.config.NODE_ENV || this.process.env.NODE_ENV || 'production',
          settings: this.appSettings
        };
        
        console.log('🔍 [DEBUG] Returning config to renderer:', {
          hasSupabaseUrl: !!result.supabase_url,
          hasSupabaseKey: !!result.supabase_key,
          urlValue: result.supabase_url,
          success: result.success
        });
        
        return result;
      } catch (error) {
        console.error('❌ Error getting config:', error);
        this.logger && this.logger.error({ category: 'IPC', step: 'get-config: ERROR', message: error.message });
        return { 
          success: false, 
          error: error.message,
          supabase_url: '',
          supabase_key: '',
          platform: this.process.platform,
          isTracking: false,
          isPaused: false,
          settings: this.appSettings || {}
        };
      }
    });
  }

  /**
   * Estimate time deduction for a screenshot (without deleting).
   * Used to show the confirmation popup before deletion.
   */
  registerEstimateScreenshotDeduction() {
    try {
      this.ipcMain.removeHandler('estimate-screenshot-deduction');
    } catch (e) {}

    this.ipcMain.handle('estimate-screenshot-deduction', async (event, { screenshotId }) => {
      try {
        if (!screenshotId) {
          return { success: false, error: 'Missing screenshotId' };
        }

        console.log('[DELETE-EST] Estimating deduction for screenshot:', screenshotId);

        const { estimateDeduction } = require('../utils/screenshot-deletion');
        const { deductedSeconds, screenshot } = await estimateDeduction({
          screenshotId,
          supabase: this.supabaseService
        });

        console.log('[DELETE-EST] Result:', {
          deductedSeconds,
          time_log_id: screenshot.time_log_id,
          captured_at: screenshot.captured_at
        });

        return {
          success: true,
          deductedSeconds,
          capturedAt: screenshot.captured_at
        };
      } catch (error) {
        console.error('[DELETE-EST] Error estimating screenshot deduction:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Delete a screenshot and deduct the corresponding time.
   */
  registerDeleteScreenshot() {
    try {
      this.ipcMain.removeHandler('delete-screenshot');
    } catch (e) {}

    this.ipcMain.handle('delete-screenshot', async (event, { screenshotId }) => {
      try {
        if (!screenshotId) {
          return { success: false, error: 'Missing screenshotId' };
        }

        if (!this.config.user_id) {
          return { success: false, error: 'User not authenticated' };
        }

        // Security: verify screenshot belongs to current user
        const { data: screenshot } = await this.supabaseService
          .from('screenshots')
          .select('user_id')
          .eq('id', screenshotId)
          .single();

        if (!screenshot) {
          return { success: false, error: 'Screenshot not found' };
        }

        if (screenshot.user_id !== this.config.user_id) {
          console.warn('Security: user', this.config.user_id, 'tried to delete screenshot owned by', screenshot.user_id);
          return { success: false, error: 'Access denied: can only delete your own screenshots' };
        }

        const { deleteScreenshotWithDeduction } = require('../utils/screenshot-deletion');
        const result = await deleteScreenshotWithDeduction({
          screenshotId,
          deletedBy: this.config.user_id,
          deletionSource: 'desktop_agent',
          supabase: this.supabaseService
        });

        return result;
      } catch (error) {
        console.error('Error deleting screenshot:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Test flow: open an application, wait briefly, then verify if a corresponding
   * app_logs entry exists for the current user in the last few minutes.
   */
  registerTestOpenAppDetection() {
    try { this.ipcMain.removeHandler('test-open-app-detection'); } catch (_) {}
    this.ipcMain.handle('test-open-app-detection', async (event, params = {}) => {
      try {
        const appName = params.appName || (this.process.platform === 'darwin' ? 'Calculator' : 'notepad');
        if (!this.supabaseService) {
          return { success: false, error: 'Database service not available' };
        }
        let effectiveUserId = this.global.currentUserId || this.config?.user_id || this.config?.userId || this.global.config?.user_id;
        // Attempt to resolve user from Supabase if not set yet
        if (!effectiveUserId) {
          try {
            const authClient = this.global.supabase || this.supabaseService;
            if (authClient?.auth?.getUser) {
              const { data } = await authClient.auth.getUser();
              const uid = data?.user?.id;
              if (uid) {
                effectiveUserId = uid;
                this.global.currentUserId = uid;
                if (this.config) this.config.user_id = uid;
                console.log('🔐 [TEST] Resolved and set user ID from Supabase:', uid);
              }
            }
          } catch (e) {
            console.log('⚠️ [TEST] Could not resolve user from Supabase:', e.message);
          }
        }
        if (!effectiveUserId) {
          return { success: false, error: 'User not authenticated' };
        }

        // Attempt to open the app (best-effort)
        try {
          const { exec } = this.require('child_process');
          if (this.process.platform === 'darwin') {
            exec(`open -a "${appName}"`);
          } else if (this.process.platform === 'win32') {
            exec(`start "" "${appName}.exe"`);
          } else {
            exec(`xdg-open "${params.appPath || ''}" || true`);
          }
        } catch (openErr) {
          console.warn('⚠️ [TEST] Failed to open app (continuing to verification):', openErr?.message || openErr);
        }

        // Wait briefly for the app to come to foreground
        await new Promise(resolve => setTimeout(resolve, params.waitMs || 1500));

        // Use the EXACT same flow as real-time detection
        try {
          const detector = global.enhancedAppDetector;
          // Ensure detector has current user context
          try {
            if (detector && detector.config && !detector.config.user_id && this.global.currentUserId) {
              detector.config.user_id = this.global.currentUserId;
              console.log('🔧 [TEST] Updated detector.user_id for test:', detector.config.user_id);
            }
          } catch {}
          if (detector && detector.detectActiveApplication && detector.handleRealTimeAppSwitch) {
            const active = await detector.detectActiveApplication();
            if (active && active.name) {
              await detector.handleRealTimeAppSwitch(active.name, active.title || '');
              // Best-effort immediate sync (uses the same uploadAppLogs path)
              try { await (global.syncManager?.syncQueue?.()); } catch {}
            }
          }
        } catch (handoffErr) {
          console.warn('⚠️ [TEST] Handoff to app detector failed (will still verify):', handoffErr?.message || handoffErr);
        }

        // Allow a short window for queue sync to complete
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify in DB: look back a few minutes
        const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        // Try selecting with detected_at first; if the column doesn't exist, fall back
        let rows;
        {
          const { data, error } = await this.supabaseService
            .from('app_logs')
            .select('id, app_name, window_title, timestamp, detected_at')
            .eq('user_id', effectiveUserId)
            .gte('timestamp', since)
            .order('timestamp', { ascending: false })
            .limit(25);
          if (!error) {
            rows = data || [];
          } else if (/(column|could not find).*detected_at/i.test(error.message || '')) {
            // Fallback: older schema without detected_at
            const retry = await this.supabaseService
              .from('app_logs')
              .select('id, app_name, window_title, timestamp')
              .eq('user_id', effectiveUserId)
              .gte('timestamp', since)
              .order('timestamp', { ascending: false })
              .limit(25);
            if (retry.error) {
              return { success: false, error: retry.error.message };
            }
            rows = retry.data || [];
          } else {
            return { success: false, error: error.message };
          }
        }

        const found = rows.find(r => {
          const n = (r.app_name || '').toLowerCase();
          const target = (appName || '').toLowerCase();
          return n.includes(target);
        });

        return {
          success: true,
          openedApp: appName,
          detected: !!found,
          record: found || null,
          inspected: rows.length
        };
      } catch (error) {
        console.error('❌ [TEST] test-open-app-detection failed:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Get comprehensive system statistics
   */
  registerGetStats() {
    // Check if handler already exists before registering
    try {
      this.ipcMain.removeHandler('get-stats');
      console.log('📡 [DataStatsManager] Removed existing get-stats handler');
    } catch (e) {
      // No existing handler, which is fine
    }
    
    this.ipcMain.handle('get-stats', () => {
      try {
        this.logger && this.logger.info({ category: 'IPC', step: 'get-stats: START' });
        const now = Date.now();
        
        // Add detailed logging for debug console status
        if (process.env.DEBUG_STATUS) {
          console.log(`🔍 [DEBUG-STATUS] Getting stats for debug console...`);
          console.log(`🔍 [DEBUG-STATUS] isTracking: ${this.global.isTracking}`);
          console.log(`🔍 [DEBUG-STATUS] appCaptureInterval exists: ${!!this.global.appCaptureInterval}`);
          console.log(`🔍 [DEBUG-STATUS] urlCaptureManager running: ${!!(this.global.urlCaptureManager && this.global.urlCaptureManager.isRunning)}`);
          console.log(`🔍 [DEBUG-STATUS] lastAppCaptureTime: ${this.global.lastAppCaptureTime}`);
          console.log(`🔍 [DEBUG-STATUS] lastUrlCaptureTime: ${this.global.lastUrlCaptureTime}`);
        }
        
        // Get component statuses
        const componentStatus = {
          desktop_agent: {
            status: 'active',
            lastUpdate: now,
            info: 'Connected to Electron environment'
          },
          screenshots: {
            status: this.global.isTracking && this.global.screenshotInterval ? 'active' : 'inactive',
            lastUpdate: (this.global.activityStats && this.global.activityStats.lastScreenshotTime) || now,
            info: `Total captured: ${(this.global.activityStats && this.global.activityStats.screenshotsCaptured) || 0}`
          },
          mouse: {
            status: this.global.mouseTrackingInterval && (this.global.activityStats && this.global.activityStats.mouseClicks > 0) ? 'active' : 'inactive',
            lastUpdate: this.global.lastActivity,
            info: `Clicks: ${(this.global.activityStats && this.global.activityStats.mouseClicks) || 0}, Movements: ${(this.global.activityStats && this.global.activityStats.mouseMovements) || 0}`
          },
          keyboard: {
            status: this.global.keyboardTrackingInterval && (this.global.activityStats && this.global.activityStats.keystrokes > 0) ? 'active' : 'inactive',
            lastUpdate: this.global.lastActivity,
            info: `Keystrokes: ${(this.global.activityStats && this.global.activityStats.keystrokes) || 0}, Recent activity: ${(this.global.activityStats && this.global.activityStats.keystrokes > 0) ? 'Yes' : 'No'}`
          },
          idle: {
            status: this.global.idleCheckInterval ? 'active' : 'inactive',
            lastUpdate: now,
            info: `Last activity: ${Math.floor((now - this.global.lastActivity) / 1000)}s ago`
          },
          apps: {
            status: this.global.isTracking && this.global.lastAppCaptureTime ? 'active' : (this.global.isTracking ? 'inactive' : 'stopped'),
            lastUpdate: this.global.lastAppCaptureTime ? new Date(this.global.lastAppCaptureTime).getTime() : now,
            info: this.global.isTracking ? (this.global.lastAppCaptureTime ? `Last: ${new Date(this.global.lastAppCaptureTime).toLocaleTimeString()} (Event-driven)` : 'Event-driven - triggers on user activity') : 'Stopped'
          },
          urls: {
            status: this.global.isTracking && this.global.lastUrlCaptureTime ? 'active' : (this.global.isTracking ? 'inactive' : 'stopped'), 
            lastUpdate: this.global.lastUrlCaptureTime ? new Date(this.global.lastUrlCaptureTime).getTime() : now,
            info: this.global.isTracking ? (this.global.lastUrlCaptureTime ? `Last: ${new Date(this.global.lastUrlCaptureTime).toLocaleTimeString()} (Event-driven)` : 'Event-driven - triggers on browser usage') : 'Stopped'
          },
          anticheat: {
            status: this.global.antiCheatDetector ? 'active' : 'error',
            lastUpdate: now,
            info: this.global.antiCheatDetector ? 'Detection system available' : 'antiCheatDetector.getReport is not a function'
          },
          database: {
            status: this.config.supabase_url && this.config.supabase_key ? 'active' : 'error',
            lastUpdate: now,
            info: this.config.supabase_url && this.config.supabase_key ? 'Connected' : "Connection failed • Error invoking remote method 'get-stats': Error: No handler registered for 'get-stats'"
          }
        };

        const result = {
          success: true,
          stats: {
            // Overall tracking status
            trackingStatus: this.global.isTracking ? (this.global.isPaused ? 'paused' : 'active') : 'stopped',
            activityScore: this.calculateActivityPercent ? this.calculateActivityPercent() : 0,
            
            // Activity metrics
            mouseClicks: (this.global.activityStats && this.global.activityStats.mouseClicks) || 0,
            keystrokes: (this.global.activityStats && this.global.activityStats.keystrokes) || 0,
            mouseMovements: (this.global.activityStats && this.global.activityStats.mouseMovements) || 0,
            idleTime: this.calculateIdleTimeSeconds ? this.calculateIdleTimeSeconds() : 0,
            
            // Component statuses
            components: componentStatus,
            
            // System info
            systemInfo: {
              platform: this.process.platform,
              lastActivity: this.global.lastActivity ? new Date(this.global.lastActivity).toISOString() : new Date().toISOString(),
              isTracking: this.global.isTracking,
              isPaused: this.global.isPaused,
              currentSession: (this.global.currentSession && this.global.currentSession.id) || null,
              intervals: {
                screenshot: !!this.global.screenshotInterval,
                idle: !!this.global.idleCheckInterval,
                mouse: !!this.global.mouseTrackingInterval,
                keyboard: !!this.global.keyboardTrackingInterval
              }
            },
            
            // Queue status
            queueStatus: {
              screenshots: (this.global.offlineQueue && this.global.offlineQueue.screenshots && this.global.offlineQueue.screenshots.length) || 0,
              appLogs: (this.global.offlineQueue && this.global.offlineQueue.appLogs && this.global.offlineQueue.appLogs.length) || 0,
              urlLogs: (this.global.offlineQueue && this.global.offlineQueue.urlLogs && this.global.offlineQueue.urlLogs.length) || 0,
              total: ((this.global.offlineQueue && this.global.offlineQueue.screenshots && this.global.offlineQueue.screenshots.length) || 0) + 
                     ((this.global.offlineQueue && this.global.offlineQueue.appLogs && this.global.offlineQueue.appLogs.length) || 0) + 
                     ((this.global.offlineQueue && this.global.offlineQueue.urlLogs && this.global.offlineQueue.urlLogs.length) || 0)
            }
          }
        };
        this.logger && this.logger.info({ category: 'IPC', step: 'get-stats: SUCCESS' });
        return result;
      } catch (error) {
        console.error('❌ Error getting comprehensive stats:', error);
        this.logger && this.logger.error({ category: 'IPC', step: 'get-stats: ERROR', message: error.message });
        return { 
          success: false, 
          error: error.message,
          stats: {
            trackingStatus: 'error',
            activityScore: 0,
            mouseClicks: 0,
            keystrokes: 0,
            mouseMovements: 0,
            idleTime: 0,
            components: {},
            systemInfo: {},
            queueStatus: { screenshots: 0, appLogs: 0, urlLogs: 0, total: 0 }
          }
        };
      }
    });
  }

  /**
   * Fetch enhanced screenshots with filtering and duplicate detection
   */
  registerFetchScreenshotsEnhanced() {
    // Check if handler already exists before registering
    try {
      this.ipcMain.removeHandler('fetch-screenshots-enhanced');
      console.log('📡 [DataStatsManager] Removed existing fetch-screenshots-enhanced handler');
    } catch (e) {
      // No existing handler, which is fine
    }
    
    this.ipcMain.handle('fetch-screenshots-enhanced', async (event, params) => {
      try {
        const { user_id, date, activity_filter = 'all', limit = 50 } = params;
        
        console.log('🔍 [DEBUG] Screenshot DB fetch:', { user_id, date, activity_filter, limit });
        this.safeLog && this.safeLog('📸 Fetching enhanced screenshots for user', user_id, 'on', date, 'activity:', activity_filter);
        
        if (!user_id || !date) {
          return { success: false, error: 'Missing user_id or date parameter', screenshots: [], duplicates: [] };
        }
        
        const effectiveSelf =
          this.global.currentUserId || this.config?.user_id || this.config?.userId;
        const { sameUserId } = require('../utils/backend-screenshots');
        if (effectiveSelf && !sameUserId(user_id, effectiveSelf)) {
          console.warn('🔒 Access denied: user', user_id, '!=', effectiveSelf);
          return { success: false, error: 'Access denied: Can only view your own screenshots', screenshots: [], duplicates: [] };
        }

        const {
          fetchScreenshotsFromBackend,
          usesBackendScreenshots,
          applyActivityFilter,
          buildEnhancedResponse,
        } = require('../utils/backend-screenshots');

        if (usesBackendScreenshots(this.config)) {
          const backendRows = await fetchScreenshotsFromBackend(user_id, this.config, {
            date,
            limit,
          });
          if (Array.isArray(backendRows)) {
            const withImages = backendRows.filter(
              (s) => s.image_url || (s.s3_key && String(s.s3_key).includes('/')),
            );
            const filtered = applyActivityFilter(withImages, activity_filter);
            console.log(`✅ [ENHANCED-SCREENSHOTS] Backend/RDS: ${filtered.length} rows for ${date}`);
            if (filtered.length === 0) {
              console.warn(
                '⚠️ [ENHANCED-SCREENSHOTS] No RDS rows for this date. S3-only uploads (failed screenshot_upload_complete) will not appear until complete succeeds.',
              );
            }
            return buildEnhancedResponse(filtered);
          }
          console.warn('⚠️ [ENHANCED-SCREENSHOTS] Backend fetch failed');
          const { normalizeTenantUserId } = require('../utils/tenant-user-id');
          if (
            (this.config?.auth_provider === 'cognito' || process.env.VITE_AUTH_PROVIDER === 'cognito') &&
            normalizeTenantUserId(user_id)
          ) {
            return { success: true, screenshots: [], duplicates: [] };
          }
          console.warn('⚠️ [ENHANCED-SCREENSHOTS] Falling back to Supabase');
        }
        
        // Build query with activity filtering using service role client for admin access
        let query = this.supabaseService
          .from('screenshots')
          .select('*, is_duplicate, duplicate_reason, duplicate_group_hash, duplicate_hash')
          .eq('user_id', user_id)
          .gte('captured_at', `${date}T00:00:00.000Z`)
          .lt('captured_at', `${date}T23:59:59.999Z`)
          .order('captured_at', { ascending: false });
        
        // Apply activity level filtering
        if (activity_filter !== 'all') {
          if (activity_filter === 'high') {
            query = query.gte('activity_percent', 70);
          } else if (activity_filter === 'medium') {
            query = query.gte('activity_percent', 30).lt('activity_percent', 70);
          } else if (activity_filter === 'low') {
            query = query.lt('activity_percent', 30);
          }
        }
        
        query = query.limit(limit);
        
        const { data: screenshots, error } = await query;

        if (error) {
          console.error('❌ Error fetching enhanced screenshots:', error);
          this.systemMonitor && this.systemMonitor.sendDebugUpdate('ERROR', `Enhanced screenshot fetch failed: ${error.message}`);
          return { success: false, error: error.message, screenshots: [], duplicates: [] };
        }

        // Storage bucket is private; generate signed URLs for renderer display.
        try {
          await Promise.all(
            (screenshots || []).map(async (s) => {
              const filePath = s?.file_path;
              if (!filePath || !this.supabaseService?.storage) return;
              const { data } = await this.supabaseService.storage
                .from('screenshots')
                .createSignedUrl(filePath, 60 * 60);
              if (data?.signedUrl) s.image_url = data.signedUrl;
            })
          );
        } catch (e) {
          console.warn('⚠️ [DataStatsManager] Could not create signed URLs for screenshots:', e?.message || e);
        }

        // Use backend duplicate detection results instead of flawed time-based detection
        const duplicates = [];
        const duplicateGroups = new Map();
        
        (screenshots || []).forEach(screenshot => {
          // Check if screenshot is marked as duplicate by backend analysis
          if (screenshot.is_duplicate) {
            duplicates.push({
              id: screenshot.id,
              reason: screenshot.duplicate_reason || 'Detected by backend analysis',
              group_hash: screenshot.duplicate_group_hash,
              detected_method: 'backend_analysis'
            });
            
            // Group duplicates by hash for better visualization
            if (screenshot.duplicate_group_hash) {
              if (!duplicateGroups.has(screenshot.duplicate_group_hash)) {
                duplicateGroups.set(screenshot.duplicate_group_hash, []);
              }
              duplicateGroups.get(screenshot.duplicate_group_hash).push(screenshot.id);
            }
          }
        });
        
        // Extract just the IDs for backward compatibility
        const duplicateIds = duplicates.map(d => d.id);

        // Rewrite image URLs through proxy when direct Supabase is unreachable
        if (global.useSupabaseProxy && global.supabaseDirectUrl && global.SUPABASE_PROXY_URL) {
          (screenshots || []).forEach(s => {
            if (s.image_url && s.image_url.includes(global.supabaseDirectUrl)) {
              s.image_url = s.image_url.replace(global.supabaseDirectUrl, global.SUPABASE_PROXY_URL);
            }
          });
        }

        console.log('🧠 [DEBUG] Filtered for display:', screenshots?.length || 0, 'screenshots found');
        console.log('🧠 [DEBUG] Query parameters used:', {
          user_id,
          date_range: `${date}T00:00:00.000Z to ${date}T23:59:59.999Z`,
          activity_filter,
          total_found: screenshots?.length || 0
        });
        
        this.safeLog && this.safeLog(`✅ Fetched ${screenshots?.length || 0} enhanced screenshots (${duplicates.length} duplicates detected)`);
        this.systemMonitor && this.systemMonitor.sendDebugUpdate('SCREENSHOT', `Enhanced fetch: ${screenshots?.length || 0} screenshots, ${duplicates.length} duplicates for ${date}`);
        return { 
          success: true, 
          screenshots: screenshots || [],
          duplicates: duplicateIds,
          duplicate_details: duplicates,
          duplicate_groups: Object.fromEntries(duplicateGroups),
          count: screenshots?.length || 0
        };
      } catch (error) {
        console.error('❌ Error in fetch-screenshots-enhanced handler:', error);
        return { success: false, error: error.message, screenshots: [], duplicates: [] };
      }
    });
  }

  /**
   * Get screenshot activity data
   */
  registerGetScreenshotActivity() {
    // Always override any previously registered handler (fallbacks, stubs, etc.)
    try {
      this.ipcMain.removeHandler('get-screenshot-activity');
      console.log('📡 [IPC] Previous get-screenshot-activity handler removed (if existed)');
    } catch {}

    this.ipcMain.handle('get-screenshot-activity', async () => {
      console.log('🔍 [IPC-DEBUG] get-screenshot-activity handler called');
      try {
        this.logger && this.logger.info({ category: 'IPC', step: 'get-screenshot-activity: START' });
        console.log('📸 [IPC] Fetching screenshot activity data...');
      const effectiveUserId = this.global.currentUserId || this.config.user_id || this.config.userId;
      console.log('🔍 [IPC-DEBUG] User ID (effective):', effectiveUserId);
        
        if (!effectiveUserId) {
          return { success: false, error: 'User not authenticated' };
        }

        const { fetchScreenshotsFromBackend, usesBackendScreenshots } = require('../utils/backend-screenshots');

        if (usesBackendScreenshots(this.config)) {
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const rows = await fetchScreenshotsFromBackend(effectiveUserId, this.config, {
            startIso: since,
            endIso: new Date().toISOString(),
            limit: 20,
          });
          if (Array.isArray(rows)) {
            console.log(`✅ [IPC] Backend screenshot activity: ${rows.length} records`);
            return { success: true, data: rows, source: 'backend' };
          }
          console.warn('⚠️ [IPC] Backend screenshot activity failed, trying Supabase');
        }

        if (!this.supabaseService) {
          throw new Error('Supabase service client not initialized');
        }
        
        const { data, error } = await this.supabaseService
          .from('screenshots')
          .select('file_path, image_url, captured_at, activity_percent, app_name, window_title, time_log_id, mouse_clicks, keystrokes, mouse_movements, is_duplicate, duplicate_reason, duplicate_group_hash')
          .eq('user_id', effectiveUserId)
          .gte('captured_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .order('captured_at', { ascending: false })
          .limit(20);
        
        if (error) {
          console.error('❌ Error fetching screenshot activity:', error);
          return { success: false, error: error.message };
        }
        
        console.log(`✅ [IPC] Fetched ${data?.length || 0} screenshot activity records (Supabase)`);
        this.logger && this.logger.info({ category: 'IPC', step: 'get-screenshot-activity: SUCCESS', ctx: { records: data?.length || 0 } });
        return { success: true, data: data || [], source: 'supabase' };
        
      } catch (error) {
        console.error('❌ Error in get-screenshot-activity:', error);
        this.logger && this.logger.error({ category: 'IPC', step: 'get-screenshot-activity: ERROR', message: error.message });
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Fetch screenshots (basic version)
   */
  registerFetchScreenshots() {
    // Check if handler already exists before registering
    try {
      this.ipcMain.removeHandler('fetch-screenshots');
      console.log('📡 [DataStatsManager] Removed existing fetch-screenshots handler');
    } catch (e) {
      // No existing handler, which is fine
    }
    
    this.ipcMain.handle('fetch-screenshots', async (event, params) => {
      try {
        // Handle both object and direct parameters
        let userId, date, limit;
        
        if (typeof params === 'object' && params !== null) {
          userId = params.user_id || params.userId;
          date = params.date;
          limit = params.limit || 50;
        } else {
          // Fallback for direct parameters
          userId = params;
          date = arguments[2];
          limit = arguments[3] || 50;
        }
        
        this.safeLog && this.safeLog('📸 Fetching screenshots for user', userId, 'on', date);
        
        if (!userId || !date) {
          return { success: false, error: 'Missing userId or date parameter', screenshots: [] };
        }
        
        // SECURITY CHECK: Ensure user can only access their own screenshots
        if (this.config.user_id && userId !== this.config.user_id) {
          console.warn('🔒 Security violation: User', this.config.user_id, 'attempted to access screenshots for user', userId);
          return { success: false, error: 'Access denied: Can only view your own screenshots', screenshots: [] };
        }
        
        // Query screenshots from database using service role client for admin access
        const { data: screenshots, error } = await this.supabaseService
          .from('screenshots')
          .select('*')
          .eq('user_id', userId)
          .gte('captured_at', `${date}T00:00:00.000Z`)
          .lt('captured_at', `${date}T23:59:59.999Z`)
          .order('captured_at', { ascending: false })
          .limit(limit);

        if (error) {
          console.error('❌ Error fetching screenshots:', error);
          this.systemMonitor && this.systemMonitor.sendDebugUpdate('ERROR', `Screenshot fetch failed: ${error.message}`);
          return { success: false, error: error.message, screenshots: [] };
        }

        // Storage bucket is private; generate signed URLs for renderer display.
        try {
          await Promise.all(
            (screenshots || []).map(async (s) => {
              const filePath = s?.file_path;
              if (!filePath || !this.supabaseService?.storage) return;
              const { data } = await this.supabaseService.storage
                .from('screenshots')
                .createSignedUrl(filePath, 60 * 60);
              if (data?.signedUrl) s.image_url = data.signedUrl;
            })
          );
        } catch (e) {
          console.warn('⚠️ [DataStatsManager] Could not create signed URLs for screenshots:', e?.message || e);
        }

        // Rewrite image URLs through proxy when direct Supabase is unreachable
        if (global.useSupabaseProxy && global.supabaseDirectUrl && global.SUPABASE_PROXY_URL) {
          (screenshots || []).forEach(s => {
            if (s.image_url && s.image_url.includes(global.supabaseDirectUrl)) {
              s.image_url = s.image_url.replace(global.supabaseDirectUrl, global.SUPABASE_PROXY_URL);
            }
          });
        }

        this.safeLog && this.safeLog(`✅ Fetched ${screenshots?.length || 0} screenshots`);
        this.systemMonitor && this.systemMonitor.sendDebugUpdate('SCREENSHOT', `Fetched ${screenshots?.length || 0} screenshots for ${date}`);
        return { 
          success: true, 
          screenshots: screenshots || [],
          count: screenshots?.length || 0
        };
      } catch (error) {
        console.error('❌ Error in fetch-screenshots handler:', error);
        return { success: false, error: error.message, screenshots: [] };
      }
    });
  }

  /**
   * Set current user ID
   */
  registerSetCurrentUserId() {
    // Check if handler already exists before registering
    try {
      this.ipcMain.removeHandler('set-current-user-id');
      console.log('📡 [DataStatsManager] Removed existing set-current-user-id handler');
    } catch (e) {
      // No existing handler, which is fine
    }
    
    this.ipcMain.handle('set-current-user-id', async (event, userId, userRole) => {
      try {
        const { normalizeTenantUserId } = require('../utils/tenant-user-id');
        const normalizedUserId = normalizeTenantUserId(userId);
        if (!normalizedUserId) {
          console.warn('⚠️ [IPC] Refusing non-integer user id:', userId);
          return { success: false, error: 'Invalid user id (expected integer)' };
        }

        console.log('👤 [IPC] Setting current user ID:', normalizedUserId, 'Role:', userRole);
        
        // Set user ID in global state (multiple formats for compatibility)
        this.global.currentUserId = normalizedUserId;
        this.global.userId = normalizedUserId;
        this.global.currentUserRole = userRole || 'employee';
        
        // Update configuration if available
        if (this.global.config) {
          this.global.config.user_id = normalizedUserId;
          this.global.config.userId = normalizedUserId;
        }
        if (this.config) {
          this.config.user_id = normalizedUserId;
          this.config.userId = normalizedUserId;
        }
        
        // Update tracking controller if available
        if (this.global.trackingController) {
          this.global.trackingController.userId = userId;
        }
        
        // Optional: auto-start tracking for QA when enabled via env flag
        try {
          if (process.env.AUTO_START_TRACKING === 'true' && !this.global.isTracking) {
            console.log('🎬 [DATA-STATS-MANAGER] AUTO_START_TRACKING enabled — starting tracking after user set');
            const projectId = this.global.currentProjectId || null;
            const result = this.global.trackingManager?.startTracking
              ? await this.global.trackingManager.startTracking(projectId)
              : await this.global.startTracking?.(projectId);
            console.log('🎬 [DATA-STATS-MANAGER] AUTO_START_TRACKING result:', result?.success, 'timeLogId:', result?.timeLogId);
          }
        } catch (e) {
          console.log('⚠️ [DATA-STATS-MANAGER] AUTO_START_TRACKING failed:', e.message);
        }
        
        console.log('✅ [IPC] Current user ID and role set successfully in all locations');
        return { success: true, userId: normalizedUserId };
      } catch (error) {
        console.error('❌ Error setting current user ID:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Get URL activity data
   */
  registerGetUrlActivity() {
    // Remove any existing handler first to prevent duplicate registration
    this.ipcMain.removeAllListeners('get-url-activity');
    console.log('📡 [IPC] Registering get-url-activity handler');
    
    this.ipcMain.handle('get-url-activity', async () => {
      try {
        console.log('🌐 [IPC] Fetching URL activity data...');
        
        if (!this.supabaseService) {
          throw new Error('Supabase service client not initialized');
        }
        
        // Get effective user ID from multiple sources
        const effectiveUserId = this.global.currentUserId || this.config?.user_id || this.config?.userId;
        
        if (!effectiveUserId) {
          return { success: false, error: 'User not authenticated' };
        }
        
        // Get URL logs from last 24 hours for current user
        // Some rows store URL in `site_url`, others in `url` → select both and normalize
        let query = this.supabaseService
          .from('url_logs')
          .select('id, url, site_url, title, browser, timestamp, time_log_id, domain, user_id')
          .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          // Removed problematic .or() clause - will filter in JS instead
          .order('timestamp', { ascending: false })
          .limit(50);
        
        // Filter out internal noise values when present on either column
        query = query
          .not('site_url', 'ilike', '%browser-activity-detected.local%')
          .not('url', 'ilike', '%browser-activity-detected.local%');
        
        // Always filter to current user's data only (even for admins in desktop agent)
        query = query.eq('user_id', effectiveUserId);
        
        const { data, error } = await query;
        
        if (error) {
          console.error('❌ Error fetching URL activity:', error);
          return { success: false, error: error.message };
        }
        
        // Filter out rows where both url and site_url are null, then normalize
        const normalized = (data || [])
          .filter(row => row.url || row.site_url)  // Drop rows where both are null
          .map((row) => ({
            ...row,
            url: row.url || row.site_url || null,
          }));
        
        console.log(`✅ [IPC] Fetched ${normalized.length} URL activity records`);
        return { success: true, data: normalized };
        
      } catch (error) {
        console.error('❌ Error in get-url-activity:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Get URL history data with date range filtering
   */
  registerGetUrlHistory() {
    this.ipcMain.handle('get-url-history', async (event, params) => {
      try {
        // Windows-specific logging
        if (process.platform === 'win32' && process.env.LOG_URL_VERBOSE === 'true') {
          console.log('[WIN.URL.HISTORY.REQ] Fetching URL history data...', {
            userId: this.global.currentUserId || this.config?.user_id,
            params: params
          });
        } else {
          console.log('📅 [IPC] Fetching URL history data...', params);
        }
        
        if (!this.supabaseService) {
          throw new Error('Supabase service client not initialized');
        }
        
        // Get effective user ID from multiple sources
        const effectiveUserId = this.global.currentUserId || this.config?.user_id || this.config?.userId;
        
        if (!effectiveUserId) {
          return { success: false, error: 'User not authenticated' };
        }
        
        const { startDate, endDate } = params || {};
        
        // Default to today if no dates provided
        const start = startDate ? new Date(startDate) : new Date();
        const end = endDate ? new Date(endDate) : new Date();
        
        // Set default time ranges if only dates provided
        if (!startDate) {
          start.setHours(0, 0, 0, 0);
        }
        if (!endDate) {
          end.setHours(23, 59, 59, 999);
        }
        
        console.log(`🔍 [URL-HISTORY] Fetching URLs from ${start.toISOString()} to ${end.toISOString()}`);
        
        // Get URL logs for the specified date range (timestamp-based)
        const baseSelect = 'id, url, site_url, title, domain, browser, timestamp, time_log_id, user_id';
        let queryTs = this.supabaseService
          .from('url_logs')
          .select(baseSelect)
          .gte('timestamp', start.toISOString())
          .lte('timestamp', end.toISOString())
          .eq('user_id', effectiveUserId)
          .order('timestamp', { ascending: false })
          .limit(500);
        
        // Filter out internal noise values when present on either column
        queryTs = queryTs
          .not('site_url', 'ilike', '%browser-activity-detected.local%')
          .not('url', 'ilike', '%browser-activity-detected.local%');
        
        const { data: dataTs, error } = await queryTs;
        const data = dataTs || [];
        
        if (error) {
          if (process.platform === 'win32' && process.env.LOG_URL_VERBOSE === 'true') {
            console.log('[WIN.URL.HISTORY.RES] Database error:', error.message);
          } else {
            console.error('❌ Error fetching URL history:', error);
          }
          return { success: false, error: error.message };
        }
        
        // 🔧 FIX: Non-browser web apps (chat, email, etc.) should be excluded from URL history
        const nonBrowserWebAppPatterns = [
          /^cliq\b/i, /^slack\b/i, /^discord\b/i, /^whatsapp\b/i,
          /^telegram\b/i, /^signal\b/i, /^skype\b/i, /^messenger\b/i,
          /^mattermost\b/i, /^rocket\.chat\b/i, /^hangouts\b/i,
          /\bmicrosoft teams\b/i, /\bgoogle chat\b/i, /\bgoogle meet\b/i,
          /\bzoom meeting\b/i,
          /\bzoho mail\b/i, /\byahoo mail\b/i, /\bprotonmail\b/i,
          /\boutlook\b.*\b(inbox|mail|calendar)\b/i,
          /\binbox\b.*\bzoho\b/i, /\binbox\b.*\bgmail\b/i,
        ];
        
        // Filter out rows where both url and site_url are null, then normalize
        const normalized = (data || [])
          .filter(row => row.url || row.site_url)  // Drop rows where both are null
          .filter(row => {
            // Filter out non-browser web app URLs by title
            if (row.title) {
              const titleForFilter = row.title.trim();
              const isWebApp = nonBrowserWebAppPatterns.some(p => p.test(titleForFilter));
              if (isWebApp) return false;
            }
            return true;
          })
          .map((row) => ({
            ...row,
            url: row.url || row.site_url || null,
            // Use authoritative timestamp column
            time: row.timestamp || null
          }));
        
        if (process.platform === 'win32' && process.env.LOG_URL_VERBOSE === 'true') {
          console.log(`[WIN.URL.HISTORY.RES] rows=${normalized.length} (from ${(data || []).length} raw)`);
        } else {
          console.log(`✅ [IPC] Fetched ${normalized.length} URL history records`);
        }
        const tsCount = (data || []).length;
        console.log('🧩 [PARSE-DB] URL-HISTORY: raw counts', { timestamped: tsCount });
        if (normalized.length > 0) {
          console.log('🧭 [URL-HISTORY] Sample rows:', normalized.slice(0, 3));
        }
        return { success: true, data: normalized };
        
      } catch (error) {
        console.error('❌ Error in get-url-history:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Get app history data with date range filtering
   */
  registerGetAppHistory() {
    this.ipcMain.handle('get-app-history', async (event, params) => {
      try {
        console.log('📱 [IPC] Fetching app history data...', params);
        console.log('🔍 [IPC DEBUG] User ID sources:', {
          globalCurrentUserId: this.global.currentUserId,
          configUserId: this.config?.user_id,
          configUserIdAlt: this.config?.userId,
          globalConfigUserId: this.global.config?.user_id
        });
        
        if (!this.supabaseService) {
          throw new Error('Supabase service client not initialized');
        }
        
        // Get effective user ID from multiple sources
        const effectiveUserId = this.global.currentUserId || this.config?.user_id || this.config?.userId || this.global.config?.user_id;
        
        console.log('🔍 [IPC DEBUG] Effective user ID:', effectiveUserId);
        
        // Check if Supabase service is ready with better error handling
        if (!this.supabaseService) {
          console.warn('⚠️ [APP-HISTORY] Supabase service not initialized, waiting for initialization...');
          // Wait longer for service initialization with multiple retries
          for (let i = 0; i < 10; i++) {
            await new Promise(resolve => setTimeout(resolve, 200));
            if (this.supabaseService) {
              console.log('✅ [APP-HISTORY] Supabase service initialized after', (i + 1) * 200, 'ms');
              break;
            }
          }
          if (!this.supabaseService) {
            console.error('❌ [APP-HISTORY] Supabase service failed to initialize after 2 seconds');
            return { success: false, error: 'Database service not available - initialization timeout' };
          }
        }
        
        // Fallback: resolve user from Supabase if globals/config haven't synced yet
        if (!effectiveUserId) {
          try {
            const authClient = this.global.supabase || this.supabaseService;
            if (authClient?.auth?.getUser) {
              const { data } = await authClient.auth.getUser();
              const uid = data?.user?.id;
              if (uid) {
                effectiveUserId = uid;
                this.global.currentUserId = uid;
                if (this.config) this.config.user_id = uid;
                console.log('🔐 [APP-HISTORY] Resolved and set user ID from Supabase:', uid);
              }
            }
          } catch (e) {
            console.log('⚠️ [APP-HISTORY] Could not resolve user from Supabase:', e.message);
          }
        }

        if (!effectiveUserId) {
          return { success: false, error: 'User not authenticated' };
        }
        
        const { startDate, endDate } = params || {};
        
        // Default to today if no dates provided
        const start = startDate ? new Date(startDate) : new Date();
        const end = endDate ? new Date(endDate) : new Date();
        
        // Set default time ranges if only dates provided
        if (!startDate) {
          start.setHours(0, 0, 0, 0);
        }
        if (!endDate) {
          end.setHours(23, 59, 59, 999);
        }
        
        console.log(`🔍 [APP-HISTORY] Fetching apps from ${start.toISOString()} to ${end.toISOString()}`);
        
        // Get app logs for the specified date range
        // Include detected_at (ms epoch) and prefer ordering by it when present
        let query = this.supabaseService
          .from('app_logs')
          .select('id, app_name, window_title, app_path, timestamp, detected_at, created_at, duration_seconds, category, time_log_id, user_id')
          .gte('timestamp', start.toISOString())
          .lte('timestamp', end.toISOString())
          .not('app_name', 'is', null)
          .eq('user_id', effectiveUserId)
          // Primary: detected_at desc (nulls last). Secondary: timestamp desc.
          .order('detected_at', { ascending: false, nullsFirst: false })
          .order('timestamp', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1000); // Limit to prevent excessive data transfer
        
        let data, error;
        try {
          const result = await query;
          data = result.data;
          error = result.error;
          if (error) throw error;
        } catch (e) {
          if (/(column|could not find).*detected_at/i.test(e.message || '')) {
            // Fallback: older schema without detected_at
            console.log('⚠️ [APP-HISTORY] detected_at column not found, using fallback query');
            const fallbackResult = await this.supabaseService
              .from('app_logs')
              .select('id, app_name, window_title, app_path, timestamp, created_at, duration_seconds, category, time_log_id, user_id')
              .gte('timestamp', start.toISOString())
              .lte('timestamp', end.toISOString())
              .not('app_name', 'is', null)
              .eq('user_id', effectiveUserId)
              .order('timestamp', { ascending: false })
              .order('created_at', { ascending: false })
              .limit(1000);
            data = fallbackResult.data;
            error = fallbackResult.error;
            // Extra fallback if created_at is also missing
            if (error && /(column|could not find).*created_at/i.test(error.message || '')) {
              console.log('⚠️ [APP-HISTORY] created_at column not found, using minimal fallback query');
              const fb2 = await this.supabaseService
                .from('app_logs')
                .select('id, app_name, window_title, app_path, timestamp, duration_seconds, category, time_log_id, user_id')
                .gte('timestamp', start.toISOString())
                .lte('timestamp', end.toISOString())
                .not('app_name', 'is', null)
                .eq('user_id', effectiveUserId)
                .order('timestamp', { ascending: false })
                .limit(1000);
              data = fb2.data;
              error = fb2.error;
            }
          } else if (/(column|could not find).*created_at/i.test(e.message || '')) {
            // If only created_at missing, retry without it
            console.log('⚠️ [APP-HISTORY] created_at column not found, retrying without it');
            const fb2 = await this.supabaseService
              .from('app_logs')
              .select('id, app_name, window_title, app_path, timestamp, duration_seconds, category, time_log_id, user_id')
              .gte('timestamp', start.toISOString())
              .lte('timestamp', end.toISOString())
              .not('app_name', 'is', null)
              .eq('user_id', effectiveUserId)
              .order('timestamp', { ascending: false })
              .limit(1000);
            data = fb2.data;
            error = fb2.error;
          } else {
            error = e;
          }
        }
        
        if (error) {
          console.error('❌ Error fetching app history:', error);
          return { success: false, error: error.message };
        }
        
        console.log(`✅ [IPC] Fetched ${data?.length || 0} app history records`);
        console.log('🔍 [IPC DEBUG] Sample app data:', data?.slice(0, 3)?.map(d => ({
          app_name: d.app_name,
          timestamp: d.timestamp,
          user_id: d.user_id,
          time_log_id: d.time_log_id
        })));
        console.log('🧩 [PARSE-DB] AppHistory: start enrich/sort', { records: data?.length || 0 });
        // Calculate statistics (estimate durations if missing)
        const enriched = this.enrichWithEstimatedDurations(data || []);

        // Enforce deterministic sort on the server side as well
        const sorted = [...enriched].sort((a, b) => {
          const aDet = a && a.detected_at != null ? Number(a.detected_at) : Date.parse(a?.timestamp || 0);
          const bDet = b && b.detected_at != null ? Number(b.detected_at) : Date.parse(b?.timestamp || 0);
          if (!isNaN(bDet) && !isNaN(aDet) && bDet !== aDet) return bDet - aDet;
          const aTs = Date.parse(a?.timestamp || 0);
          const bTs = Date.parse(b?.timestamp || 0);
          if (!isNaN(bTs) && !isNaN(aTs) && bTs !== aTs) return bTs - aTs;
          if (a?.id && b?.id) return String(b.id).localeCompare(String(a.id));
          return 0;
        });

        const stats = this.calculateAppHistoryStats(sorted);
        
        return { 
          success: true, 
          data: sorted, 
          stats: stats 
        };
        
      } catch (error) {
        console.error('❌ Error in get-app-history:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Calculate app history statistics
   */
  calculateAppHistoryStats(appData) {
    if (!appData || appData.length === 0) {
      return {
        totalSessions: 0,
        totalDuration: 0,
        uniqueApps: 0,
        productivityScore: 0,
        topApps: []
      };
    }

    // Calculate basic stats
    const totalSessions = appData.length;
    const totalDuration = appData.reduce((sum, app) => sum + (app.duration_seconds || 0), 0);
    const uniqueApps = new Set(appData.map(app => app.app_name)).size;

    // Calculate productivity score
    const productivityCategories = ['development', 'productivity', 'communication'];
    const productiveTime = appData
      .filter(app => productivityCategories.includes(app.category || this.categorizeApp(app.app_name)))
      .reduce((sum, app) => sum + (app.duration_seconds || 0), 0);
    const productivityScore = totalDuration > 0 ? Math.round((productiveTime / totalDuration) * 100) : 0;

    // Calculate top apps
    const appTotals = {};
    appData.forEach(app => {
      const appName = app.app_name || 'Unknown';
      if (!appTotals[appName]) {
        appTotals[appName] = { duration: 0, sessions: 0 };
      }
      appTotals[appName].duration += app.duration_seconds || 0;
      appTotals[appName].sessions += 1;
    });

    const topApps = Object.entries(appTotals)
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);

    return {
      totalSessions,
      totalDuration,
      uniqueApps,
      productivityScore,
      topApps
    };
  }

  /**
   * If duration_seconds is missing, estimate it by diffing consecutive timestamps per user
   * and capping each session to 5 minutes to avoid runaway durations.
   */
  enrichWithEstimatedDurations(appData) {
    if (!Array.isArray(appData) || appData.length === 0) return [];
    // Clone and sort by timestamp ascending
    const items = appData.map(x => ({ ...x })).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const MAX_SEGMENT_SECONDS = 5 * 60; // 5 minutes
    for (let i = 0; i < items.length; i++) {
      if (!items[i].duration_seconds || items[i].duration_seconds === 0) {
        const currentTs = new Date(items[i].timestamp).getTime();
        const nextTs = i < items.length - 1 ? new Date(items[i + 1].timestamp).getTime() : currentTs;
        let diff = Math.max(0, Math.floor((nextTs - currentTs) / 1000));
        if (diff === 0) diff = 60; // default to 1 minute if no next entry
        items[i].duration_seconds = Math.min(diff, MAX_SEGMENT_SECONDS);
      }
    }
    return items;
  }

  /**
   * Categorize an app by name (helper function)
   */
  categorizeApp(appName) {
    if (!appName) return 'other';
    
    const app = appName.toLowerCase();
    
    // Development
    if (app.includes('code') || app.includes('studio') || app.includes('intellij') || 
        app.includes('atom') || app.includes('sublime') || app.includes('vim') || 
        app.includes('terminal') || app.includes('git') || app.includes('docker') ||
        app.includes('xcode') || app.includes('android studio')) {
      return 'development';
    }
    
    // Communication
    if (app.includes('slack') || app.includes('teams') || app.includes('zoom') || 
        app.includes('skype') || app.includes('discord') || app.includes('mail') || 
        app.includes('outlook') || app.includes('gmail') || app.includes('telegram') ||
        app.includes('whatsapp') || app.includes('messenger')) {
      return 'communication';
    }
    
    // Browser
    if (app.includes('chrome') || app.includes('firefox') || app.includes('safari') || 
        app.includes('edge') || app.includes('opera') || app.includes('brave')) {
      return 'browser';
    }
    
    // Entertainment
    if (app.includes('spotify') || app.includes('music') || app.includes('video') || 
        app.includes('netflix') || app.includes('youtube') || app.includes('game') ||
        app.includes('steam') || app.includes('twitch') || app.includes('vlc')) {
      return 'entertainment';
    }
    
    // Productivity
    if (app.includes('office') || app.includes('word') || app.includes('excel') || 
        app.includes('powerpoint') || app.includes('notion') || app.includes('evernote') ||
        app.includes('trello') || app.includes('asana') || app.includes('figma') ||
        app.includes('sketch') || app.includes('photoshop') || app.includes('illustrator')) {
      return 'productivity';
    }
    
    // System
    if (app.includes('finder') || app.includes('explorer') || app.includes('system') || 
        app.includes('settings') || app.includes('control panel') || app.includes('task manager')) {
      return 'system';
    }
    
    return 'other';
  }

  /**
   * Get app activity data
   */
  registerGetAppActivity() {
    // Check if handler already exists to prevent duplicate registration
    if (this.ipcMain.listenerCount('get-app-activity') > 0) {
      console.log('⚠️ [IPC] get-app-activity handler already exists, skipping registration');
      return;
    }
    
    this.ipcMain.handle('get-app-activity', async () => {
      try {
        console.log('📱 [IPC] Fetching app activity data...');
        
        if (!this.supabaseService) {
          throw new Error('Supabase service client not initialized');
        }
        
        // Get effective user ID from multiple sources
        const effectiveUserId = this.global.currentUserId || this.config?.user_id || this.config?.userId;
        
        if (!effectiveUserId) {
          return { success: false, error: 'User not authenticated' };
        }
        
        // Get app logs from last 24 hours for current user
        const { data, error } = await this.supabaseService
          .from('app_logs')
          .select('app_name, window_title, timestamp, time_log_id')
          .eq('user_id', effectiveUserId)
          .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .order('timestamp', { ascending: false })
          .limit(50);
        
        if (error) {
          console.error('❌ Error fetching app activity:', error);
          return { success: false, error: error.message };
        }
        
        console.log(`✅ [IPC] Fetched ${data?.length || 0} app activity records`);
        return { success: true, data: data || [] };
        
      } catch (error) {
        console.error('❌ Error in get-app-activity:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Get today's comprehensive statistics
   */
  registerGetTodayStats() {
    this.ipcMain.handle('get-today-stats', async () => {
      try {
        console.log('📊 [TODAY-STATS] Fetching today\'s comprehensive statistics...');
        
        if (!this._usesRdsBackend() && !this.supabaseService) {
          return { success: false, error: 'Database service not available' };
        }

        // Get effective user ID from multiple sources
        const effectiveUserId = this.global.currentUserId || this.config?.user_id || this.config?.userId;
        
        if (!effectiveUserId) {
          console.error('❌ [TODAY-STATS] No user ID available');
          return { success: false, error: 'User ID not available' };
        }

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        console.log(`📊 [TODAY-STATS] Fetching stats for user ${effectiveUserId} from ${todayStart.toISOString()} to ${todayEnd.toISOString()}`);

        // Fetch all data in parallel
        const timeLogsResult = await this._fetchTimeLogs(effectiveUserId, {
          start: todayStart.toISOString(),
          end: new Date(todayEnd.getTime() + 1).toISOString(),
          select: 'start_time, end_time, idle_seconds',
        });

        let screenshots = [];
        if (this._usesRdsBackend()) {
          try {
            const { fetchScreenshotsFromBackend } = require('../utils/backend-screenshots');
            screenshots = await fetchScreenshotsFromBackend(effectiveUserId, this.config, {
              startIso: todayStart.toISOString(),
              endIso: todayEnd.toISOString(),
            }) || [];
          } catch (err) {
            console.warn('⚠️ [TODAY-STATS] Backend screenshots read failed:', err.message);
          }
        } else if (this.supabaseService) {
          const screenshotsResult = await this.supabaseService
            .from('screenshots')
            .select('id, captured_at, activity_percent, keystrokes, mouse_clicks, mouse_movements')
            .eq('user_id', effectiveUserId)
            .gte('captured_at', todayStart.toISOString())
            .lte('captured_at', todayEnd.toISOString());
          if (screenshotsResult.error) {
            console.warn('⚠️ [TODAY-STATS] Screenshots query failed:', screenshotsResult.error.message);
          }
          screenshots = screenshotsResult.data || [];
        }

        const appLogsResult = await this._fetchAppLogs(effectiveUserId, {
          start: todayStart.toISOString(),
          end: todayEnd.toISOString(),
        });
        const urlLogsResult = await this._fetchUrlLogs(effectiveUserId, {
          start: todayStart.toISOString(),
          end: todayEnd.toISOString(),
        });

        const timeLogs = timeLogsResult.data || [];
        const appLogs = appLogsResult.data || [];
        const urlLogs = urlLogsResult.data || [];
        let activeTime = 0;
        let idleTime = 0;
        let totalTime = 0;
        
        timeLogs.forEach(log => {
          if (log.start_time && log.end_time) {
            const duration = (new Date(log.end_time) - new Date(log.start_time)) / 1000; // in seconds
            totalTime += duration;
            
            if (log.is_idle) {
              idleTime += duration;
            } else {
              activeTime += duration;
            }
          }
          
          // Add additional idle seconds if tracked separately
          if (log.idle_seconds) {
            idleTime += log.idle_seconds;
          }
        });
        
        // Cap total time to 24h to avoid runaway aggregation
        const MAX_DAY_SECONDS = 24 * 60 * 60;
        let stats = {
          activeTime: Math.round(Math.min(activeTime, MAX_DAY_SECONDS)), // in seconds
          idleTime: Math.round(Math.min(idleTime, MAX_DAY_SECONDS)), // in seconds
          totalTime: Math.round(Math.min(totalTime, MAX_DAY_SECONDS)), // in seconds
          screenshotCount: screenshots.length,
          appCount: new Set(appLogs.map(log => log.app_name).filter(Boolean)).size,
          totalClicks: screenshots.reduce((sum, screenshot) => sum + (screenshot.mouse_clicks || 0), 0),
          totalKeystrokes: screenshots.reduce((sum, screenshot) => sum + (screenshot.keystrokes || 0), 0),
          totalMouseMovements: screenshots.reduce((sum, screenshot) => sum + (screenshot.mouse_movements || 0), 0),
          urlCount: urlLogs.length,
          domainCount: new Set(urlLogs.map(log => {
            try { return new URL(log.url).hostname; } catch { return null; }
          }).filter(Boolean)).size
        };

        // Fallback: if active/idle time not recorded in time_logs, estimate from events
        if ((stats.activeTime + stats.idleTime) === 0) {
          try {
            // Collect event timestamps
            const screenshotEvents = (screenshots || [])
              .map(s => new Date(s.captured_at || s.created_at).getTime())
              .filter(t => Number.isFinite(t))
              .sort((a, b) => a - b);
            const appEvents = (appLogs || [])
              .map(a => new Date(a.started_at || a.timestamp || a.ended_at).getTime())
              .filter(t => Number.isFinite(t))
              .sort((a, b) => a - b);
            const urlEvents = (urlLogs || [])
              .map(u => new Date(u.timestamp).getTime())
              .filter(t => Number.isFinite(t))
              .sort((a, b) => a - b);

            const allEvents = [...screenshotEvents, ...appEvents, ...urlEvents].sort((a, b) => a - b);
            const coverageSeconds = allEvents.length >= 2 ? Math.max(0, Math.floor((allEvents[allEvents.length - 1] - allEvents[0]) / 1000)) : 0;

            // Estimate screenshot interval via median diff (fallback 300s)
            let estimatedIntervalSec = 300;
            if (screenshotEvents.length >= 2) {
              const diffs = [];
              for (let i = 1; i < screenshotEvents.length; i++) {
                const d = Math.max(10, Math.floor((screenshotEvents[i] - screenshotEvents[i - 1]) / 1000));
                diffs.push(d);
              }
              diffs.sort((a, b) => a - b);
              const mid = Math.floor(diffs.length / 2);
              estimatedIntervalSec = diffs.length % 2 ? diffs[mid] : Math.floor((diffs[mid - 1] + diffs[mid]) / 2);
              // Clamp to reasonable range 60s..900s
              estimatedIntervalSec = Math.max(60, Math.min(900, estimatedIntervalSec));
            }

            // Estimate active time from screenshots' activity_percent
            let estActive = 0;
            if (screenshotEvents.length > 0) {
              const screenshotsSorted = [...screenshots].sort((a, b) => new Date(a.captured_at || a.created_at) - new Date(b.captured_at || b.created_at));
              for (let i = 0; i < screenshotsSorted.length; i++) {
                const curTs = new Date(screenshotsSorted[i].captured_at || screenshotsSorted[i].created_at).getTime();
                const nextTs = i < screenshotsSorted.length - 1 ? new Date(screenshotsSorted[i + 1].captured_at || screenshotsSorted[i + 1].created_at).getTime() : curTs + estimatedIntervalSec * 1000;
                const dt = Math.max(0, Math.min(estimatedIntervalSec, Math.floor((nextTs - curTs) / 1000)));
                const ap = Number(screenshotsSorted[i].activity_percent) || 0;
                estActive += Math.floor(dt * Math.max(0, Math.min(100, ap)) / 100);
              }
            }

            const estIdle = Math.max(0, coverageSeconds - estActive);
            if (coverageSeconds > 0) {
              stats.activeTime = Math.min(MAX_DAY_SECONDS, estActive);
              stats.idleTime = Math.min(MAX_DAY_SECONDS, estIdle);
              stats.totalTime = Math.min(MAX_DAY_SECONDS, coverageSeconds);
            }
          } catch (e) {
            console.warn('⚠️ [TODAY-STATS] Fallback active/idle estimation failed:', e?.message || e);
          }
        }

        console.log('✅ [TODAY-STATS] Statistics calculated:', stats);
        return { success: true, data: stats };
        
      } catch (error) {
        console.error('❌ [TODAY-STATS] Error fetching today\'s stats:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Get today's screenshots with metadata
   */
  registerGetTodayScreenshots() {
    this.ipcMain.handle('get-today-screenshots', async () => {
      try {
        console.log('📸 [TODAY-SCREENSHOTS] Fetching today\'s screenshots...');

        const effectiveUserId = this.global.currentUserId || this.config?.user_id || this.config?.userId;

        if (!effectiveUserId) {
          console.warn('⚠️ [TODAY-SCREENSHOTS] No user ID available — returning empty list');
          return { success: true, data: [] };
        }

        const {
          fetchTodayScreenshotsFromBackend,
          usesBackendScreenshots,
        } = require('../utils/backend-screenshots');

        if (usesBackendScreenshots(this.config)) {
          const backendRows = await fetchTodayScreenshotsFromBackend(effectiveUserId, this.config);
          if (Array.isArray(backendRows) && backendRows.length >= 0) {
            const withImages = backendRows.filter(
              (s) => s.image_url || (s.s3_key && String(s.s3_key).includes('/')),
            );
            console.log(`✅ [TODAY-SCREENSHOTS] Backend/RDS: ${withImages.length} screenshots`);
            return { success: true, data: withImages, source: 'backend' };
          }
          console.warn('⚠️ [TODAY-SCREENSHOTS] Backend fetch failed, falling back to Supabase');
        }

        if (!this.supabaseService) {
          console.error('❌ [TODAY-SCREENSHOTS] No backend or Supabase available');
          return { success: false, error: 'Database service not available' };
        }

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const { data, error } = await this.supabaseService
          .from('screenshots')
          .select('captured_at, file_path, image_url, activity_percent, focus_percent, app_name, window_title, mouse_clicks, keystrokes, mouse_movements')
          .eq('user_id', effectiveUserId)
          .gte('captured_at', todayStart.toISOString())
          .lte('captured_at', todayEnd.toISOString())
          .order('captured_at', { ascending: false });

        if (error) {
          const errorMessage = error.message || String(error);
          console.error('❌ [TODAY-SCREENSHOTS] Supabase error:', errorMessage.split('\n')[0]);
          return { success: false, error: errorMessage };
        }

        console.log(`✅ [TODAY-SCREENSHOTS] Supabase: ${data?.length || 0} screenshots`);
        return { success: true, data: data || [], source: 'supabase' };
      } catch (error) {
        console.error('❌ [TODAY-SCREENSHOTS] Error:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Get today's activity log with sync status
   */
  registerGetTodayActivityLog() {
    this.ipcMain.handle('get-today-activity-log', async () => {
      try {
        console.log('📝 [TODAY-ACTIVITY-LOG] Fetching today\'s activity log...');
        
        if (!this.supabaseService) {
          console.error('❌ [TODAY-ACTIVITY-LOG] Supabase service not available');
          return { success: false, error: 'Database service not available' };
        }

        // Get effective user ID
        const effectiveUserId = this.global.currentUserId || this.config?.user_id || this.config?.userId;
        
        if (!effectiveUserId) {
          console.warn('⚠️ [TODAY-ACTIVITY-LOG] No user ID available — returning empty activity');
          return { success: true, data: [] };
        }

        // Use local time for date boundaries
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        console.log(`📝 [TODAY-ACTIVITY-LOG] Fetching activity log for user ${effectiveUserId}`);
        console.log(`📝 [TODAY-ACTIVITY-LOG] Date range: ${todayStart.toISOString()} to ${todayEnd.toISOString()}`);

        // Get activity from multiple sources and combine (with error handling for each)
        const [
          screenshotResult,
          appTsRes,
          appStartedAtRes,
          appCrRes,
          urlTsRes,
          urlCrRes,
          timeResult
        ] = await Promise.allSettled([
          // Screenshot activities — captured_at is authoritative
          this.supabaseService
            .from('screenshots')
            .select('id, captured_at, created_at, app_name, activity_percent')
            .eq('user_id', effectiveUserId)
            .gte('captured_at', todayStart.toISOString())
            .lte('captured_at', todayEnd.toISOString())
            .order('captured_at', { ascending: false }),

          // App activities by timestamp
          this.supabaseService
            .from('app_logs')
            .select('id, timestamp, created_at, app_name, window_title, detected_at')
            .eq('user_id', effectiveUserId)
            .gte('timestamp', todayStart.toISOString())
            .lte('timestamp', todayEnd.toISOString())
            .order('timestamp', { ascending: false }),

          // App activities by started_at (newer schema)
          this.supabaseService
            .from('app_logs')
            .select('id, started_at, ended_at, created_at, app_name, window_title, detected_at, duration_seconds')
            .eq('user_id', effectiveUserId)
            .gte('started_at', todayStart.toISOString())
            .lte('started_at', todayEnd.toISOString())
            .order('started_at', { ascending: false }),

          // App activities where timestamp is null — filter by created_at
          this.supabaseService
            .from('app_logs')
            .select('id, timestamp, created_at, app_name, window_title, detected_at')
            .eq('user_id', effectiveUserId)
            .is('timestamp', null)
            .gte('created_at', todayStart.toISOString())
            .lte('created_at', todayEnd.toISOString())
            .order('created_at', { ascending: false }),

          // URL activities by timestamp
          this.supabaseService
            .from('url_logs')
            .select('id, timestamp, url, site_url, browser, domain')
            .eq('user_id', effectiveUserId)
            .gte('timestamp', todayStart.toISOString())
            .lte('timestamp', todayEnd.toISOString())
            .order('timestamp', { ascending: false }),

          // URL activities where timestamp is null — filter by created_at
          this.supabaseService
            .from('url_logs')
            .select('id, timestamp, url, site_url, browser, domain')
            .eq('user_id', effectiveUserId)
            .is('timestamp', null)
            .order('timestamp', { ascending: false }),

          // Time log activities — start_time is authoritative
          this.supabaseService
            .from('time_logs')
            .select('id, start_time, end_time, is_idle, idle_seconds')
            .eq('user_id', effectiveUserId)
            .gte('start_time', todayStart.toISOString())
            .lte('start_time', todayEnd.toISOString())
            .order('start_time', { ascending: false })
        ]);

        // Process results with error handling
        const screenshots = screenshotResult.status === 'fulfilled' ? (screenshotResult.value.data || []) : [];
        const appByTs = appTsRes.status === 'fulfilled' ? (appTsRes.value.data || []) : [];
        const appByStarted = appStartedAtRes.status === 'fulfilled' ? (appStartedAtRes.value.data || []) : [];
        const appByCr = appCrRes.status === 'fulfilled' ? (appCrRes.value.data || []) : [];
        const urlByTs = urlTsRes.status === 'fulfilled' ? (urlTsRes.value.data || []) : [];
        const urlByCr = urlCrRes.status === 'fulfilled' ? (urlCrRes.value.data || []) : [];
        const timeLogs = timeResult.status === 'fulfilled' ? (timeResult.value.data || []) : [];

        // Deduplicate function
        const dedupe = (rows, keyFn) => {
          const seen = new Set();
          const out = [];
          for (const r of rows) {
            const k = keyFn(r);
            if (seen.has(k)) continue;
            seen.add(k);
            out.push(r);
          }
          return out;
        };

        // Merge and deduplicate app and URL logs
        const appLogs = dedupe([...appByTs, ...appByStarted, ...appByCr], r => r.id ?? `${r.app_name}|${r.timestamp || r.started_at || r.created_at}`);
        const urlLogs = dedupe([...urlByTs, ...urlByCr], r => r.id ?? `${r.url || r.site_url}|${r.timestamp}`);

        // Log data counts
        console.log(`📝 [TODAY-ACTIVITY-LOG] Data retrieved: {screenshots: ${screenshots.length}, appLogs: ${appLogs.length}, urlLogs: ${urlLogs.length}, timeLogs: ${timeLogs.length}}`);

        // Log any errors
        if (screenshotResult.status === 'rejected') {
          console.error('❌ Screenshot query error:', screenshotResult.reason);
        }
        if (appTsRes.status === 'rejected') {
          console.error('❌ App logs (timestamp) query error:', appTsRes.reason);
        }
        if (appCrRes.status === 'rejected') {
          console.error('❌ App logs (created_at) query error:', appCrRes.reason);
        }
        if (appStartedAtRes.status === 'rejected') {
          console.error('❌ App logs (started_at) query error:', appStartedAtRes.reason);
        }
        if (urlTsRes.status === 'rejected') {
          console.error('❌ URL logs (timestamp) query error:', urlTsRes.reason);
        }
        if (urlCrRes.status === 'rejected') {
          console.log('ℹ️ URL logs (created_at) not used in schema; relying on timestamp only');
        }
        if (timeResult.status === 'rejected') {
          console.error('❌ Time logs query error:', timeResult.reason);
        }

        // Combine and format all activities
        const activities = [];

        // Add screenshot activities
        screenshots.forEach(log => {
          const timestamp = log.captured_at || log.created_at;
          if (timestamp) {
            activities.push({
              timestamp,
              type: 'Screenshot',
              details: `${log.app_name || 'Unknown App'} - ${log.activity_percent || 0}% activity`,
              synced: true
            });
          }
        });

        // Add app activities with proper window title handling and started_at support
        appLogs.forEach(log => {
          const timestamp = log.timestamp || log.started_at || log.created_at;
          if (timestamp && log.app_name) {
            let details = log.app_name;
            if (log.window_title) {
              details += ` - ${log.window_title}`;
            }
            // Include duration if available
            const duration = log.duration_seconds && Number.isFinite(log.duration_seconds) ? log.duration_seconds : undefined;
            const suffix = duration ? ` (${Math.max(1, Math.round(duration / 60))} min)` : '';
            activities.push({
              timestamp,
              type: 'App Activity',
              details: details + suffix,
              synced: true
            });
          }
        });

        // Add URL activities with robust domain extraction
        urlLogs.forEach(log => {
          const timestamp = log.timestamp;
          const url = log.url || log.site_url;
          
          if (timestamp && url) {
            let domain = log.domain;
            if (!domain) {
              try {
                domain = new URL(url).hostname;
              } catch {
                // If URL parsing fails, use the raw URL or a fallback
                domain = url.substring(0, 50) + (url.length > 50 ? '...' : '');
              }
            }
            
            const browser = log.browser || 'Unknown Browser';
            activities.push({
              timestamp,
              type: 'Website Visit',
              details: `${domain} via ${browser}`,
              synced: true
            });
          }
        });

        // Add time log activities with calculated durations
        timeLogs.forEach(log => {
          if (log.start_time) {
            // Calculate active duration if not stored
            let activeDuration = 0;
            if (log.end_time) {
              const totalDuration = (new Date(log.end_time) - new Date(log.start_time)) / 1000; // seconds
              if (!log.is_idle) {
                activeDuration = totalDuration - (log.idle_seconds || 0);
              }
            }
            
            activities.push({
              timestamp: log.start_time,
              type: 'Tracking Session',
              details: `Started session${activeDuration > 0 ? ` (${Math.floor(activeDuration / 60)} min active)` : ''}`,
              synced: true
            });
            
            if (log.end_time) {
              activities.push({
                timestamp: log.end_time,
                type: 'Tracking Session',
                details: 'Ended session',
                synced: true
              });
            }
          }
        });

        // Sort by timestamp (most recent first) with fallbacks
        activities.sort((a, b) => {
          const at = new Date(a.timestamp || a.captured_at || a.started_at || a.created_at || 0);
          const bt = new Date(b.timestamp || b.captured_at || b.started_at || b.created_at || 0);
          return bt - at;
        });

        console.log(`✅ [TODAY-ACTIVITY-LOG] Compiled ${activities.length} activity entries`);
        return { success: true, data: activities };
        
      } catch (error) {
        console.error('❌ [TODAY-ACTIVITY-LOG] Error:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Initialize the data stats manager
   */
  async initialize() {
    // Prevent multiple initializations
    if (this.initialized) {
      console.log('⚠️ [DataStatsManager] Already initialized, skipping');
      return true;
    }
    
    try {
      this.registerHandlers();
      this.initialized = true;
      console.log('📊 DataStatsManager initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ DataStatsManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Shutdown the data stats manager
   */
  async shutdown() {
    try {
      console.log('📊 DataStatsManager shutdown complete');
    } catch (error) {
      console.error('❌ DataStatsManager shutdown failed:', error);
    }
  }
}

module.exports = DataStatsManager;