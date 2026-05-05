const { createClient } = require('@supabase/supabase-js');
const { db, logger } = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SyncManager {
  constructor(config) {
    this.config = config;
    
    // Configure Supabase with extended timeouts for sync operations
    const syncOptions = {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
      },
      global: {
        fetch: (url, options = {}) => {
          // Set extended timeouts for sync operations which may involve large data
          const customOptions = {
          ...options,
          timeout: 120000, // 2 minute timeout for sync operations (increased for high latency)
          headers: {
            // CRITICAL FIX: Preserve Supabase headers first, then add custom ones
            ...options.headers,
            'User-Agent': 'Alyson-Sync-Manager/1.0'
          }
        };
          
          // Add retry logic specifically for sync failures
          return fetch(url, customOptions).catch(async (error) => {
            if (error.name === 'TimeoutError' || 
                error.code === 'UND_ERR_CONNECT_TIMEOUT' ||
                error.code === 'ENOTFOUND' ||
                error.message.includes('fetch failed')) {
              console.log(`🔄 [SYNC] Retrying sync request after error: ${error.message}`);
              await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds for sync retries (increased)
              return fetch(url, customOptions);
            }
            throw error;
          });
        }
      }
    };

    this.supabase = createClient(config.supabase_url, config.supabase_key, syncOptions);

    // SECURITY: Use server-side edge function for all writes instead of service_role key
    // The service_role key NEVER leaves the server — it exists only in the edge function.
    this.edgeFunctionUrl = `${config.supabase_url}/functions/v1/desktop-sync`;
    this.supabaseAnonKey = config.supabase_key; // anon key for edge function auth header
    
    console.log(`🔧 [SYNC-MANAGER] Using secure edge function proxy for database writes`);
    console.log(`🔧 [SYNC-MANAGER] Edge function URL: ${this.edgeFunctionUrl}`);
    this.isOnline = true;
    this.syncInterval = null;
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
   * Call the desktop-sync edge function with the user's JWT.
   * The edge function uses the service_role key SERVER-SIDE to write to the DB.
   * @param {string} action - The action to perform
   * @param {object} data - The data payload
   * @returns {Promise<object>} The response body
   */
  async _callEdgeFunction(action, data) {
    // Get the current user session token
    const { data: sessionData } = await this.supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    
    if (!accessToken) {
      throw new Error('No authenticated session - cannot call edge function');
    }

    const response = await fetch(this.edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'apikey': this.supabaseAnonKey,
      },
      body: JSON.stringify({ action, data }),
    });

    const body = await response.json();

    if (!response.ok) {
      const errorMsg = body?.error || `Edge function returned ${response.status}`;
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
  }

  async uploadAppLogs(logData) {
    try {
      logger.debug({ category: 'SYNC', step: 'UPLOAD VIA EDGE FN' });
      db.saveStart('app_logs');
      
      await this._callEdgeFunction('insert_app_logs', { logs: logData.logs });

      db.saveSuccess('app_logs', Array.isArray(logData.logs) ? logData.logs.length : 1);
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
  }

  async uploadUrlLogs(logData) {
    const BATCH = Number(process.env.URL_BATCH_SIZE || 200);
    const chunks = [];
    for (let i = 0; i < logData.logs.length; i += BATCH) {
      chunks.push(logData.logs.slice(i, i + BATCH));
    }
    for (const chunk of chunks) {
      await this._insertUrlChunkWithRetry(chunk);
    }
  }

  async _insertUrlChunkWithRetry(chunk) {
    const maxRetries = 5;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        db.saveStart('url_logs', { batch_size: chunk.length });
        await this._callEdgeFunction('insert_url_logs', {
          logs: chunk.map(row => ({
            ...row,
            url: row.url || row.site_url,
            site_url: row.site_url || row.url,
          }))
        });
        db.saveSuccess('url_logs', chunk.length);
        return;
      } catch (err) {
        const msg = (err && err.message) || String(err);
        const is4xx = /(^|\s)(401|403|404|409|422)/.test(msg) || msg.toLowerCase().includes('policy') || msg.toLowerCase().includes('permission');
        const isRate = msg.includes('429') || msg.toLowerCase().includes('rate');
        if (is4xx) {
          console.error('🚫 [URL-LOGS] Non-retryable error:', msg);
          db.saveError('url_logs', err, { batch_size: chunk.length });
          throw err;
        }
        const base = isRate ? 1500 : 500;
        const backoff = Math.min(10000, base * 2 ** attempt) + Math.floor(Math.random() * 300);
        console.warn(`🔁 [URL-LOGS] Retry ${attempt + 1}/${maxRetries} in ${backoff}ms:`, msg);
        await new Promise(r => setTimeout(r, backoff));
      }
    }
    throw new Error('URL logs insert failed after retries');
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
    if (this.syncInterval) return; // idempotent guard
    // Sync every 10 seconds for faster app detection updates
    this.syncInterval = setInterval(() => {
      this.syncQueue();
    }, 10000);

    // Initial sync after 3 seconds
    setTimeout(() => this.syncQueue(), 3000);
  }

  async syncQueue() {
    if (!this.isOnline) return;

    const totalItems = Object.values(this.queue).reduce((sum, arr) => sum + arr.length, 0);
    if (totalItems === 0) return;

    logger.info({ category: 'SYNC', step: 'SYNC START', ctx: { totalItems } });

    // CRITICAL FIX: Sync time logs FIRST so other tables can reference them
    // Track if time log sync succeeded - if not, dependent tables may fail with FK errors
    let timeLogSyncSuccess = true;
    try {
      await this.syncTimeLogs();
    } catch (error) {
      timeLogSyncSuccess = false;
      logger.error({ category: 'SYNC', step: 'TIME LOG SYNC FAILED', message: error.message });
      console.error('❌ [SYNC] Time log sync failed - dependent tables may fail with FK errors');
    }
    
    // Then sync items that depend on time_log_id
    // Only proceed if time log sync succeeded OR if there are no time logs pending
    // This prevents FK constraint errors when time_log_id references don't exist
    const hasTimeLogsToSync = this.queue.timeLogs?.length > 0;
    
    if (timeLogSyncSuccess || !hasTimeLogsToSync) {
      await this.syncAppLogs();
      await this.syncUrlLogs();
      await this.syncIdleLogs();
    } else {
      logger.warn({ 
        category: 'SYNC', 
        step: 'DEPENDENT SYNC DEFERRED', 
        message: 'Skipping app/url/idle logs sync until time logs succeed',
        ctx: { 
          appLogs: this.queue.appLogs?.length || 0,
          urlLogs: this.queue.urlLogs?.length || 0,
          idleLogs: this.queue.idleLogs?.length || 0
        }
      });
    }
    
    // Screenshots and fraud alerts don't depend on time_log_id FK
    await this.syncScreenshots();
    await this.syncFraudAlerts();

    this.saveQueue();
  }

  async syncScreenshots() {
    const screenshots = [...this.queue.screenshots];
    
    for (let i = screenshots.length - 1; i >= 0; i--) {
      const screenshot = screenshots[i];
      
      try {
        await this.uploadScreenshot(screenshot);
        this.queue.screenshots.splice(i, 1);
        logger.info({ category: 'SYNC', step: 'SCREENSHOT SYNCED' });
      } catch (error) {
        screenshot.retries++;
        logger.warn({ category: 'SYNC', step: 'SCREENSHOT RETRY', message: error.message, ctx: { retry: screenshot.retries } });
        
        // Remove after 5 failed attempts
        if (screenshot.retries >= 5) {
          this.queue.screenshots.splice(i, 1);
          logger.warn({ category: 'SYNC', step: 'SCREENSHOT DROPPED', message: 'Removed after 5 retries' });
        }
      }
    }
  }

  async syncAppLogs() {
    const appLogs = [...this.queue.appLogs];
    
    for (let i = appLogs.length - 1; i >= 0; i--) {
      const logData = appLogs[i];
      
      try {
        await this.uploadAppLogs(logData);
        this.queue.appLogs.splice(i, 1);
        logger.info({ category: 'SYNC', step: 'APP LOGS SYNCED' });
      } catch (error) {
        logData.retries++;
        
        // CRITICAL FIX: Handle foreign key constraint errors specifically
        const isFkError = error.message.includes('violates foreign key constraint') && error.message.includes('time_log_id_fkey');
        if (isFkError) {
          logger.warn({ category: 'SYNC', step: 'APP LOGS FK WAIT', message: 'time_log_id not yet synced - will retry', ctx: { retry: logData.retries } });
        } else {
          logger.warn({ category: 'SYNC', step: 'APP LOGS RETRY', message: error.message, ctx: { retry: logData.retries } });
        }
        
        if (logData.retries >= 5) {
          this.queue.appLogs.splice(i, 1);
          const logCount = Array.isArray(logData.logs) ? logData.logs.length : 1;
          console.error(`❌ [SYNC] Dropped ${logCount} app log(s) after 5 retries. Reason: ${isFkError ? 'FK constraint (time_log_id)' : error.message}`);
          logger.error({ 
            category: 'SYNC', 
            step: 'APP LOGS DROPPED', 
            message: `Dropped ${logCount} app log(s) after 5 retries`,
            ctx: { reason: isFkError ? 'FK constraint' : 'Other error', logCount }
          });
        }
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
        logData.retries++;
        
        // CRITICAL FIX: Handle foreign key constraint errors specifically
        const isFkError = error.message.includes('violates foreign key constraint') && error.message.includes('time_log_id_fkey');
        if (isFkError) {
          logger.warn({ category: 'SYNC', step: 'URL LOGS FK WAIT', message: 'time_log_id not yet synced - will retry', ctx: { retry: logData.retries } });
        } else {
          logger.warn({ category: 'SYNC', step: 'URL LOGS RETRY', message: error.message, ctx: { retry: logData.retries } });
        }
        
        if (logData.retries >= 5) {
          this.queue.urlLogs.splice(i, 1);
          const logCount = Array.isArray(logData.logs) ? logData.logs.length : 1;
          console.error(`❌ [SYNC] Dropped ${logCount} URL log(s) after 5 retries. Reason: ${isFkError ? 'FK constraint (time_log_id)' : error.message}`);
          logger.error({ 
            category: 'SYNC', 
            step: 'URL LOGS DROPPED', 
            message: `Dropped ${logCount} URL log(s) after 5 retries`,
            ctx: { reason: isFkError ? 'FK constraint' : 'Other error', logCount }
          });
        }
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
        logData.retries++;
        logger.warn({ category: 'SYNC', step: 'IDLE LOG RETRY', message: error.message, ctx: { retry: logData.retries } });
        
        if (logData.retries >= 5) {
          this.queue.idleLogs.splice(i, 1);
          logger.warn({ category: 'SYNC', step: 'IDLE LOG DROPPED', message: 'Removed after 5 retries' });
        }
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
        logData.retries++;
        logger.warn({ category: 'SYNC', step: 'TIME LOG RETRY', message: error.message, ctx: { retry: logData.retries } });
        
        if (logData.retries >= 5) {
          this.queue.timeLogs.splice(i, 1);
          logger.warn({ category: 'SYNC', step: 'TIME LOG DROPPED', message: 'Removed after 5 retries' });
        }
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
  monitorConnection() {
    setInterval(async () => {
      try {
        // Enhanced connectivity test with longer timeout and fallback method
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection test timeout')), 20000)
        );
        
        // Skip health check endpoint (requires auth) - use database query directly
        const healthCheckPromise = this.supabase
          .from('users')
          .select('id')
          .limit(1);
          
        const { data, error } = await Promise.race([healthCheckPromise, timeoutPromise]);

        const wasOnline = this.isOnline;
        this.isOnline = !error;

        if (!wasOnline && this.isOnline) {
          logger.info({ category: 'SYNC', step: 'ONLINE', message: 'Connection restored - starting sync' });
          // Wait a bit before syncing to ensure stable connection
          setTimeout(() => this.syncQueue(), 2000);
        } else if (wasOnline && !this.isOnline) {
          // Reduce log spam - only log once when going offline
          if (process.env.DEBUG_SYNC !== 'true') {
            console.log('📴 [SYNC] Offline mode - data will be queued');
          } else {
            logger.warn({ category: 'SYNC', step: 'OFFLINE', message: 'Connection lost - offline mode' });
          }
        }

      } catch (error) {
        const wasOnline = this.isOnline;
        this.isOnline = false;
        
        if (wasOnline) {
          logger.warn({ category: 'SYNC', step: 'OFFLINE', message: 'Connection lost - offline mode' });
          logger.debug({ category: 'SYNC', step: 'CONNECTION ERROR', message: error.message.split('\n')[0] });
        }
      }
    }, 45000); // Check every 45 seconds for better performance
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