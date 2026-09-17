const { db, logger } = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SyncManager {
  constructor(config) {
    this.config = config;

    // AWS/RDS cutover path: send all writes to backend API protected by INTERNAL_API_KEY.
    this.desktopSyncApiUrl = config.backend_api_url || process.env.BACKEND_API_URL || 'http://localhost:3000/sync/desktop-action';
    this.internalApiKey = config.backend_api_key || process.env.INTERNAL_API_KEY || '';
    console.log(`🔧 [SYNC-MANAGER] Using backend sync API for database writes`);
    console.log(`🔧 [SYNC-MANAGER] Sync API URL: ${this.desktopSyncApiUrl}`);
    this.isOnline = true;
    this.syncInterval = null;
    this._syncTimeout = null;
    this._syncing = false;
    this._syncHooksBound = false;
    this._backoffUntil = 0;
    this._retryCount = 0;
    this._reconnectFlushTimer = null;
    // Use user data directory instead of app.asar path
    const os = require('os');
    const userDataDir = process.env.APPDATA || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : path.join(os.homedir(), '.config'));
    const appDataDir = path.join(userDataDir, 'Alyson Work Time');
    
    // Ensure directory exists
    if (!fs.existsSync(appDataDir)) {
      fs.mkdirSync(appDataDir, { recursive: true });
    }
    
    this.queuePath = path.join(appDataDir, 'offline-queue.json');
    
    // 🧠 Optimization: Initialize with default queue, then load async in init()
    this.queue = this.getDefaultQueue();
    this.isInitialized = false;
    
    // Initialize async operations
    this.init();
  }

  // 🧠 Optimization: Async initialization to handle file operations properly
  async init() {
    try {
      // Initialize offline queue
      this.queue = await this.loadQueue();
      
      // Clean up any old URL logs with is_active field
      this.cleanBadUrlLogs();
      
      // Start sync process
      this.startSyncProcess();
      
      // Monitor connection
      this.monitorConnection();
      
      this.isInitialized = true;
      logger.info({ category: 'SYNC', step: 'INIT', message: 'Async initialization completed' });
    } catch (error) {
      logger.error({ category: 'SYNC', step: 'INIT ERROR', message: error?.message || String(error) });
      // Fallback to default queue
      this.queue = this.getDefaultQueue();
      this.isInitialized = true;
    }
  }

  // === QUEUE MANAGEMENT ===
  // 🧠 Optimization: Made async to prevent main thread blocking during file I/O
  async loadQueue() {
    try {
      // 🧠 Optimization: Replace fs.existsSync + fs.readFileSync with single async operation
      const data = await fs.promises.readFile(this.queuePath, 'utf8');
      // 🧠 Optimization: Move JSON parsing to setImmediate to avoid blocking on large files
      return await new Promise(resolve => {
        setImmediate(() => {
          try {
            resolve(JSON.parse(data));
          } catch (parseError) {
            console.error('❌ Failed to parse queue data:', parseError);
            resolve(this.getDefaultQueue());
          }
        });
      });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('❌ Failed to load queue:', error);
      }
    }
    
    return this.getDefaultQueue();
  }

  // 🧠 Optimization: Extract default queue to avoid duplication
  getDefaultQueue() {
    return {
      screenshots: [],
      appLogs: [],
      urlLogs: [],
      idleLogs: [],
      timeLogs: [],
      fraudAlerts: []
    };
  }

  // 🧠 Optimization: Made async to prevent main thread blocking during file I/O
  async saveQueue() {
    try {
      // 🧠 Optimization: Move JSON stringification to setImmediate to avoid blocking on large queues
      const queueData = await new Promise(resolve => {
        setImmediate(() => {
          try {
            resolve(JSON.stringify(this.queue, null, 2));
          } catch (stringifyError) {
            console.error('❌ Failed to stringify queue:', stringifyError);
            resolve('{}');
          }
        });
      });
      
      // 🧠 Optimization: Replace fs.writeFileSync with async equivalent
      await fs.promises.writeFile(this.queuePath, queueData);
    } catch (error) {
      console.error('❌ Failed to save queue:', error);
    }
  }

  /**
   * Call backend desktop sync action endpoint.
   * @param {string} action - The action to perform
   * @param {object} data - The data payload
   * @returns {Promise<object>} The response body
   */
  async _callEdgeFunction(action, data) {
    if (!this.internalApiKey) {
      throw new Error('Missing INTERNAL_API_KEY for backend sync API');
    }

    const response = await fetch(this.desktopSyncApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.internalApiKey,
      },
      body: JSON.stringify({ action, data }),
    });

    const body = await response.json();

    if (!response.ok) {
      const errorMsg = body?.message || body?.error || `Edge function returned ${response.status}`;
      try {
        require('../utils/backend-time-logs').noteNetworkResult(false, {
          status: response.status,
          message: errorMsg,
        });
      } catch (_) { /* hint is best-effort */ }
      throw new Error(errorMsg);
    }

    return body;
  }

  // === SCREENSHOT HANDLING ===
  async addScreenshot(imageBuffer, metadata) {
    const screenshotData = {
      id: `screenshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      imageBuffer: imageBuffer.toString('base64'),
      metadata: metadata,
      timestamp: new Date().toISOString(),
      retries: 0
    };

    // PERFORMANCE OPTIMIZATION: Always queue screenshots for batch processing
    // instead of immediate upload to reduce database write frequency
    
    // Add to queue
    this.queue.screenshots.push(screenshotData);
    this.saveQueue();
    logger.debug({ category: 'SYNC', step: 'QUEUE', message: 'screenshot', ctx: { pending: this.queue.screenshots.length } });
  }

  async uploadScreenshot(screenshotData) {
    const { imageBuffer, metadata } = screenshotData;
    const corrId = metadata.correlation_id || `no-corr-${Date.now()}`;
    
    db.saveStart('screenshots', { correlation_id: corrId });

    // SECURITY: Upload via edge function — service_role key stays server-side
    const result = await this._callEdgeFunction('upload_screenshot', {
      imageBase64: imageBuffer, // Already base64 from addScreenshot()
      metadata: {
        project_id: metadata.project_id,
        time_log_id: metadata.time_log_id,
        activity_percent: metadata.activity_percent,
        focus_percent: metadata.focus_percent,
        captured_at: metadata.captured_at,
        mouse_clicks: metadata.mouse_clicks || 0,
        keystrokes: metadata.keystrokes || 0,
        mouse_movements: metadata.mouse_movements || 0,
        app_name: metadata.app_name,
        window_title: metadata.window_title,
        url: metadata.url
      }
    });

    const rowId = result?.id;
    db.saveSuccess('screenshots', 1, { correlation_id: corrId, row_id: rowId });
    
    // Emit cache bypass event to renderer
    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
      try {
        global.mainWindow.webContents.send('screenshot-saved', {
          correlation_id: corrId,
          row_id: rowId,
          captured_at: metadata.captured_at
        });
         logger.debug({ category: 'IPC', step: 'screenshot-saved: SENT', ctx: { correlation_id: corrId, row_id: rowId } });
      } catch (error) {
        logger.warn({ category: 'IPC', step: 'screenshot-saved: FAILED', message: error.message, ctx: { correlation_id: corrId } });
      }
    }
  }

  // === APP LOGS HANDLING ===
  async addAppLogs(appLogs) {
    const logData = {
      id: `app_logs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      logs: appLogs,
      timestamp: new Date().toISOString(),
      retries: 0
    };

    // PERFORMANCE OPTIMIZATION: Always queue app logs for batch processing
    // instead of immediate upload to reduce database write frequency
    
    // FIXED: Limit queue size to prevent memory buildup
    const MAX_QUEUE_SIZE = 50;
    if (this.queue.appLogs.length >= MAX_QUEUE_SIZE) {
      console.log('⚠️ App logs queue full, dropping oldest entries');
      // Remove oldest 25% to make room
      const removeCount = Math.floor(MAX_QUEUE_SIZE * 0.25);
      this.queue.appLogs.splice(0, removeCount);
    }
    
    this.queue.appLogs.push(logData);
    this.saveQueue();
    logger.debug({ category: 'SYNC', step: 'QUEUE', message: 'app_logs', ctx: { pending: this.queue.appLogs.length } });
    this.requestFlush();
  }

  async uploadAppLogs(logData) {
    try {
      logger.debug({ category: 'SYNC', step: 'UPLOAD VIA EDGE FN' });
      db.saveStart('app_logs');
      
      const logs = Array.isArray(logData.logs) ? logData.logs : [];
      const batch = logs.slice(0, 8);
      await this._callEdgeFunction('insert_app_logs', { logs: batch });
      logData.logs = logs.slice(8);
      db.saveSuccess('app_logs', batch.length);
    } catch (networkError) {
      console.error('❌ Network error during app logs upload:', networkError);
      db.saveError('app_logs', networkError);
      
      // Check if it's a network connectivity issue
      if (networkError.message.includes('fetch failed') || 
          networkError.message.includes('Failed to fetch') ||
          networkError.message.includes('NetworkError')) {
        throw new Error(`Network connectivity issue: ${networkError.message}`);
      }
      
      throw networkError;
    }
  }

  // === URL LOGS HANDLING ===
  async addUrlLogs(urlLogs) {
    const logData = {
      id: `url_logs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      logs: urlLogs,
      timestamp: new Date().toISOString(),
      retries: 0
    };

    // PERFORMANCE OPTIMIZATION: Always queue URL logs for batch processing
    // instead of immediate upload to reduce database write frequency
    
    // FIXED: Limit queue size to prevent memory buildup
    const MAX_QUEUE_SIZE = 30;
    if (this.queue.urlLogs.length >= MAX_QUEUE_SIZE) {
      // Remove oldest 25% to make room and inform UI
      const removeCount = Math.floor(MAX_QUEUE_SIZE * 0.25);
      console.warn(`⚠️ URL logs queue full, dropping oldest ${removeCount} batches`);
      this.queue.urlLogs.splice(0, removeCount);
      try {
        global.mainWindow?.webContents?.send('sync-warning', {
          type: 'url',
          message: `URL queue overflow – dropped ${removeCount} oldest batches`,
        });
      } catch {}
    }
    
    this.queue.urlLogs.push(logData);
    this.saveQueue();
    logger.debug({ category: 'SYNC', step: 'QUEUE', message: 'url_logs', ctx: { pending: this.queue.urlLogs.length } });
    this.requestFlush();
  }

  async uploadUrlLogs(logData) {
    const BATCH = 8;
    const chunks = [];
    for (let i = 0; i < logData.logs.length; i += BATCH) {
      chunks.push(logData.logs.slice(i, i + BATCH));
    }
    for (const chunk of chunks) {
      db.saveStart('url_logs', { batch_size: chunk.length });
      await this._callEdgeFunction('insert_url_logs', {
        logs: chunk.map(row => ({
          ...row,
          url: row.url || row.site_url,
          site_url: row.site_url || row.url,
        })),
      });
      db.saveSuccess('url_logs', chunk.length);
    }
  }

  // === IDLE LOGS HANDLING ===
  async addIdleLog(idleLog) {
    const logData = {
      id: `idle_log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      log: idleLog,
      timestamp: new Date().toISOString(),
      retries: 0
    };

    // PERFORMANCE OPTIMIZATION: Always queue idle logs for batch processing
    // instead of immediate upload to reduce database write frequency
    
    // Add to queue
    this.queue.idleLogs.push(logData);
    this.saveQueue();
    logger.debug({ category: 'SYNC', step: 'QUEUE', message: 'idle_log', ctx: { pending: this.queue.idleLogs.length } });
    this.requestFlush();
  }

  async uploadIdleLog(logData) {
    db.saveStart('idle_logs');
    await this._callEdgeFunction('insert_idle_log', { log: logData.log });
    db.saveSuccess('idle_logs', 1);
  }

  // === TIME LOGS HANDLING ===
  async addTimeLog(timeLog) {
    const logData = {
      id: crypto.randomUUID(), // Use proper UUID format
      log: timeLog,
      timestamp: new Date().toISOString(),
      retries: 0
    };

    // PERFORMANCE OPTIMIZATION: Always queue time logs for batch processing
    // instead of immediate upload to reduce database write frequency
    
    // Add to queue
    this.queue.timeLogs.push(logData);
    this.saveQueue();
    logger.debug({ category: 'SYNC', step: 'QUEUE', message: 'time_log', ctx: { pending: this.queue.timeLogs.length } });
  }

  async uploadTimeLog(logData) {
    if (logData.log.action === 'update_idle') {
      db.saveStart('time_logs');
      await this._callEdgeFunction('update_time_log', {
        id: logData.log.id,
        updates: logData.log.data
      });
      db.saveSuccess('time_logs', 1);
    } else {
      // Use upsert to handle both inserts and updates gracefully
      // This prevents duplicate key violations when the same time log is queued multiple times
      db.saveStart('time_logs');
      await this._callEdgeFunction('upsert_time_log', { log: logData.log });
      db.saveSuccess('time_logs', 1);
    }
  }

  // === FRAUD ALERTS HANDLING ===
  async addFraudAlert(fraudAlert) {
    const alertData = {
      id: `fraud_alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      alert: fraudAlert,
      timestamp: new Date().toISOString(),
      retries: 0
    };

    // PERFORMANCE OPTIMIZATION: Always queue fraud alerts for batch processing
    // instead of immediate upload to reduce database write frequency
    
    // Add to queue
    this.queue.fraudAlerts.push(alertData);
    this.saveQueue();
    console.log(`📦 Fraud alert queued (${this.queue.fraudAlerts.length} pending)`);
  }

  async uploadFraudAlert(alertData) {
    db.saveStart('fraud_alerts');
    await this._callEdgeFunction('insert_fraud_alert', { alert: alertData.alert });
    db.saveSuccess('fraud_alerts', 1);
  }

  // === ACTIVITY STATS PERSISTENCE ===
  async saveActivityStats(statsData) {
    db.saveStart('activity_stats');
    await this._callEdgeFunction('insert_activity_stats', { stats: statsData });
    db.saveSuccess('activity_stats', 1);
  }

  // === SYNC PROCESS ===
  startSyncProcess() {
    this._bindReconnectHooks();
    this.requestFlush();
  }

  requestFlush() {
    if (this._syncTimeout) return;
    const now = Date.now();
    let delay = 250 + Math.floor(Math.random() * 500);
    if (this._backoffUntil > now) delay = this._backoffUntil - now;
    this._syncTimeout = setTimeout(() => {
      this._syncTimeout = null;
      void this.syncQueue();
    }, delay);
  }

  _noteFlushFailure(error) {
    const { jitteredBackoffMs, isTransientDbOrNetworkError } = require('../utils/sync-backoff');
    this._retryCount = (this._retryCount || 0) + 1;
    this._backoffUntil = Date.now() + jitteredBackoffMs(this._retryCount);
    this._flushAborted = true;
    const msg = error?.message || String(error || '');
    if (isTransientDbOrNetworkError(msg)) {
      try {
        require('../utils/backend-time-logs').noteNetworkResult?.(false, { message: msg });
      } catch (_) { /* optional */ }
    }
    console.warn(
      `⚠️ [SYNC] Flush paused ${Math.round((this._backoffUntil - Date.now()) / 1000)}s:`,
      msg,
    );
  }

  _noteFlushSuccess() {
    this._retryCount = 0;
    this._backoffUntil = 0;
    this._flushAborted = false;
  }

  async syncQueue() {
    if (this._syncing) return;
    if (!this.isOnline) return;
    if (this._backoffUntil && Date.now() < this._backoffUntil) {
      this.requestFlush();
      return;
    }

    const totalItems = Object.values(this.queue).reduce((sum, arr) => sum + arr.length, 0);
    if (totalItems === 0) return;

    this._syncing = true;
    this._flushAborted = false;
    logger.info({ category: 'SYNC', step: 'SYNC START', ctx: { totalItems } });

    try {
      try {
        await this.syncTimeLogs();
      } catch (error) {
        this._noteFlushFailure(error);
        logger.error({ category: 'SYNC', step: 'TIME LOG SYNC FAILED', message: error.message });
      }

      const hasTimeLogsToSync = this.queue.timeLogs?.length > 0;
      if (!this._flushAborted && !hasTimeLogsToSync) {
        await this.syncAppLogs();
        if (!this._flushAborted) await this.syncUrlLogs();
        if (!this._flushAborted) await this.syncIdleLogs();
      } else if (hasTimeLogsToSync) {
        logger.warn({
          category: 'SYNC',
          step: 'DEPENDENT SYNC DEFERRED',
          message: 'Skipping app/url/idle logs sync until time logs succeed',
        });
      }

      if (!this._flushAborted) await this.syncScreenshots();
      if (!this._flushAborted) await this.syncFraudAlerts();
      if (!this._flushAborted) this._noteFlushSuccess();
      this.saveQueue();
    } finally {
      this._syncing = false;
      if (Object.values(this.queue).some((arr) => arr.length > 0)) {
        this.requestFlush();
      }
    }
  }

  async syncScreenshots() {
    const screenshots = [...this.queue.screenshots];
    if (!screenshots.length) return;

    // Move leftover base64 JSON rows onto the file queue. Never drop after 5
    // retries — that was silent screenshot loss. Drain is event + backoff.
    try {
      const { getOfflineScreenshotQueue } = require('../utils/offline-screenshot-queue');
      const q = getOfflineScreenshotQueue();
      for (const screenshot of screenshots) {
        const b64 =
          screenshot.imageBuffer ||
          screenshot.file_data ||
          screenshot.data?.file_data ||
          '';
        if (!b64) continue;
        const id =
          screenshot.id ||
          screenshot.screenshot_id ||
          `migrated-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const meta = screenshot.metadata || screenshot;
        q.enqueuePrepared({
          id: String(id),
          buffer: Buffer.from(String(b64), 'base64'),
          ext: 'jpg',
          contentType: 'image/jpeg',
          meta: {
            userId: meta.user_id || meta.userId || this.config?.user_id,
            capturedAt: meta.captured_at || screenshot.timestamp,
            timeLogId: meta.time_log_id || meta.timeLogId || null,
            activityPercent: meta.activity_percent || 0,
            focusPercent: meta.focus_percent || 0,
            clicks: meta.mouse_clicks || 0,
            keys: meta.keystrokes || 0,
            moves: meta.mouse_movements || 0,
            appName: meta.app_name || null,
            windowTitle: meta.window_title || null,
            agentVersion: meta.agent_version || null,
          },
        });
      }
      this.queue.screenshots = [];
      await this.saveQueue();
      q.requestFlush();
      logger.info({
        category: 'SYNC',
        step: 'SCREENSHOTS MIGRATED',
        ctx: { count: screenshots.length },
      });
    } catch (error) {
      logger.warn({
        category: 'SYNC',
        step: 'SCREENSHOT MIGRATE FAILED',
        message: error?.message || String(error),
        ctx: { kept: this.queue.screenshots.length },
      });
    }
  }

  async syncAppLogs() {
    const appLogs = [...this.queue.appLogs];
    
    for (let i = appLogs.length - 1; i >= 0; i--) {
      const logData = appLogs[i];
      
      try {
        await this.uploadAppLogs(logData);
        if (!Array.isArray(logData.logs) || logData.logs.length === 0) {
          this.queue.appLogs.splice(i, 1);
        }
        logger.info({ category: 'SYNC', step: 'APP LOGS SYNCED' });
      } catch (error) {
        logData.retries = (logData.retries || 0) + 1;
        logger.warn({ category: 'SYNC', step: 'APP LOGS RETRY', message: error.message, ctx: { retry: logData.retries } });
        this._noteFlushFailure(error);
        return;
      }
    }
  }

  async syncUrlLogs() {
    const urlLogs = [...this.queue.urlLogs];
    
    for (let i = urlLogs.length - 1; i >= 0; i--) {
      const logData = urlLogs[i];
      
      try {
        await this.uploadUrlLogs(logData);
        this.queue.urlLogs.splice(i, 1);
        logger.info({ category: 'SYNC', step: 'URL LOGS SYNCED' });
      } catch (error) {
        logData.retries = (logData.retries || 0) + 1;
        logger.warn({ category: 'SYNC', step: 'URL LOGS RETRY', message: error.message, ctx: { retry: logData.retries } });
        this._noteFlushFailure(error);
        return;
      }
    }
  }

  async syncIdleLogs() {
    const idleLogs = [...this.queue.idleLogs];
    
    for (let i = idleLogs.length - 1; i >= 0; i--) {
      const logData = idleLogs[i];
      
      try {
        await this.uploadIdleLog(logData);
        this.queue.idleLogs.splice(i, 1);
        logger.info({ category: 'SYNC', step: 'IDLE LOG SYNCED' });
      } catch (error) {
        logData.retries = (logData.retries || 0) + 1;
        logger.warn({ category: 'SYNC', step: 'IDLE LOG RETRY', message: error.message, ctx: { retry: logData.retries } });
        this._noteFlushFailure(error);
        return;
      }
    }
  }

  async syncTimeLogs() {
    const timeLogs = [...this.queue.timeLogs];
    
    for (let i = timeLogs.length - 1; i >= 0; i--) {
      const logData = timeLogs[i];
      
      try {
        await this.uploadTimeLog(logData);
        this.queue.timeLogs.splice(i, 1);
        logger.info({ category: 'SYNC', step: 'TIME LOG SYNCED' });
      } catch (error) {
        logData.retries = (logData.retries || 0) + 1;
        logger.warn({
          category: 'SYNC',
          step: 'TIME LOG RETRY',
          message: error.message,
          ctx: { retry: logData.retries },
        });
        this._noteFlushFailure(error);
        return;
      }
    }
  }

  async syncFraudAlerts() {
    // Safety check to ensure fraudAlerts array exists
    if (!this.queue.fraudAlerts || !Array.isArray(this.queue.fraudAlerts)) {
      this.queue.fraudAlerts = [];
      return;
    }
    
    const fraudAlerts = [...this.queue.fraudAlerts];
    
    for (let i = fraudAlerts.length - 1; i >= 0; i--) {
      const alertData = fraudAlerts[i];
      
      try {
        await this.uploadFraudAlert(alertData);
        this.queue.fraudAlerts.splice(i, 1);
        logger.info({ category: 'SYNC', step: 'FRAUD ALERT SYNCED' });
      } catch (error) {
        alertData.retries++;
        logger.warn({ category: 'SYNC', step: 'FRAUD ALERT RETRY', message: error.message, ctx: { retry: alertData.retries } });
        
        if (alertData.retries >= 5) {
          this.queue.fraudAlerts.splice(i, 1);
          logger.warn({ category: 'SYNC', step: 'FRAUD ALERT DROPPED', message: 'Removed after 5 retries' });
        }
      }
    }
  }

  // === CONNECTION MONITORING ===
  // OS connectivity only. Never ping /health (that opens an RDS connection
  // from every laptop and is a common "too many connections" cause).
  monitorConnection() {
    this._bindReconnectHooks();
  }

  _bindReconnectHooks() {
    if (this._syncHooksBound) return;
    this._syncHooksBound = true;
    const onOnline = (label) => {
      this.isOnline = true;
      if (this._reconnectFlushTimer) return;
      const { reconnectSpreadMs } = require('../utils/sync-backoff');
      const delay = reconnectSpreadMs();
      logger.info({
        category: 'SYNC',
        step: 'ONLINE',
        message: `${label} — flush in ${delay}ms`,
      });
      this._reconnectFlushTimer = setTimeout(() => {
        this._reconnectFlushTimer = null;
        this.requestFlush();
      }, delay);
    };
    try {
      const { powerMonitor, ipcMain, net } = require('electron');
      if (net && typeof net.isOnline === 'function') {
        this.isOnline = net.isOnline();
      }
      if (powerMonitor?.on) {
        powerMonitor.on('resume', () => onOnline('System resume'));
        powerMonitor.on('unlock-screen', () => onOnline('Screen unlock'));
      }
      if (ipcMain?.on) {
        ipcMain.on('network-online', () => onOnline('Network online'));
      }
    } catch (_) {
      this.isOnline = true;
    }
  }

  // === UTILITY METHODS ===
  getQueueStatus() {
    return {
      screenshots: this.queue.screenshots.length,
      appLogs: this.queue.appLogs.length,
      urlLogs: this.queue.urlLogs.length,
      idleLogs: this.queue.idleLogs.length,
      timeLogs: this.queue.timeLogs.length,
      fraudAlerts: this.queue.fraudAlerts.length,
      total: Object.values(this.queue).reduce((sum, arr) => sum + arr.length, 0)
    };
  }

  // Clean up any old URL logs with is_active field
  cleanBadUrlLogs() {
    console.log('🧹 [CLEANUP] Removing malformed URL logs...');
    
    // 🧠 Optimization: Safety check to ensure queue is properly initialized
    if (!this.queue || !this.queue.urlLogs) {
      console.log('⚠️ [CLEANUP] Queue not ready, skipping URL logs cleanup');
      return;
    }
    
    this.queue.urlLogs = this.queue.urlLogs.filter(logData => {
      const hasActiveField = logData.logs.some(log => log.hasOwnProperty('is_active'));
      if (hasActiveField) {
        console.log('🗑️ [CLEANUP] Removed URL log with legacy is_active field');
        return false;
      }
      return true;
    });
    this.saveQueue();
  }

  clearQueue() {
    this.queue = {
      screenshots: [],
      appLogs: [],
      urlLogs: [],
      idleLogs: [],
      timeLogs: [],
      fraudAlerts: []
    };
    this.saveQueue();
  }

  destroy() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
  }
}

module.exports = SyncManager; 