/**
 * Enhanced Sync Manager Module
 * Handles all data synchronization, IPC communication, and data batching
 * Extracted from main.js for modular architecture
 */

const cleanupRegistry = require('../core/cleanup-registry');
const {
  isBackendTimeLogsEnabled,
  insertAppLogsBatch,
  insertUrlLogsBatch,
  insertIdleLog,
} = require('../utils/backend-time-logs');

class EnhancedSyncManager {
  constructor(config, supabaseService) {
    this.config = config;
    this.supabaseService = supabaseService;
    this.activitySyncInterval = null;
    this.consolidatedIPCInterval = null;
    this.urlSyncInterval = null;
    this.isTracking = false;
    
    // Performance configuration
    this.batchConfig = {
      maxBatchSize: Number(process.env.URL_SYNC_BATCH_MAX || 50),
      flushIntervalMs: Number(process.env.URL_SYNC_FLUSH_MS || 1000),
      offlineFlushMs: Number(process.env.URL_SYNC_OFFLINE_FLUSH_MS || 2000),
      statementTimeoutMs: Number(process.env.URL_SYNC_STATEMENT_TIMEOUT_MS || 5000),
      queuePressureThreshold: 500, // Force flush if batch queue exceeds this
      queuePressureTimeout: 3000, // Time to wait before forcing flush
      realtimeFlushMs: 750 // Faster flush when realtime active
    };
    
    // Database retry with exponential backoff
    this.dbBackoff = {
      isActive: false,
      retryCount: 0,
      maxRetries: 5,
      baseDelayMs: 1000,
      maxDelayMs: 15000,
      nextRetryAt: 0
    };
    
    // Queue pressure monitoring
    this.queuePressure = {
      startTime: null,
      isActive: false
    };
    
    // Realtime subscriber tracking
    this.hasRealtimeSubscribers = false;
    
    // Batch queues
    this.batchQueues = {
      urlLogs: [],
      appLogs: [],
      activities: []
    };
    
    // Flush timers
    this.flushTimers = new Map();
    
    // Register for cleanup
    cleanupRegistry.registerResource({
      name: 'enhancedSyncManager',
      cleanup: async () => this.shutdown()
    });
  }

  initialize({ isTracking = false } = {}) {
    this.isTracking = isTracking;
    this.startUrlSync();
    console.log('🔄 [ENHANCED-SYNC-MANAGER] Initialized');
  }

  setTrackingState(tracking) {
    this.isTracking = tracking;
  }

  // === ACTIVITY SYNC FUNCTIONS ===
  
  startActivitySync() {
    if (this.activitySyncInterval) {
      clearInterval(this.activitySyncInterval);
    }

    let syncMs = 30000;
    try {
      const { IPC } = require('../utils/power-profile');
      syncMs = IPC.activitySyncMs;
    } catch (_) {}
    
    this.activitySyncInterval = setInterval(() => {
      this.processActivityQueue();
    }, syncMs);
    
    cleanupRegistry.registerInterval(this.activitySyncInterval, 'Activity Sync');
    console.log(`🔄 [ACTIVITY-SYNC] Started (${Math.round(syncMs / 1000)}s intervals)`);
  }

  stopActivitySync() {
    if (this.activitySyncInterval) {
      clearInterval(this.activitySyncInterval);
      this.activitySyncInterval = null;
      console.log('🔄 [ACTIVITY-SYNC] Stopped');
    }
  }

  processActivityQueue() {
    try {
      if (!this.isTracking) return;
      
      // Process queued activity data
      if (process.env.DEBUG_SYNC) {
        console.log('🔄 [ACTIVITY-SYNC] Processing activity queue...');
      }
      
      // Send activity data to renderer safely
      this.sendActivityToRendererSafe();
      
    } catch (error) {
      console.log('❌ [ACTIVITY-SYNC] Error processing queue:', error.message);
    }
  }

  sendActivityToRendererSafe(activityData = null, allowQueue = true) {
    try {
      if (!global.mainWindow || global.mainWindow.isDestroyed()) {
        return;
      }

      const data = activityData || this.getDefaultActivityData();
      global.mainWindow.webContents.send('activity-update', data);
      
    } catch (error) {
      console.log('⚠️ [SYNC] Error sending to renderer:', error.message);
      
      if (allowQueue) {
        // Queue for later if needed
        console.log('📦 [SYNC] Queuing data for later transmission');
      }
    }
  }

  safeSendToRenderer(channel, data) {
    try {
      if (!global.mainWindow || global.mainWindow.isDestroyed()) {
        console.log(`⚠️ [SYNC] Cannot send ${channel} - window not available`);
        return false;
      }

      // CRITICAL FIX: Only send activity updates when tracking is active
      if (channel === 'activity-update' && !this.isTracking) {
        // Don't send activity updates when not tracking
        return false;
      }

      global.mainWindow.webContents.send(channel, data);
      
      // Debug log for activity updates
      if (channel === 'activity-update') {
        try { const { logger } = require('../utils/logger'); logger && logger.debug({ category: 'IPC', step: 'activity-update: SENT' }); } catch {}
      }
      
      return true;
      
    } catch (error) {
      console.log(`❌ [SYNC] Error sending ${channel}:`, error.message);
      return false;
    }
  }

  // === CONSOLIDATED IPC FUNCTIONS ===
  
  startConsolidatedIPC() {
    if (this.consolidatedIPCInterval) {
      clearInterval(this.consolidatedIPCInterval);
    }

    let ipcMs = 15000;
    try {
      const { IPC } = require('../utils/power-profile');
      ipcMs = IPC.consolidatedMs;
    } catch (_) {}
    
    this.consolidatedIPCInterval = setInterval(() => {
      if (!this.isTracking) return;
      
      try {
        // Batch send all data types
        this.batchActivityUpdate();
        this.batchTimerUpdate();
        this.batchScreenshotUpdate();
        this.batchSyncUpdate();
        this.batchAppUpdate();
        
      } catch (error) {
        console.log('❌ [IPC] Consolidated IPC error:', error.message);
      }
    }, ipcMs);
    
    cleanupRegistry.registerInterval(this.consolidatedIPCInterval, 'Consolidated IPC');
    console.log(`📡 [IPC] Consolidated IPC started (${Math.round(ipcMs / 1000)}s intervals)`);
  }

  stopConsolidatedIPC() {
    if (this.consolidatedIPCInterval) {
      clearInterval(this.consolidatedIPCInterval);
      this.consolidatedIPCInterval = null;
      console.log('📡 [IPC] Consolidated IPC stopped');
    }
  }

  // === DEFAULT DATA GENERATORS ===
  
  getDefaultActivityData() {
    return {
      mouseClicks: global.displayActivityStats?.clicks || 0,
      keystrokes: global.displayActivityStats?.keys || 0,
      mouseMovements: global.displayActivityStats?.moves || 0,
      totalActivity: 0,
      activityPercent: 100,
      focusPercent: 100,
      currentSession: global.currentSession,
      isTracking: this.isTracking,
      isPaused: global.isPaused || false,
      lastUpdate: Date.now()
    };
  }

  getDefaultTimerData() {
    return {
      isTracking: this.isTracking,
      isPaused: global.isPaused || false,
      currentSession: global.currentSession,
      elapsedTime: global.currentSession ? Date.now() - global.currentSession.startTime : 0,
      lastUpdate: Date.now()
    };
  }

  getDefaultScreenshotData() {
    return {
      nextScreenshotTime: global.nextScreenshotTime,
      screenshotInterval: this.config?.screenshot_interval_seconds || 30,
      screenshotsEnabled: this.isTracking,
      lastScreenshotTime: global.lastScreenshotTime,
      lastUpdate: Date.now()
    };
  }

  // === BATCH UPDATE FUNCTIONS ===
  
  batchActivityUpdate(activityData = null) {
    const data = activityData || this.getDefaultActivityData();
    data.totalActivity = data.mouseClicks + data.keystrokes + data.mouseMovements;
    this.safeSendToRenderer('activity-update', data);
  }

  batchTimerUpdate(timerData = null) {
    const data = timerData || this.getDefaultTimerData();
    this.safeSendToRenderer('timer-update', data);
  }

  batchScreenshotUpdate(screenshotData = null) {
    const data = screenshotData || this.getDefaultScreenshotData();
    this.safeSendToRenderer('screenshot-update', data);
  }

  batchSyncUpdate(syncData = null) {
    const data = syncData || {
      lastSync: Date.now(),
      syncStatus: 'active',
      queuedItems: 0,
      errors: 0
    };
    this.safeSendToRenderer('sync-update', data);
  }

  batchAppUpdate(appData = null) {
    const data = appData || {
      currentApp: global.lastActiveApp || 'Unknown',
      lastAppDetection: global.lastAppDetectionTime || Date.now(),
      appsToday: 0,
      lastUpdate: Date.now()
    };
    this.safeSendToRenderer('app-update', data);
  }

  sendActivityToRenderer(activityData) {
    // Enhanced version with error handling
    try {
      if (!global.mainWindow || global.mainWindow.isDestroyed()) {
        console.log('⚠️ [SYNC] Main window not available for activity update');
        return;
      }

      const enhancedData = {
        ...activityData,
        timestamp: Date.now(),
        source: 'enhanced-sync-manager'
      };

      global.mainWindow.webContents.send('activity-update', enhancedData);
      
    } catch (error) {
      console.log('❌ [SYNC] Enhanced activity send error:', error.message);
    }
  }

  // === URL LOGS COMPATIBILITY ===
  
  /**
   * Add URL logs - compatibility method for BrowserUrlManager
   */
  async addUrlLogs(urlLogs) {
    try {
      console.log(`🌐 [ENHANCED-SYNC] Adding ${urlLogs.length} URL logs to queue`);
      
      let hasCloseOnly = false;
      
      // Add each URL log to the queue
      for (const urlLog of urlLogs) {
        await this.addToQueue('urlLogs', urlLog);
        
        // Check if this is a close-only event (null URL for idle/shutdown)
        if (!urlLog.url && (urlLog.diagnostic?.event === 'CLOSE_ONLY' || urlLog.diagnostic?.reason)) {
          hasCloseOnly = true;
        }
      }
      
      // Flush immediately if we have close-only events for quick UI updates
      if (hasCloseOnly && this.batchQueues.urlLogs.length > 0) {
        console.log(`🚀 [ENHANCED-SYNC] Flushing immediately due to close-only events`);
        await this.flushBatchQueue('urlLogs');
      }
      
      console.log(`✅ [ENHANCED-SYNC] Successfully queued ${urlLogs.length} URL logs`);
      return true;
      
    } catch (error) {
      console.error(`❌ [ENHANCED-SYNC] Error adding URL logs:`, error);
      return false;
    }
  }

  // === URL SYNC FUNCTIONS ===
  
  startUrlSync() {
    if (this.urlSyncInterval) {
      clearInterval(this.urlSyncInterval);
    }
    
    // Process URL queue every 15 seconds
    this.urlSyncInterval = setInterval(() => {
      this.processUrlQueue();
      this.processIdleQueue();
    }, 15000);
    
    cleanupRegistry.registerInterval(this.urlSyncInterval, 'URL Sync');
    console.log('🌐 [URL-SYNC] Started (15 second intervals)');
  }
  
  stopUrlSync() {
    if (this.urlSyncInterval) {
      clearInterval(this.urlSyncInterval);
      this.urlSyncInterval = null;
      console.log('🌐 [URL-SYNC] Stopped');
    }
  }
  
  async processUrlQueue() {
    let urlLogs = [];
    try {
      if (!global.offlineQueue?.urlLogs?.length) {
        // console.log('🌐 [URL-SYNC] Queue empty, nothing to process');
        return;
      }
      
      console.log(`🌐 [URL-SYNC] Processing ${global.offlineQueue.urlLogs.length} URL logs`);
      console.log(`📤 [URL-SYNC] Starting batch upload to backend...`);
      
      // Get all URL logs from queue
      urlLogs = [...global.offlineQueue.urlLogs];
      global.offlineQueue.urlLogs = [];
      
      // Process in batches with per-batch error handling
      const BATCH_SIZE = 50;
      let hadFailures = false;
      let successfulBatches = 0;
      
      for (let i = 0; i < urlLogs.length; i += BATCH_SIZE) {
        const batch = urlLogs.slice(i, i + BATCH_SIZE);
        console.log(`🌐 [URL-SYNC] Uploading batch ${Math.floor(i/BATCH_SIZE) + 1} (${batch.length} URLs)...`);
        
        try {
          await this._insertUrlBatch(batch);
          successfulBatches++;
          console.log(`✅ [URL-SYNC] Batch ${Math.floor(i/BATCH_SIZE) + 1} uploaded successfully`);
        } catch (error) {
          hadFailures = true;
          const message = (error && error.message) ? error.message : String(error);
          // Transient network errors are common; downgrade to warning and requeue only this batch
          console.warn(`⚠️ [URL-SYNC] Batch ${Math.floor(i/BATCH_SIZE) + 1} failed, will retry later:`, message);
          if (global.offlineQueue) {
            global.offlineQueue.urlLogs.unshift(...batch);
          }
        }
      }
      
      if (hadFailures) {
        console.warn(`⚠️ [URL-SYNC] ${successfulBatches} batches succeeded, some failed; queued for retry`);
      } else {
        console.log(`✅ [URL-SYNC] Successfully uploaded ${urlLogs.length} URL logs (${successfulBatches} batches)`);
      }
      
    } catch (error) {
      console.error('❌ [URL-SYNC] Error processing queue:', error);
      // Put failed items back in queue
      if (urlLogs?.length && global.offlineQueue) {
        global.offlineQueue.urlLogs.unshift(...urlLogs);
      }
    }
  }
  
  async _insertUrlBatch(batch) {
    // Check if we're in database backoff
    if (this.dbBackoff.isActive && Date.now() < this.dbBackoff.nextRetryAt) {
      const remainingMs = this.dbBackoff.nextRetryAt - Date.now();
      throw new Error(`Database in backoff, retry in ${remainingMs}ms`);
    }

    if (isBackendTimeLogsEnabled(this.config)) {
      // Backend forceUrlInsert closes *other* open URLs and skips insert when the
      // same site_url is already open — do NOT close-all here (that caused
      // close+reinsert spam for the same link every flush).
      await insertUrlLogsBatch(batch, this.config);
      this.clearDbBackoff();
      console.log(`✅ [URL-SYNC] Synced ${batch.length} URL session(s) via backend RDS`);
      return;
    }
    
    let perfPost = null;
    try { if (global.performanceMonitor) { perfPost = global.performanceMonitor.trackSyncPost(); } } catch {}
    try {
      if (!this.supabaseService) {
        console.error('❌ [URL-SYNC] Supabase service not available');
        return;
      }
      
      // Sanitize each row defensively to avoid schema errors - FIXED for app_url_activity
      const sanitizeUrlLog = (row) => {
        // Normalize array payloads like [urlLog]
        const base = Array.isArray(row) ? row[0] : row;
        const { attempts, queuedAt, ...rest } = base || {};
        // Whitelist only known columns for app_url_activity table
        const allowed = {
          organization_id: null, // Will be set by database trigger
          user_id: rest?.user_id || rest?.userId,
          device_id: null, // Will be set by database trigger
          time_log_id: rest?.time_log_id ?? rest?.timeLogId ?? null,
          site_url: (rest?.site_url || rest?.url) || null,
          domain: rest?.domain || null,
          title: rest?.title || null,
          browser: rest?.browser || null,
          confidence: 'high',
          privacy_flags: rest?.privacy_flags || null,
          started_at: rest?.timestamp || new Date().toISOString(),
          ended_at: null // Will be closed by next URL or cleanup
        };
        // Remove undefined values so PostgREST doesn't see unknowns
        Object.keys(allowed).forEach(k => allowed[k] === undefined && delete allowed[k]);
        return allowed;
      };

      const payload = batch.map(sanitizeUrlLog);

      // Close other open URL slices (different site_url only). Same continuous URL
      // stays open — never close+reinsert the active visit.
      const toInsert = [];
      try {
        for (const row of payload) {
          if (!row.user_id || !row.site_url) continue;
          const { data: openSame } = await this.supabaseService
            .from('app_url_activity')
            .select('id')
            .eq('user_id', row.user_id)
            .eq('site_url', row.site_url)
            .is('ended_at', null)
            .limit(1);
          if (openSame && openSame.length > 0) {
            // Already recording this link — refresh title only.
            await this.supabaseService
              .from('app_url_activity')
              .update({
                title: row.title || undefined,
                domain: row.domain || undefined,
                browser: row.browser || undefined,
              })
              .eq('id', openSame[0].id);
            continue;
          }
          await this.supabaseService
            .from('app_url_activity')
            .update({ ended_at: row.started_at })
            .eq('user_id', row.user_id)
            .is('ended_at', null)
            .neq('site_url', row.site_url)
            .lt('started_at', row.started_at);
          toInsert.push(row);
        }
      } catch (closeErr) {
        console.warn('⚠️ [URL-SYNC] Failed to dedupe/close previous URL slices (non-fatal):', closeErr?.message);
        toInsert.push(...payload);
      }

      if (toInsert.length === 0) {
        this.clearDbBackoff();
        console.log('✅ [URL-SYNC] No new URL rows (same visits already open)');
        return;
      }

      // Add statement timeout wrapper - FIXED: Insert into app_url_activity TABLE
      const insertPromise = this.supabaseService
        .from('app_url_activity')
        .insert(toInsert, { returning: 'minimal' });
        
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Statement timeout')), this.batchConfig.statementTimeoutMs);
      });
      
      const { error } = await Promise.race([insertPromise, timeoutPromise]);
        
      if (error) {
        const message = (error && (error.message || error.error_description)) ? (error.message || error.error_description) : String(error);
        const status = (typeof error.status === 'number') ? error.status : undefined;
        const msgLower = (message || '').toLowerCase();
        const isTimeout = msgLower.includes('timeout') || msgLower.includes('statement timeout');
        const isTransient = (status && status >= 500) || msgLower.includes('fetch failed') || msgLower.includes('timeout') || msgLower.includes('network');
        
        if (isTimeout || isTransient) {
          this.activateDbBackoff(isTimeout);
          
          // Drop diagnostic verbosity during backoff
          if (!this.dbBackoff.verbosityDropped) {
            console.warn('⚠️ [URL-SYNC] Database issues detected, dropping diagnostic verbosity during backoff');
            this.dbBackoff.verbosityDropped = true;
          }
          
          if (this.dbBackoff.retryCount === 0) {
            console.warn('⚠️ [URL-SYNC] Database error, activating exponential backoff:', { status, message });
          }
        } else {
          console.error('❌ [URL-SYNC] Persistent database error:', { status, message });
        }
        throw error;
      }
      
      // Success - clear backoff
      this.clearDbBackoff();
      
      if (!this.dbBackoff.verbosityDropped) {
        console.log(`✅ [URL-SYNC] Inserted ${batch.length} URL logs`);
      }
      
    } catch (error) {
      // Let caller decide how to log/requeue. Avoid double logging here.
      throw error;
    } finally {
      try { if (global.performanceMonitor && perfPost) { global.performanceMonitor.endTimer(perfPost); } } catch {}
    }
  }
  
  // Activate exponential backoff for database issues
  activateDbBackoff(isTimeout = false) {
    this.dbBackoff.isActive = true;
    this.dbBackoff.retryCount++;
    
    // Exponential backoff: baseDelay * 2^retryCount, capped at maxDelay
    const backoffDelay = Math.min(
      this.dbBackoff.baseDelayMs * Math.pow(2, this.dbBackoff.retryCount - 1),
      this.dbBackoff.maxDelayMs
    );
    
    this.dbBackoff.nextRetryAt = Date.now() + backoffDelay;
    
    if (this.dbBackoff.retryCount <= 2) {
      console.warn(`🔄 [URL-SYNC] Database backoff #${this.dbBackoff.retryCount}, retry in ${backoffDelay}ms`);
    }
  }
  
  // Clear database backoff on success
  clearDbBackoff() {
    if (this.dbBackoff.isActive) {
      const wasBackoff = this.dbBackoff.retryCount > 0;
      this.dbBackoff.isActive = false;
      this.dbBackoff.retryCount = 0;
      this.dbBackoff.nextRetryAt = 0;
      
      if (this.dbBackoff.verbosityDropped) {
        console.log('✅ [URL-SYNC] Database connectivity restored, resuming normal logging');
        this.dbBackoff.verbosityDropped = false;
      }
      
      if (wasBackoff) {
        console.log('✅ [URL-SYNC] Database backoff cleared, normal operations resumed');
      }
    }
  }

  // === QUEUE MANAGEMENT ===
  
  /**
   * Add item to sync queue with optimized batching
   */
  async addToQueue(type, data) {
    try {
      // Perf: enqueue timing
      let perfEnq = null;
      try { if (global.performanceMonitor) { perfEnq = global.performanceMonitor.trackSyncEnqueue(); } } catch {}

      // Initialize queue if it doesn't exist
      if (!global.offlineQueue) {
        global.offlineQueue = {
          screenshots: [],
          activities: [],
          timeLogs: [],
          appLogs: [],
          urlLogs: [],
          idleLogs: [],
          fraudAlerts: []
        };
      }
      
      // Handle batch queue types
      if (this.batchQueues[type] !== undefined) {
        const res = await this.addToBatchQueue(type, data);
        try { if (global.performanceMonitor && perfEnq) { global.performanceMonitor.endTimer(perfEnq); } } catch {}
        return res;
      }
      
      // Fallback to original queue behavior for non-batched types
      if (global.offlineQueue[type]) {
        let normalized = data;
        if ((type === 'urlLogs' || type === 'appLogs') && Array.isArray(data)) {
          normalized = data[0];
        }
        global.offlineQueue[type].push({
          ...normalized,
          queuedAt: new Date().toISOString(),
          attempts: 0
        });
        
        // Trigger immediate sync attempt if online
        if (this.isTracking) {
          this.processQueueItem(type, data);
        }
      } else {
        console.error(`❌ [QUEUE] Unknown queue type: ${type}`);
        try { if (global.performanceMonitor && perfEnq) { global.performanceMonitor.endTimer(perfEnq); } } catch {}
        return false;
      }
      
      try { if (global.performanceMonitor && perfEnq) { global.performanceMonitor.endTimer(perfEnq); } } catch {}
      return true;
      
    } catch (error) {
      console.error(`❌ [QUEUE] Error adding ${type} to queue:`, error);
      return false;
    }
  }
  
  /**
   * Add item to batch queue with automatic flushing and pressure valve
   */
  async addToBatchQueue(type, data) {
    try {
      // Normalize data
      let normalized = Array.isArray(data) ? data : [data];

      // Drop consecutive duplicate app/URL rows (same continuous focus).
      if (type === 'urlLogs' || type === 'appLogs') {
        normalized = normalized.filter((item) => {
          if (!item || typeof item !== 'object') return false;
          const key =
            type === 'urlLogs'
              ? String(item.site_url || item.url || '').trim().toLowerCase()
              : String(item.app_name || '').trim().toLowerCase();
          if (!key) return false;
          const last = this._lastQueuedFocusKey?.[type];
          if (last && last === key) {
            return false;
          }
          if (!this._lastQueuedFocusKey) this._lastQueuedFocusKey = {};
          this._lastQueuedFocusKey[type] = key;
          return true;
        });
        if (normalized.length === 0) return true;
      }
      
      // Add to batch queue
      this.batchQueues[type].push(...normalized);
      
      // Queue pressure monitoring
      const currentSize = this.batchQueues[type].length;
      if (currentSize >= this.batchConfig.queuePressureThreshold) {
        if (!this.queuePressure.isActive) {
          this.queuePressure.isActive = true;
          this.queuePressure.startTime = Date.now();
          console.warn(`⚠️ [QUEUE-PRESSURE] ${type} queue at ${currentSize} items, monitoring pressure`);
        } else {
          // Check if pressure has been active for too long
          const pressureDuration = Date.now() - this.queuePressure.startTime;
          if (pressureDuration >= this.batchConfig.queuePressureTimeout) {
            console.warn(`🚨 [QUEUE-PRESSURE] Force flushing ${type} due to sustained pressure (${pressureDuration}ms)`);
            
            // Force flush and spill to offline queue if network is down
            try {
              await this.flushBatchQueue(type);
              this.queuePressure.isActive = false;
            } catch (error) {
              console.error(`❌ [QUEUE-PRESSURE] Force flush failed, spilling to offline queue:`, error);
              // Spill entire batch to offline queue
              const spilledItems = this.batchQueues[type].splice(0);
              if (global.offlineQueue && global.offlineQueue[type]) {
                global.offlineQueue[type].push(...spilledItems.map(item => ({
                  ...item,
                  queuedAt: new Date().toISOString(),
                  attempts: 0,
                  spilledFromPressure: true
                })));
              }
              this.queuePressure.isActive = false;
            }
            return true;
          }
        }
      } else if (this.queuePressure.isActive && currentSize < this.batchConfig.queuePressureThreshold * 0.5) {
        // Pressure relieved
        this.queuePressure.isActive = false;
        console.log(`✅ [QUEUE-PRESSURE] Pressure relieved for ${type} (${currentSize} items)`);
      }
      
      // Check if we should flush immediately
      const shouldFlush = currentSize >= this.batchConfig.maxBatchSize;
      
      if (shouldFlush) {
        // Clear any pending timer and flush immediately
        if (this.flushTimers.has(type)) {
          clearTimeout(this.flushTimers.get(type));
          this.flushTimers.delete(type);
        }
        
        await this.flushBatchQueue(type);
      } else {
        // Set flush timer if not already set
        if (!this.flushTimers.has(type)) {
          // Latency guard: use faster flush if realtime subscribers are active
          let flushDelay = global.offlineQueue[type]?.length > 0 ? 
            this.batchConfig.offlineFlushMs : this.batchConfig.flushIntervalMs;
            
          if (this.hasRealtimeSubscribers && type === 'urlLogs') {
            flushDelay = Math.min(flushDelay, this.batchConfig.realtimeFlushMs);
          }
            
          const timer = setTimeout(() => {
            this.flushTimers.delete(type);
            this.flushBatchQueue(type);
          }, flushDelay);
          
          this.flushTimers.set(type, timer);
        }
      }
      
      return true;
    } catch (error) {
      console.error(`❌ [BATCH-QUEUE] Error adding to ${type}:`, error);
      return false;
    }
  }
  
  /**
   * Set realtime subscriber status for latency optimization
   */
  setRealtimeSubscribers(hasSubscribers) {
    const wasActive = this.hasRealtimeSubscribers;
    this.hasRealtimeSubscribers = hasSubscribers;
    
    if (hasSubscribers && !wasActive) {
      console.log('📡 [SYNC] Realtime subscribers active - enabling faster flush');
    } else if (!hasSubscribers && wasActive) {
      console.log('📡 [SYNC] No realtime subscribers - reverting to normal flush timing');
    }
  }
  
  /**
   * Flush batch queue for a specific type
   */
  async flushBatchQueue(type) {
    let batch = []; // CRITICAL FIX: Initialize at function scope to prevent "batch is not defined" error in catch block
    try {
      // Skip DB inserts while screen is locked to prevent bad data (lock screen apps/URLs)
      if (global.isScreenLocked) {
        // Don't drain the queue — keep items so they flush when screen unlocks
        // But only skip url/app logs, not other critical data
        if (type === 'urlLogs' || type === 'appLogs') {
          console.log(`🔒 [SYNC] Deferring ${type} flush - screen is locked`);
          return;
        }
      }

      let perfBatch = null;
      try { if (global.performanceMonitor) { perfBatch = global.performanceMonitor.trackSyncBatch(); } } catch {}
      batch = this.batchQueues[type].splice(0); // Remove all items
      
      if (batch.length === 0) {
        try { if (global.performanceMonitor && perfBatch) { global.performanceMonitor.endTimer(perfBatch); } } catch {}
        return;
      }
      
      if (type === 'urlLogs') {
        await this._insertUrlBatch(batch);
        console.log(`✅ [BATCH-FLUSH] Flushed ${batch.length} URL logs`);
      } else if (type === 'appLogs') {
        await this._insertAppBatch(batch);
        console.log(`✅ [BATCH-FLUSH] Flushed ${batch.length} app logs`);
      }
      try { if (global.performanceMonitor && perfBatch) { global.performanceMonitor.endTimer(perfBatch); } } catch {}
      
    } catch (error) {
      console.error(`❌ [BATCH-FLUSH] Error flushing ${type}:`, error);
      // Put items back in offline queue on failure
      // CRITICAL FIX: Now batch is always defined (empty array if error occurs early)
      if (global.offlineQueue && global.offlineQueue[type] && batch.length > 0) {
        global.offlineQueue[type].push(...batch.map(item => ({
          ...item,
          queuedAt: new Date().toISOString(),
          attempts: (item.attempts || 0) + 1
        })));
      }
    }
  }
  
  async processIdleQueue() {
    if (!global.offlineQueue?.idleLogs?.length) return;

    const pending = [...global.offlineQueue.idleLogs];
    global.offlineQueue.idleLogs = [];

    for (const item of pending) {
      const { attempts, queuedAt, duration_minutes, ...log } = item;
      try {
        if (isBackendTimeLogsEnabled(this.config)) {
          await insertIdleLog(log, this.config);
        } else if (global.supabaseService) {
          const { error } = await global.supabaseService.from('idle_logs').insert(log);
          if (error) throw new Error(error.message);
        }
        console.log('✅ [IDLE-SYNC] Flushed queued idle log');
      } catch (error) {
        console.warn('⚠️ [IDLE-SYNC] Queued idle log failed, will retry:', error?.message || error);
        global.offlineQueue.idleLogs.push({
          ...item,
          attempts: (attempts || 0) + 1,
        });
      }
    }
  }

  /**
   * Process single queue item
   */
  async processQueueItem(type, data) {
    try {
      switch (type) {
        case 'screenshots':
          // Screenshots are handled by the database save function
          break;
        case 'activities':
          // Activities are handled by the database manager
          break;
        case 'urlLogs': {
          // Process URL logs immediately when tracking is on (helps testing)
          const items = Array.isArray(data) ? data : [data];
          await this._insertUrlBatch(items);
          break;
        }
        case 'appLogs':
          await this._insertAppBatch(data);
          break;
        case 'idleLogs':
          await this.processIdleQueue();
          break;
        default:
          console.log(`📦 [QUEUE] Processing ${type} not implemented yet`);
      }
    } catch (error) {
      console.error(`❌ [QUEUE] Error processing ${type}:`, error);
    }
  }

  /**
   * Insert app logs batch to database
   */
  async _insertAppBatch(appLogs) {
    const items = Array.isArray(appLogs) ? appLogs : [appLogs];
    if (!items || items.length === 0) return;
    
    try {
      console.log(`📱 [SYNC] Inserting ${items.length} app logs to database`);

      if (isBackendTimeLogsEnabled(this.config)) {
        // Backend forceAppInsert closes *other* open apps and skips when the same
        // app_name is already open — avoid close-all+reinsert spam here.
        await insertAppLogsBatch(items, this.config);
        console.log(`✅ [SYNC] Successfully synced ${items.length} app session(s) via backend RDS`);
        return;
      }
      
      // Filter out queue-specific fields before inserting
      const rows = items.map(row => {
        const { attempts, queuedAt, ...clean } = row;
        return clean;
      });
      
      const { error } = await this.supabaseService
        .from('app_logs')
        .insert(rows, { returning: 'minimal' });

      if (error) throw error;
      
      console.log(`✅ [SYNC] Successfully inserted ${rows.length} app logs`);
    } catch (error) {
      console.error('❌ [SYNC] App logs batch insert failed:', error);
      throw error;
    }
  }
  
  /**
   * Get queue status
   */
  getQueueStatus() {
    if (!global.offlineQueue) {
      return { totalItems: 0, queues: {} };
    }
    
    const queues = {};
    let totalItems = 0;
    
    for (const [type, items] of Object.entries(global.offlineQueue)) {
      queues[type] = items.length;
      totalItems += items.length;
    }
    
    return { totalItems, queues };
  }

  /**
   * Add fraud alert to offline queue for batch processing
   * This method provides compatibility with anti-cheat detector
   */
  async addFraudAlert(fraudAlert) {
    try {
      const alertData = {
        user_id: fraudAlert.userId || this.config.user_id,
        alert_type: fraudAlert.type,
        severity: fraudAlert.severity,
        confidence: fraudAlert.confidence,
        risk_score: fraudAlert.riskScore,
        detection_details: fraudAlert.details || {},
        suspicious_patterns: fraudAlert.suspiciousPatterns,
        behavior_analysis: fraudAlert.behaviorAnalysis,
        activity_context: fraudAlert.activityContext,
        system_context: fraudAlert.systemContext,
        detected_at: new Date(fraudAlert.timestamp).toISOString()
      };
      
      // Add to offline queue for batch processing
      if (!global.offlineQueue) {
        global.offlineQueue = {};
      }
      if (!global.offlineQueue.fraudAlerts) {
        global.offlineQueue.fraudAlerts = [];
      }
      
      global.offlineQueue.fraudAlerts.push(alertData);
      
      // Hard cap: prevent unbounded queue growth (memory leak protection)
      const MAX_FRAUD_QUEUE_SIZE = 500;
      if (global.offlineQueue.fraudAlerts.length > MAX_FRAUD_QUEUE_SIZE) {
        const dropped = global.offlineQueue.fraudAlerts.length - MAX_FRAUD_QUEUE_SIZE;
        global.offlineQueue.fraudAlerts = global.offlineQueue.fraudAlerts.slice(-MAX_FRAUD_QUEUE_SIZE);
        console.warn(`⚠️ [ENHANCED-SYNC] Fraud alert queue exceeded ${MAX_FRAUD_QUEUE_SIZE}, dropped ${dropped} oldest alerts`);
      }
      
      console.log(`🚨 [ENHANCED-SYNC] Fraud alert queued: ${alertData.alert_type} (${alertData.severity}), queue size: ${global.offlineQueue.fraudAlerts.length}`);
      
      // Trigger immediate sync if queue is getting large
      if (global.offlineQueue.fraudAlerts.length >= 5) {
        console.log('⚠️ [ENHANCED-SYNC] Fraud alert queue threshold reached, triggering sync...');
        this.flushFraudAlerts().catch(err => 
          console.error('❌ [ENHANCED-SYNC] Failed to flush fraud alerts:', err)
        );
      }
    } catch (error) {
      console.error('❌ [ENHANCED-SYNC] Failed to queue fraud alert:', error);
    }
  }

  /**
   * Flush fraud alerts to database
   */
  async flushFraudAlerts() {
    if (!global.offlineQueue?.fraudAlerts || global.offlineQueue.fraudAlerts.length === 0) {
      return;
    }
    
    const alerts = [...global.offlineQueue.fraudAlerts];
    global.offlineQueue.fraudAlerts = [];
    
    try {
      console.log(`🔄 [ENHANCED-SYNC] Flushing ${alerts.length} fraud alerts to database...`);
      
      // Sanitize column names before insert (B3 fix: details -> detection_details)
      const sanitizedAlerts = alerts.map(alert => {
        const sanitized = { ...alert };
        // Fix column name mismatch: 'details' should be 'detection_details'
        if ('details' in sanitized && !('detection_details' in sanitized)) {
          sanitized.detection_details = sanitized.details;
          delete sanitized.details;
        }
        // Remove any unknown columns that could cause schema errors
        delete sanitized._retryCount;
        return sanitized;
      });
      
      const { error } = await this.supabaseService
        .from('fraud_alerts')
        .insert(sanitizedAlerts);
      
      if (error) {
        console.error('❌ [ENHANCED-SYNC] Failed to insert fraud alerts:', error);
        
        // Schema errors (PGRST204) are permanent - discard rather than re-queue
        if (error.code === 'PGRST204') {
          console.warn(`⚠️ [ENHANCED-SYNC] Schema error (${error.code}): ${error.message} - discarding ${alerts.length} alerts`);
          return;
        }
        
        // Transient errors: re-queue with retry counter, discard after 3 attempts
        const retriableAlerts = alerts
          .map(a => ({ ...a, _retryCount: (a._retryCount || 0) + 1 }))
          .filter(a => a._retryCount <= 3);
        
        const discarded = alerts.length - retriableAlerts.length;
        if (discarded > 0) {
          console.warn(`⚠️ [ENHANCED-SYNC] Discarded ${discarded} fraud alerts after 3 failed retries`);
        }
        
        if (retriableAlerts.length > 0) {
          global.offlineQueue.fraudAlerts.unshift(...retriableAlerts);
        }
      } else {
        console.log(`✅ [ENHANCED-SYNC] Successfully flushed ${alerts.length} fraud alerts`);
      }
    } catch (error) {
      console.error('❌ [ENHANCED-SYNC] Exception while flushing fraud alerts:', error);
      
      // Re-queue with retry counter, discard after 3 attempts
      const retriableAlerts = alerts
        .map(a => ({ ...a, _retryCount: (a._retryCount || 0) + 1 }))
        .filter(a => a._retryCount <= 3);
      
      if (retriableAlerts.length > 0) {
        global.offlineQueue.fraudAlerts.unshift(...retriableAlerts);
      }
    }
  }

  shutdown() {
    this.stopActivitySync();
    this.stopUrlSync();
    this.stopConsolidatedIPC();
    
    // Clear all flush timers
    for (const timer of this.flushTimers.values()) {
      clearTimeout(timer);
    }
    this.flushTimers.clear();
    
    // Clear database backoff state
    this.clearDbBackoff();
    
    // Flush any remaining batched items before shutdown (with timeout)
    const flushPromises = [];
    for (const type of Object.keys(this.batchQueues)) {
      if (this.batchQueues[type].length > 0) {
        const flushPromise = Promise.race([
          this.flushBatchQueue(type),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Flush timeout')), 5000))
        ]).catch(err => 
          console.error(`❌ [SHUTDOWN] Failed to flush ${type}:`, err)
        );
        flushPromises.push(flushPromise);
      }
    }
    
    // Wait for all flushes with overall timeout
    if (flushPromises.length > 0) {
      Promise.allSettled(flushPromises).then(() => {
        console.log('🔄 [ENHANCED-SYNC-MANAGER] Shutdown complete');
      });
    } else {
      console.log('🔄 [ENHANCED-SYNC-MANAGER] Shutdown complete');
    }
  }
  
  // Get sync status including backoff state
  getSyncStatus() {
    return {
      isTracking: this.isTracking,
      queueStatus: this.getQueueStatus(),
      dbBackoff: {
        isActive: this.dbBackoff.isActive,
        retryCount: this.dbBackoff.retryCount,
        nextRetryIn: this.dbBackoff.nextRetryAt > Date.now() ? 
          this.dbBackoff.nextRetryAt - Date.now() : 0
      },
      hasRealtimeSubscribers: this.hasRealtimeSubscribers
    };
  }
}

module.exports = EnhancedSyncManager;