class IPCManager {
  constructor(ipcRenderer, notificationManager) {
    this.ipcRenderer = ipcRenderer;
    this.notificationManager = notificationManager;
    
    // IPC state
    this.isTracking = false;
    this.trackingStatus = 'stopped'; // 'active', 'paused', 'stopped'
    this.sessionStartTime = null;
    this.sessionTimer = null;
    this.startInProgress = false;
    this.activityStats = {
      mouseClicks: 0,
      keystrokes: 0,
      mouseMovements: 0,
      activityPercent: 0,
      focusPercent: 100
    };
    
    // Debounce map for app detection UI (5s buckets)
    this.appDetectionDebounce = new Map();
    
    // MEMORY FIX: Periodically clear stale debounce entries to prevent unbounded growth
    // The map uses 5s time-bucket keys, so entries older than 60s are definitely stale
    this._debounceCleanupInterval = setInterval(() => {
      if (this.appDetectionDebounce.size > 50) {
        this.appDetectionDebounce.clear();
      }
    }, 60000); // Every 60 seconds
    
    this.setupIpcListeners();
  }

  setupIpcListeners() {
    console.log('🔧 Setting up IPC listeners...');
    
    // Listen for user authentication events
    this.ipcRenderer.on('user-authenticated', (event, userData) => {
      console.log('✅ [IPC] User authenticated:', userData.email);
      this.notificationManager.showNotification('Successfully authenticated!', 'success');
    });
    
    // Listen for configuration updates
    this.ipcRenderer.on('config-updated', (event, configData) => {
      console.log('🔧 [IPC] Configuration updated:', configData);
      this.notificationManager.showNotification('Configuration updated', 'info');
    });
    
    // Listen for real-time URL detection events
    this.ipcRenderer.on('url-detected', (event, urlData) => {
      console.log('🌐 [IPC] Real-time URL detected:', urlData);
      
      // Update current URL display elements
      const currentUrl = document.getElementById('currentUrl');
      const currentBrowser = document.getElementById('currentBrowser');
      const urlLastUpdated = document.getElementById('urlLastUpdated');
      
      if (currentUrl && urlData.url) {
        // Format URL display nicely
        const displayUrl = urlData.domain || urlData.url;
        currentUrl.textContent = displayUrl;
        currentUrl.title = urlData.url; // Full URL on hover
      }
      if (currentBrowser && urlData.browser) {
        currentBrowser.textContent = urlData.browser;
      }
      if (urlLastUpdated) {
        urlLastUpdated.textContent = new Date().toLocaleTimeString();
      }
      
      // CRITICAL FIX: Add URL to real-time detection list
      this.addUrlToDetectionList(urlData);
      
      // Also refresh URL activity list from database
      if (window.RendererModules && window.RendererModules.UIManager) {
        window.RendererModules.UIManager.loadUrlActivity();
      }

      // Propagate to modular renderer listeners (updates dashboard badges)
      try {
        this.emit('url-detected', urlData);
      } catch (emitError) {
        console.log('⚠️ [IPC] Failed to emit url-detected event:', emitError.message);
      }
    });
    
    // Listen for real-time APP detection events
    this.ipcRenderer.on('app-detected', (event, appData) => {
      console.log('📱 [IPC] Real-time APP detected:', appData);
      
      // Normalize payload fields (support legacy and new formats)
      const normalizedName = (appData && (appData.name || appData.appName)) || null;
      const normalizedTitle = (appData && (appData.title || appData.windowTitle)) || null;
      // Ensure numeric timestamp; handle ISO string or number; fallback to now
      const normalizedTimestamp = (() => {
        const t = appData && appData.timestamp;
        if (t == null) return Date.now();
        const num = (typeof t === 'number') ? t : Date.parse(t);
        return Number.isFinite(num) ? num : Date.now();
      })();
      
      // Ignore non-actionable Electron | No Window events for UI stats
      if (normalizedName && normalizedName.toLowerCase() === 'electron' && (!normalizedTitle || normalizedTitle === 'No Window')) {
        console.log('⚠️ [IPC] Ignoring non-actionable Electron | No Window event');
        return;
      }
      
      // Update current app display elements
      const currentApp = document.getElementById('currentApp');
      const currentWindow = document.getElementById('currentWindow');
      const appLastUpdated = document.getElementById('appLastUpdated');
      
      if (currentApp && (normalizedName || appData.name)) {
        currentApp.textContent = normalizedName || appData.name;
      }
      if (currentWindow && (normalizedTitle || appData.title)) {
        currentWindow.textContent = normalizedTitle || appData.title;
      }
      if (appLastUpdated) {
        appLastUpdated.textContent = new Date().toLocaleTimeString();
      }
      
      // 5s debounce to prevent spammy duplicates in UI
      try {
        const bucket5s = Math.floor(normalizedTimestamp / 5000);
        const debounceKey = `${normalizedName || 'Unknown'}|${normalizedTitle || ''}|${bucket5s}`;
        if (this.appDetectionDebounce.has(debounceKey)) {
          console.log('⏳ [IPC] Skipping UI duplicate within 5s bucket for', debounceKey);
          return;
        }
        this.appDetectionDebounce.set(debounceKey, true);
      } catch {}
      
      // Add APP to real-time detection list
      this.addAppToDetectionList({
        ...appData,
        name: normalizedName || appData.name,
        title: normalizedTitle || appData.title,
        timestamp: normalizedTimestamp
      });
      
      // Also refresh app activity list from database
      if (window.RendererModules && window.RendererModules.UIManager) {
        window.RendererModules.UIManager.loadAppActivity();
      }

      // Propagate to modular renderer listeners (updates dashboard badges)
      try {
        this.emit('app-detected', appData);
      } catch (emitError) {
        console.log('⚠️ [IPC] Failed to emit app-detected event:', emitError.message);
      }
    });

    // Listen for app detection heartbeat (DEBUG UI indicator)
    this.ipcRenderer.on('appDetection:heartbeat', (event, data) => {
      try {
        // Display elapsed/threshold when debug elements exist
        const el = document.getElementById('appDetectionHeartbeat');
        if (el && data && typeof data.elapsedMs === 'number') {
          const pct = Math.min(100, Math.floor((data.elapsedMs / (data.thresholdMs || 1)) * 100));
          el.textContent = `App detector: ${pct}% of dwell (${Math.floor(data.elapsedMs/1000)}s/${Math.floor((data.thresholdMs||0)/1000)}s)`;
        }
      } catch (e) {
        console.debug('ℹ️ [IPC] Heartbeat render skipped:', e?.message || e);
      }
    });
    
    // Listen for tracking started events from main process
    this.ipcRenderer.on('tracking-started', (event, data) => {
      // T7: When renderer receives tracking-started event
      console.log('🎉 [RENDERER] T7: Received tracking-started event:', new Date().toISOString());
      console.log('▶️ [IPC] Tracking started by main process:', data);
      
      // Skip redundant updates if already tracking (optimistic or confirmed).
      // Multiple sources fire tracking-started (tracking-manager + adapter).
      // Restarting the timer causes a visible 0→1→reset→0→1→2… glitch.
      if (this.isTracking) {
        console.log('🔄 [IPC-MANAGER] Skipping redundant tracking-started — already tracking');
        if (data.timeLogId) this.currentTimeLogId = data.timeLogId;
        if (data.start_time || data.startTime) {
          const serverTime = new Date(data.start_time || data.startTime);
          if (this.sessionStartTime && Math.abs(serverTime - this.sessionStartTime) > 2000) {
            this.sessionStartTime = serverTime;
          }
        }
        this.optimisticMode = false;
        // Re-arm display clock if a late tracking-stopped cleared intervals mid-start.
        if (
          typeof window.beginLocalTrackingClock === 'function' &&
          !window.__trackingDisplayWatchdog &&
          (this.sessionStartTime || data.start_time || data.startTime)
        ) {
          const t = this.sessionStartTime || new Date(data.start_time || data.startTime);
          console.warn('⚠️ [IPC-MANAGER] Re-arming timer clock after start race');
          window.beginLocalTrackingClock(t);
          this.startSessionTimer();
        }
        return;
      }
      
      // Update local state
      this.isTracking = true;
      this.trackingStatus = 'active';
      // FIXED: Use start_time field from currentSession data
      this.sessionStartTime = new Date(data.start_time || data.startTime);
      
      // Start session timer
      this.startSessionTimer();
      
      // Update UI (will be handled by external UI manager)
      this.emit('tracking-state-changed', {
        isTracking: this.isTracking,
        status: this.trackingStatus,
        startTime: this.sessionStartTime
      });
      
      // Button states are already updated by the tracking-state-changed event handler
      
      // Show notification
      this.notificationManager.showNotification('⏱️ Time tracking started', 'success');

      // Ensure Time Tracker page is visible after tracking starts
      try {
        if (this.uiManager && typeof this.uiManager.showPage === 'function') {
          this.uiManager.showPage('timetracker');
        }
      } catch {}

      // Ensure project dropdown reflects the active project when auto-start selects one
      try {
        const activeProjectId = (data && (data.project_id || data.projectId)) || null;
        if (activeProjectId) {
          const projectSelect = document.getElementById('projectSelect');
          const dashboardProjectSelect = document.getElementById('dashboardProjectSelect');
          if (projectSelect) {
            projectSelect.value = activeProjectId;
            projectSelect.dispatchEvent(new Event('change'));
          }
          if (dashboardProjectSelect) {
            dashboardProjectSelect.value = activeProjectId;
            dashboardProjectSelect.dispatchEvent(new Event('change'));
          }
        }
      } catch (e) {
        console.log('⚠️ [IPC-MANAGER] Failed to apply project selection to UI:', e?.message || e);
      }
    });
    
    // Listen for health check warnings
    this.ipcRenderer.on('health-check-warning', (event, data) => {
      console.log('⚠️ [IPC] Health check warning received:', data);
      
      // Show a subtle warning without stopping the timer
      if (data.requiresPermission) {
        this.notificationManager.showNotification('⚠️ Some features may be limited. Check permissions in settings.', 'warning');
      }
      
      // Emit event for UI to handle if needed
      this.emit('health-check-warning', data);
    });
    
    // Listen for tracking stopped events from main process
    this.ipcRenderer.on('tracking-stopped', (event, data) => {
      console.log('⏹️ [IPC] Tracking stopped by main process:', data);
      const safeData = data || {};
      const stoppedId = safeData.timeLogId || safeData.currentTimeLogId || null;

      // Stop→Start race: a late tracking-stopped from the previous session must NOT
      // kill the new session's UI clock (tray keeps ticking → "stuck" in-app timer).
      if (this.startInProgress || this.optimisticMode) {
        console.warn('⚠️ [IPC] Ignoring tracking-stopped during start/optimistic mode', {
          stoppedId,
          currentTimeLogId: this.currentTimeLogId,
        });
        return;
      }
      if (
        this.isTracking &&
        this.currentTimeLogId &&
        stoppedId &&
        String(stoppedId) !== String(this.currentTimeLogId)
      ) {
        console.warn('⚠️ [IPC] Ignoring tracking-stopped for stale session', {
          stoppedId,
          currentTimeLogId: this.currentTimeLogId,
        });
        return;
      }
      // If we're already on a newer generation than the stop event, ignore.
      const stopGen = Number(safeData.trackingGeneration);
      if (
        Number.isFinite(stopGen) &&
        this._trackingGeneration &&
        stopGen < this._trackingGeneration
      ) {
        console.warn('⚠️ [IPC] Ignoring stale tracking-stopped generation', {
          stopGen,
          current: this._trackingGeneration,
        });
        return;
      }
      
      // Update local state
      this.isTracking = false;
      this.trackingStatus = 'stopped';
      
      // CRITICAL FIX: Stop session timer and clear all timer state
      this.stopSessionTimer();
      this.sessionStartTime = null;
      this.optimisticMode = false;
      this.currentTimeLogId = null;
      try { window.__lastTrackingStartTime = null; } catch (_) {}
      
      // Handle force stop signal from main process
      if (safeData.forceStop) {
        console.log('🛑 [IPC] Force stop signal received - clearing all timer state');
        // Ensure timer is completely stopped
        if (this.sessionTimer) {
          clearInterval(this.sessionTimer);
          this.sessionTimer = null;
        }
        // Clear any manual timer intervals using global cleanup
        if (window.clearAllTimers) {
          window.clearAllTimers();
        } else if (window.timerUpdateInterval) {
          clearInterval(window.timerUpdateInterval);
          window.timerUpdateInterval = null;
          console.log('✅ [IPC] Cleared manual timer interval on force stop (fallback)');
        }
        // Reset all tracking flags
        this.isTracking = false;
        this.trackingStatus = 'stopped';
      }
      
      // Update UI
      this.emit('tracking-state-changed', {
        isTracking: this.isTracking,
        status: this.trackingStatus,
        reason: safeData.reason || 'manual'
      });
      
      // CRITICAL FIX: Explicitly update button states after tracking stops
      if (this.uiManager) {
        this.uiManager.setTrackingStatus('stopped');
        this.uiManager.updateTrackingButtons();
      }
      
      // NOTE: ActivityMonitor now stops itself by listening to 'tracking-stopped' event directly
      
      // Show notification with reason
      const reasonLabel = this.getUserFriendlyReasonLabel(safeData.reason);
      this.notificationManager.showNotification(reasonLabel, 'info');
    });

    // Listen for session-data-updated: fired AFTER DB save completes
    // This ensures Recent Sessions / Top Projects refresh with the latest data
    this.ipcRenderer.on('session-data-updated', (event, data) => {
      console.log('🔄 [IPC] Session data updated (post-DB save):', data);
      const cutSec = Math.max(0, Math.floor(Number(data?.timeCutSeconds) || 0));
      const authorizedCut = data?.reason === 'idle_timeout' && cutSec > 0;
      const frozenFloor = Math.max(
        0,
        Math.floor(Number(data?.frozenTotalSeconds) || 0),
        Math.floor(Number(window.__todayBaseAtLastStop) || 0),
      );
      if (typeof window.refreshTodayCompletedBaseSeconds === 'function') {
        void window.refreshTodayCompletedBaseSeconds().then(() => {
          const trackerTimer = document.getElementById('trackerTime');
          if (!trackerTimer || this.isTracking) return;
          return window.ipc?.invoke('get-today-time-stats').then((s) => {
            if (s && typeof s.totalTime === 'number') {
              if (typeof window.applyTodayEffectiveStats === 'function') {
                window.applyTodayEffectiveStats(s);
              }
              const dbSec = Math.max(0, Math.floor(s.totalTime));
              const liveSec = Math.max(0, Math.floor(Number(window.__todayTrackedSeconds) || 0));
              // Non-effective never lowers the clock. Only authorized idle-prompt cut may.
              const trackedSec = authorizedCut
                ? Math.max(dbSec, frozenFloor)
                : Math.max(dbSec, frozenFloor, liveSec);
              window.__todayBaseAtLastStop = trackedSec;
              if (typeof window.setTrackerDisplaySeconds === 'function') {
                window.setTrackerDisplaySeconds(trackedSec, { allowDecrease: authorizedCut });
              }
            }
          });
        });
      }
      // Force-refresh the monthly report so the stopped session appears immediately
      if (this.uiManager && typeof this.uiManager.loadMonthlyReport === 'function') {
        this.uiManager.loadMonthlyReport(true, { silent: true }).catch(err => {
          console.warn('⚠️ [IPC] Failed to refresh monthly report after session update:', err);
        });
      }
    });
    
    // Listen for tracking paused events from main process
    this.ipcRenderer.on('tracking-paused', (event, data) => {
      console.log('⏸️ [IPC] Tracking paused by main process:', data);
      const safeData = data || {};
      
      // Update local state
      this.trackingStatus = 'paused';
      
      // Pause session timer
      this.pauseSessionTimer();
      
      // Update UI
      this.emit('tracking-state-changed', {
        isTracking: this.isTracking,
        status: this.trackingStatus,
        reason: safeData.reason || 'manual'
      });
      
      // Show notification
      const message = this.getUserFriendlyPauseMessage(safeData.reason);
      this.notificationManager.showNotification(message, 'info');
    });
    
    // Listen for tracking resumed events from main process
    this.ipcRenderer.on('tracking-resumed', (event, data) => {
      console.log('▶️ [IPC] Tracking resumed by main process:', data);
      
      // Update local state
      this.isTracking = true;
      this.trackingStatus = 'active';
      
      // Restart session timer
      this.startSessionTimer();
      
      // Update UI
      this.emit('tracking-state-changed', {
        isTracking: this.isTracking,
        status: this.trackingStatus,
        // Ensure consumers have a start time to continue manual timers
        startTime: this.sessionStartTime
      });
      
      // Show notification
      this.notificationManager.showNotification('▶️ Time tracking resumed', 'success');
    });
    
    // Listen for activity updates from main process
    // PERF FIX: Throttle DOM updates to max 1 per 2 seconds to reduce reflows on low-memory machines
    // PERF FIX 2: Skip DOM updates entirely when monitoring tools are hidden (default for employees)
    this._activityUpdateLastRender = 0;
    this._activityUpdateLastValues = null;
    this._monitoringToolsEnabled = false;
    const ACTIVITY_DOM_THROTTLE_MS = 2000;
    
    // Check initial monitoring tools state from localStorage
    try {
      this._monitoringToolsEnabled = localStorage.getItem('tf_monitoring_enabled') === '1';
    } catch {}
    
    // Listen for monitoring visibility changes
    window.addEventListener('tf-monitoring-visibility-changed', () => {
      try {
        this._monitoringToolsEnabled = localStorage.getItem('tf_monitoring_enabled') === '1';
      } catch {}
    });
    
    this.ipcRenderer.on('activity-update', (event, data) => {
      // CRITICAL FIX: Skip processing activity updates when not tracking
      // Main process may still send stale updates after stop
      if (!this.isTracking) {
        return; // Silently ignore
      }
      // Always update internal stats (lightweight, no DOM)
      this.updateActivityStats(data);
      
      // Skip DOM-heavy updates entirely when monitoring tools are hidden
      // The currentClicks/currentKeys/currentMoves elements only exist on the Activity Monitor page
      // which is hidden by default for employees. No point doing DOM lookups for elements that don't exist.
      if (!this._monitoringToolsEnabled) {
        return;
      }
      
      // Throttle DOM-heavy screenshot activity monitor updates
      const now = Date.now();
      if ((now - this._activityUpdateLastRender) >= ACTIVITY_DOM_THROTTLE_MS) {
        this._activityUpdateLastRender = now;
        this.updateScreenshotActivityMonitor(data);
      }
    });
    
    // Listen for next screenshot timer updates (for Screenshot Activity Monitor)
    this.ipcRenderer.on('next-screenshot-update', (event, data) => {
      // Skip when not tracking
      if (!this.isTracking) return;
      // console.log('📸 Next screenshot update received:', data); // SILENCED FOR CLEAN URL LOGS
      this.updateScreenshotActivityMonitor(data);

      // Forward to modular listeners so dashboard can update countdown badge
      try {
        this.emit('next-screenshot-update', data);
      } catch (emitError) {
        console.log('⚠️ [IPC] Failed to emit next-screenshot-update event:', emitError.message);
      }
    });
    
    // Listen for screenshot capture events
    this.ipcRenderer.on('screenshot-captured', (event, data) => {
      // console.log('📸 Screenshot captured:', data); // SILENCED FOR CLEAN URL LOGS
      this.notificationManager.showNotification('Screenshot captured', 'success');

      // Notify modular listeners to flip badge to Captured
      try {
        this.emit('screenshot-captured', data);
      } catch (emitError) {
        console.log('⚠️ [IPC] Failed to emit screenshot-captured event:', emitError.message);
      }
    });
    
    // Listen for app updates
    this.ipcRenderer.on('update-available', (event, data) => {
      console.log('🔄 Update available:', data);
      this.notificationManager.showNotification('Update available! Check the tray menu to download.', 'info');
    });
    
    // Listen for permission request results
    this.ipcRenderer.on('permissions-result', (event, data) => {
      console.log('🔐 Permissions result:', data);
      this.emit('permissions-updated', data);
    });
    
    // Listen for permission required (blocking timer start)
    this.ipcRenderer.on('permission-required', (event, data) => {
      console.log('🚫 [IPC] Permission required - timer blocked:', data);
      
      // Show prominent warning to user
      this.showPermissionRequiredDialog(data);
      
      // Also show notification
      if (this.notificationManager) {
        this.notificationManager.showNotification(
          'Permissions required to start timer. Please grant access in System Settings.',
          'error'
        );
      }
      
      this.emit('permission-required', data);
    });
    
    // Listen for permissions revoked during active tracking
    this.ipcRenderer.on('permissions-revoked', (event, data) => {
      console.log('🚨 [IPC] Permissions revoked during tracking:', data);
      
      // Show warning dialog to user
      this.showPermissionsRevokedDialog(data);
      
      // Update UI state to show timer is paused
      this.isTracking = false;
      this.isPaused = true;
      
      // Update UI elements
      try {
        this.updateTimerState(false, true); // stopped, paused
      } catch (e) {
        console.warn('⚠️ [IPC] Could not update timer state UI:', e?.message);
      }
      
      // Show notification
      if (this.notificationManager) {
        this.notificationManager.showNotification(
          'Timer paused - permissions were revoked. Please re-enable in System Settings.',
          'warning'
        );
      }
      
      this.emit('permissions-revoked', data);
    });
    
    // Listen for health check results
    this.ipcRenderer.on('health-check-result', (event, data) => {
      console.log('🏥 Health check result:', data);
      this.emit('health-check-completed', data);
    });

    // Listen for sync status updates
    this.ipcRenderer.on('sync-status-update', (event, data) => {
      console.log('💾 [IPC] Sync status update:', data);
      this.updateSyncStatus(data.itemId, data.status, data.type);
    });
    
    // Listen for toggle monitoring tools request from tray menu
    this.ipcRenderer.on('toggle-monitoring-tools', () => {
      console.log('🔧 [IPC] Toggle monitoring tools requested from tray menu');
      
      try {
        // Find the correct monitoring and developer tools sections
        const monitoringSection = document.getElementById('monitoringSection');
        const devToolsSection = document.getElementById('developer-tools-section');
        
        console.log('🔍 [IPC] Found sections:', {
          monitoringSection: !!monitoringSection,
          devToolsSection: !!devToolsSection
        });
        
        // CRITICAL FIX: Proceed if EITHER section exists
        if (monitoringSection || devToolsSection) {
          // Determine current state from whichever section exists
          const referenceSection = monitoringSection || devToolsSection;
          const currentDisplay = referenceSection.style.display;
          const isHidden = (currentDisplay === 'none' || currentDisplay === '');
          const newDisplay = isHidden ? 'block' : 'none';
          
          console.log(`🔧 [IPC] Current display: "${currentDisplay}", isHidden: ${isHidden}, newDisplay: "${newDisplay}"`);
          
          // Toggle both sections together (if they exist)
          if (monitoringSection) {
            monitoringSection.style.display = newDisplay;
            console.log(`✅ [IPC] Monitoring section ${isHidden ? 'shown' : 'hidden'}`);
          }
          if (devToolsSection) {
            devToolsSection.style.display = newDisplay;
            console.log(`✅ [IPC] Developer tools section ${isHidden ? 'shown' : 'hidden'}`);
          }
          
          // Update localStorage to sync with inline script
          try {
            localStorage.setItem('tf_monitoring_enabled', isHidden ? '1' : '0');
            window.dispatchEvent(new Event('tf-monitoring-visibility-changed'));
          } catch (e) {
            console.error('Failed to update monitoring visibility state:', e);
          }
          
          // Show notification
          if (this.notificationManager) {
            this.notificationManager.showNotification(
              isHidden ? 'Monitoring tools shown' : 'Monitoring tools hidden',
              'info'
            );
          }
        } else {
          console.error('❌ [IPC] Could not find monitoring tools sections');
          console.log('ℹ️  Expected element IDs: monitoringSection, developer-tools-section');
          
          // Show error notification
          if (this.notificationManager) {
            this.notificationManager.showNotification(
              'Monitoring tools sections not found in DOM',
              'error'
            );
          }
        }
      } catch (error) {
        console.error('❌ [IPC] Error toggling monitoring tools:', error);
        if (this.notificationManager) {
          this.notificationManager.showNotification(
            'Failed to toggle monitoring tools: ' + error.message,
            'error'
          );
        }
      }
    });
    
    console.log('✅ IPC listeners set up');
  }

  // Event emitter functionality for internal communication
  emit(eventName, data) {
    const event = new CustomEvent(eventName, { detail: data });
    document.dispatchEvent(event);
  }

  on(eventName, callback) {
    document.addEventListener(eventName, (event) => {
      callback(event.detail);
    });
  }

  // Session timer management
  startSessionTimer() {
    if (this.sessionTimer) {
      clearInterval(this.sessionTimer);
      this.sessionTimer = null;
    }

    // Tray is the primary 1Hz clock while tracking — avoid a competing interval.
    if (typeof window !== 'undefined' && typeof window.isTrayTimerDrivingDisplay === 'function') {
      if (window.isTrayTimerDrivingDisplay()) {
        return;
      }
    }
    
    // Emit immediate update so UI doesn't wait 1s for first tick
    this.emit('session-timer-update', {
      startTime: this.sessionStartTime,
      currentTime: new Date(),
      isTracking: this.isTracking
    });
    
    this.sessionTimer = setInterval(() => {
      try {
        if (typeof window !== 'undefined' && window.isTrayTimerDrivingDisplay?.()) {
          clearInterval(this.sessionTimer);
          this.sessionTimer = null;
          return;
        }
      } catch (_) { /* continue */ }
      this.emit('session-timer-update', {
        startTime: this.sessionStartTime,
        currentTime: new Date(),
        isTracking: this.isTracking
      });
    }, 1000);
  }

  pauseSessionTimer() {
    // Keep timer running but mark as paused
    this.emit('session-timer-paused', {
      startTime: this.sessionStartTime,
      pausedAt: new Date()
    });
  }

  stopSessionTimer(options = {}) {
    const { clearDisplayTimers = true } = options;
    if (this.sessionTimer) {
      clearInterval(this.sessionTimer);
      this.sessionTimer = null;
    }
    
    if (clearDisplayTimers) {
      // CRITICAL FIX: Use global cleanup function to clear all timers
      if (window.clearAllTimers) {
        window.clearAllTimers();
      } else if (window.timerUpdateInterval) {
        clearInterval(window.timerUpdateInterval);
        window.timerUpdateInterval = null;
        console.log('✅ [IPC-MANAGER] Cleared manual timer interval (fallback)');
      }
    }
    
    this.emit('session-timer-stopped', {
      startTime: this.sessionStartTime,
      endTime: new Date()
    });
    
    this.sessionStartTime = null;
  }

  /**
   * Update tracking state from main process (called on window focus)
   * Syncs renderer state with main process state
   */
  async updateTrackingState(state) {
    if (!state) return;

    // Never demote while a start is in flight (focus/sync races)
    if ((this.startInProgress || this.optimisticMode) && !state.isTracking) {
      console.warn('⚠️ [IPC-MANAGER] Ignoring not-tracking update during start/optimistic mode');
      return;
    }
    
    const wasTracking = this.isTracking;
    this.isTracking = state.isTracking || false;
    this.isPaused = state.isPaused || false;
    
    if (state.sessionStartTime) {
      this.sessionStartTime = new Date(state.sessionStartTime);
    }
    
    if (state.currentTimeLogId) {
      this.currentTimeLogId = state.currentTimeLogId;
    }
    
    // Sync UI if tracking state changed
    if (wasTracking !== this.isTracking) {
      console.log(`🔄 [IPC-MANAGER] Tracking state synced: ${wasTracking} → ${this.isTracking}`);
      
      if (this.uiManager) {
        if (this.isTracking) {
          this.uiManager.setTrackingStatus('tracking');
        } else {
          this.uiManager.setTrackingStatus('stopped');
        }
      }
    }
    
    this.emit('tracking-state-synced', state);
  }

  updateActivityStats(data) {
    const merged = { ...this.activityStats, ...data };
    // When not tracking, avoid misleading 100% activity/focus by forcing zeros
    if (!this.isTracking) {
      if (typeof merged.activityPercent === 'number') merged.activityPercent = 0;
      if (typeof merged.focusPercent === 'number') merged.focusPercent = 0;
    }
    this.activityStats = merged;
    this.emit('activity-stats-updated', this.activityStats);
  }

  updateScreenshotActivityMonitor(data) {
    // console.log('📸 [IPC-MANAGER] Updating Screenshot Activity Monitor:', data); // SILENCED
    
    // Refresh full activity display only when the Screenshot Activity page is active (30s throttle)
    const isScreenshotPageActive = !!(window.uiManager && window.uiManager.cachedElements?.currentActivePage?.id === 'activity-between-screenshotsPage');
    if (isScreenshotPageActive && window.uiManager && typeof window.uiManager.loadScreenshotActivity === 'function') {
      this._lastScreenshotActivityRefresh = this._lastScreenshotActivityRefresh || 0;
      const __now = Date.now();
      if (__now - this._lastScreenshotActivityRefresh > 30000) {
        this._lastScreenshotActivityRefresh = __now;
        window.uiManager.loadScreenshotActivity();
      }
    }
    
    // Check if DOM is ready before trying to access elements
    if (document.readyState === 'loading') {
      console.log('⏳ [IPC-MANAGER] DOM not ready, deferring screenshot monitor update');
      document.addEventListener('DOMContentLoaded', () => {
        this.updateScreenshotActivityMonitor(data);
      }, { once: true });
      return;
    }
    
    // Update timer ONLY if we have new timer data (avoid spam when unchanged)
    const timerElement = document.getElementById('nextScreenshotTimer');
    if (timerElement && data.hasOwnProperty('nextScreenshotTime')) {
      try {
        const incomingTs = (data.nextScreenshotTime && new Date(data.nextScreenshotTime).getTime()) || null;
        if (incomingTs && this._lastNextScreenshotTs && incomingTs === this._lastNextScreenshotTs) {
          // No change; skip UI update to avoid redundant work
        } else {
          this._lastNextScreenshotTs = incomingTs || null;
        }
      } catch {}
      const s = (typeof data.secondsUntilNext === 'number') ? data.secondsUntilNext : data.secondsToNext;
      if (data.nextScreenshotTime && s > 0) {
        const minutes = Math.floor(s / 60);
        const seconds = Math.floor(s % 60);
        timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        // console.log('⏱️ [IPC-MANAGER] Updated screenshot timer:', `${minutes}:${seconds.toString().padStart(2, '0')}`); // SILENCED
      } else {
        timerElement.textContent = '--:--';
        // console.log('⏱️ [IPC-MANAGER] Reset screenshot timer to --:-- (no valid timer data)'); // SILENCED
      }
    } else if (timerElement) {
      // console.log('📊 [IPC-MANAGER] Activity update - keeping existing timer display'); // SILENCED
    } else {
      // Silently skip if element not found - might not be on the screenshot activity page
      // Downgrade to debug to reduce console noise
      console.debug('ℹ️ [IPC-MANAGER] nextScreenshotTimer element not found (page may not be loaded)');
    }
    
    // Update activity counts for "Activity Since Last Screenshot" section
    if (data.activitySinceLastScreenshot) {
      const activity = data.activitySinceLastScreenshot;
      
      // Update Screenshot Activity Monitor elements (small counters in timer section)
      const screenshotClicksElement = document.getElementById('screenshotClicks');
      const screenshotKeysElement = document.getElementById('screenshotKeys');
      const screenshotMovesElement = document.getElementById('screenshotMoves');
      
      if (screenshotClicksElement) {
        screenshotClicksElement.textContent = activity.clicks || 0;
        // console.log('📊 [IPC-MANAGER] Updated screenshot clicks:', activity.clicks || 0); // SILENCED
      } else {
        // Silently skip if element not found - might not be on the screenshot activity page
        console.debug('ℹ️ [IPC-MANAGER] screenshotClicks element not found (page may not be loaded)');
      }
      
      if (screenshotKeysElement) {
        screenshotKeysElement.textContent = activity.keys || 0;
        // console.log('📊 [IPC-MANAGER] Updated screenshot keys:', activity.keys || 0); // SILENCED
      } else {
        // Silently skip if element not found - might not be on the screenshot activity page
        console.debug('ℹ️ [IPC-MANAGER] screenshotKeys element not found (page may not be loaded)');
      }
      
      if (screenshotMovesElement) {
        screenshotMovesElement.textContent = activity.moves || 0;
        // console.log('📊 [IPC-MANAGER] Updated screenshot moves:', activity.moves || 0); // SILENCED
      } else {
        // Silently skip if element not found - might not be on the screenshot activity page
        console.debug('ℹ️ [IPC-MANAGER] screenshotMoves element not found (page may not be loaded)');
      }
      
      // console.log('📊 [IPC-MANAGER] Screenshot activity monitor updated successfully'); // SILENCED
    } else {
      console.debug('ℹ️ [IPC-MANAGER] No activitySinceLastScreenshot data in update');
    }
    
    // Update large activity counters from current activity data (for real-time display)
    const currentClicksElement = document.getElementById('currentClicks');
    const currentKeysElement = document.getElementById('currentKeys');
    const currentMovesElement = document.getElementById('currentMoves');
    
    if (data.mouseClicks !== undefined && currentClicksElement) {
      currentClicksElement.textContent = data.mouseClicks || 0;
      // console.log('📊 [IPC-MANAGER] Updated current clicks:', data.mouseClicks || 0); // SILENCED
    }
    
    // Fix keystroke handling to check all property variants
    const keystrokeValue = data.keystrokes ?? data.keys ?? data.keyPresses ?? 0;
    if (currentKeysElement) {
      currentKeysElement.textContent = keystrokeValue;
      console.log('📊 [IPC-MANAGER] Updated keystrokes:', keystrokeValue, 'from', data);
    }
    
    if (data.mouseMovements !== undefined && currentMovesElement) {
      currentMovesElement.textContent = data.mouseMovements || 0;
      // console.log('📊 [IPC-MANAGER] Updated current moves:', data.mouseMovements || 0); // SILENCED
    }
  }

  // IPC methods for communicating with main process
  async startTracking(projectId) {
    try {
      console.log('🚀 [IPC-MANAGER] Starting tracking with project ID:', projectId);

      // Prevent double-click / overlapping starts (first click used to await a slow
      // today-stats fetch before any UI feedback, so users clicked again).
      if (this.startInProgress) {
        console.log('⏭️ [IPC-MANAGER] Start already in progress — ignoring duplicate click');
        return { success: true, alreadyStarting: true, timeLogId: this.currentTimeLogId || null };
      }
      if (this.isTracking && this.trackingStatus === 'active' && this.currentTimeLogId) {
        console.log('⏭️ [IPC-MANAGER] Already tracking — ignoring start click');
        return { success: true, alreadyTracking: true, timeLogId: this.currentTimeLogId };
      }
      if (!projectId) {
        const msg = 'Please select a project before starting the timer';
        this.notificationManager?.showNotification?.(msg, 'warning');
        return { success: false, error: 'Project required', message: msg };
      }

      this.startInProgress = true;
      this._trackingGeneration = (this._trackingGeneration || 0) + 1;
      const startGeneration = this._trackingGeneration;

      // Overnight sleep can miss Pacific midnight — reset daily clock before Start.
      try {
        if (typeof window.ensureCurrentWorkDay === 'function') {
          window.ensureCurrentWorkDay({ reason: 'ipc-start-tracking' });
        }
      } catch (_) { /* ignore */ }

      // OPTIMISTIC START first — never block the UI on today-stats / screenshots.
      // Base seconds refresh runs in the background and reconciles the clock.
      const optimisticStartTime = new Date();
      this.isTracking = true;
      this.trackingStatus = 'active';
      this.sessionStartTime = optimisticStartTime;
      this.optimisticMode = true; // Flag to track optimistic state

      // Fresh effective/non-effective split after Start (avoid stale 5s cache flash)
      try { this.uiManager?.invalidateTodayTimeStatsCache?.(); } catch (_) {}
      
      if (typeof window.beginLocalTrackingClock === 'function') {
        window.beginLocalTrackingClock(optimisticStartTime);
      }
      
      // Start session timer immediately
      this.startSessionTimer();
      
      // Update UI to tracking state immediately
      const startBtn = document.getElementById('trackerStartBtn');
      if (startBtn) {
        startBtn.disabled = true;
        startBtn.innerHTML = '<i data-lucide="clock" style="width: 20px; height: 20px;"></i><span>Tracking...</span>';
      }
      
      // Emit tracking state change immediately
      this.emit('tracking-state-changed', {
        isTracking: true,
        status: 'active',
        sessionStartTime: optimisticStartTime,
        optimistic: true,
        trackingGeneration: startGeneration,
      });
      
      // Update UI immediately
      if (this.uiManager) {
        this.uiManager.setTrackingStatus('active');
        this.uiManager.updateSessionTime();
      }

      // Background refresh of today's base / effective stats (non-blocking).
      const baseRefreshPromise =
        typeof window.refreshTodayCompletedBaseSeconds === 'function'
          ? window.refreshTodayCompletedBaseSeconds().catch((baseErr) => {
              console.warn('⚠️ [IPC-MANAGER] Background today base refresh failed:', baseErr?.message || baseErr);
            })
          : Promise.resolve();
      
      // Seed main/tray with renderer durable floor (survives reboot via localStorage).
      const todayFloorSeconds = Math.max(
        0,
        Math.floor(Number(window.__todayTrackedHighWaterSeconds) || 0),
        Math.floor(Number(window.__completedTodayBaseSeconds) || 0),
        Math.floor(Number(window.__todayTrackedSeconds) || 0),
      );

      // T1: Before IPC invoke
      console.time('T1-T2: IPC invoke time');
      console.log('📡 [IPC-MANAGER] T1: Before IPC invoke:', new Date().toISOString());
      
      // Now do the IPC call in the background
      const result = await this.ipcRenderer.invoke('start-timer', projectId, {
        todayFloorSeconds,
      });
      // Let base refresh finish when it can; don't block start confirmation on it.
      void baseRefreshPromise.then(() => {
        if (this.isTracking && typeof window.updateRendererTrackingClock === 'function') {
          try { window.updateRendererTrackingClock(); } catch (_) {}
        } else if (this.isTracking && typeof window.beginLocalTrackingClock === 'function' && this.sessionStartTime) {
          try { window.beginLocalTrackingClock(this.sessionStartTime); } catch (_) {}
        }
      });
      
      // T2: After IPC invoke returns
      console.timeEnd('T1-T2: IPC invoke time');
      console.log('📡 [IPC-MANAGER] T2: After IPC invoke:', new Date().toISOString());
      console.log('▶️ Start tracking result:', result);

      // Another Start superseded this one — don't clobber newer session state.
      if (startGeneration !== this._trackingGeneration) {
        console.warn('⚠️ [IPC-MANAGER] Stale start result ignored (newer start in progress)');
        return result;
      }
      
      // CRITICAL FIX: Check for success by timeLogId presence, not result.success
      if (result && result.timeLogId) {
        console.log('✅ [IPC-MANAGER] Start tracking successful - timeLogId:', result.timeLogId);
        // Mark optimistic mode as confirmed — always re-arm the clock in case a
        // late tracking-stopped from the previous session cleared intervals.
        this.optimisticMode = false;
        this.startInProgress = false;
        this.isTracking = true;
        this.trackingStatus = 'active';
        this.currentTimeLogId = result.timeLogId;
        const confirmedStart = result.startTime
          ? new Date(result.startTime)
          : (this.sessionStartTime || optimisticStartTime);
        this.sessionStartTime = confirmedStart;
        if (typeof window.beginLocalTrackingClock === 'function') {
          window.beginLocalTrackingClock(confirmedStart);
        }
        this.stopSessionTimer({ clearDisplayTimers: false });
        this.startSessionTimer();
        this.emit('tracking-state-changed', {
          isTracking: true,
          status: 'active',
          sessionStartTime: confirmedStart,
          synced: true,
          startTime: confirmedStart,
          trackingGeneration: startGeneration,
        });
        
        return result;
      } else if (result && result.success === false) {
        // Explicit failure - rollback optimistic update
        console.error('❌ [IPC-MANAGER] Start tracking failed, rolling back optimistic update');
        
        // Stop the optimistic timer
        this.stopSessionTimer();
        this.isTracking = false;
        this.trackingStatus = 'stopped';
        this.optimisticMode = false;
        
        // Revert UI
        if (startBtn) {
          startBtn.disabled = false;
          startBtn.innerHTML = '<i data-lucide="play" style="width: 20px; height: 20px;"></i><span>Start</span>';
        }
        
        // Update UI state
        this.emit('tracking-state-changed', {
          isTracking: false,
          status: 'stopped',
          error: result?.error || result?.message
        });
        
        if (this.uiManager) {
          this.uiManager.setTrackingStatus('stopped');
        }
        
        // SPECIAL HANDLING: Check if update is required
        if (result.error === 'update_required') {
          console.log('🔄 [IPC-MANAGER] Update required - showing update modal');
          window.__updateGateActive = true;
          const uiMgr = window.uiManager || (typeof moduleInstances !== 'undefined' && moduleInstances.uiManager);
          if (uiMgr?.showMandatoryUpdateGate) {
            uiMgr.showMandatoryUpdateGate({
              newVersion: result.updateVersion,
              currentVersion: result.currentVersion,
            });
          } else if (uiMgr?.showUpdateModal) {
            uiMgr.showUpdateModal({
              newVersion: result.updateVersion,
              currentVersion: result.currentVersion,
            });
          }
          this.notificationManager.showNotification('Please update the app before starting the timer', 'warning');
          throw new Error('Update required');
        }
        
        this.notificationManager.showNotification(result?.error || result?.message || 'Failed to start tracking', 'error');
        throw new Error(result?.error || result?.message || 'Failed to start tracking');
      } else {
        // Legacy: assume success if we have a result without explicit failure
        console.log('✅ [IPC-MANAGER] Start tracking successful (legacy format)');
        this.optimisticMode = false;
        return result;
      }
      
    } catch (error) {
      console.error('❌ Failed to start tracking:', error);

      // If main already confirmed tracking (tracking-started / timeLogId), do not roll back.
      if (this.isTracking && this.currentTimeLogId && !this.optimisticMode) {
        console.warn(
          '⚠️ [IPC-MANAGER] Start IPC error ignored — tracking already confirmed locally',
        );
        this.startInProgress = false;
        return { success: true, timeLogId: this.currentTimeLogId, warning: error.message };
      }
      
      // Rollback optimistic update
      if (this.optimisticMode) {
        this.stopSessionTimer();
        this.isTracking = false;
        this.trackingStatus = 'stopped';
        this.optimisticMode = false;
        
        // Emit rollback event
        this.emit('tracking-state-changed', {
          isTracking: false,
          status: 'stopped',
          error: error.message
        });
        
        if (this.uiManager) {
          this.uiManager.setTrackingStatus('stopped');
        }
      }
      
      // FIXED: Reset button state on error
      const startBtn = document.getElementById('trackerStartBtn');
      if (startBtn && !this.isTracking) {
        startBtn.disabled = false;
        startBtn.innerHTML = '<i data-lucide="play" style="width: 20px; height: 20px;"></i><span>Start</span>';
      }
      
      this.notificationManager.showNotification('Failed to start tracking: ' + error.message, 'error');
      throw error;
    } finally {
      this.startInProgress = false;
    }
  }

  async stopTracking() {
    console.log('⏹️ [IPC] Stop tracking requested - waiting for complete stop');
    
    try {
      // Freeze TRACKED total at click time (big clock shows effective derived from it)
      const frozenTracked = Math.max(
        0,
        Math.floor(Number(window.__todayTrackedSeconds) || 0),
        typeof window.readLocalTrackingCumulativeSeconds === 'function'
          ? window.readLocalTrackingCumulativeSeconds()
          : 0,
      );
      if (frozenTracked > 0) {
        window.__todayBaseAtLastStop = frozenTracked;
        window.setTrackerDisplaySeconds?.(frozenTracked);
        void this.ipcRenderer.invoke('set-frozen-total-at-stop', frozenTracked).catch(() => {});
      }
      this.stopSessionTimer();
      window.clearAllTimers?.();

      // Wait for stop to complete before updating UI
      const result = await this.ipcRenderer.invoke('stop-tracking');
      console.log('⏹️ Stop tracking result:', result);
      
      // BUG FIX: Only update UI state if the stop was successful
      // This prevents desync where UI shows stopped but main process continues tracking
      if (!result || result.success === false) {
        console.error('❌ Stop tracking failed:', result?.message || 'Unknown error');
        console.log('🔒 [IPC-DESYNC-FIX] Preserving isTracking=true due to failed stop');
        this.notificationManager.showNotification(result?.message || 'Failed to stop tracking', 'error');
        // Don't update local state - keep it in sync with actual main process state
        return result;
      }
      console.log('✅ [IPC-DESYNC-FIX] Stop successful, updating UI state to stopped');

      // Stopped offline: the end time is on disk and will sync. Tell the employee
      // their time is safe rather than leaving them guessing.
      if (result.synced === false) {
        this.notificationManager?.showNotification?.(
          result.message || 'Tracking stopped. Your time is saved and will sync when you are back online.',
          'info',
        );
      }

      // Update UI after successful stop
      this.isTracking = false;
      this.trackingStatus = 'stopped';
      this.stopSessionTimer();
      this.sessionStartTime = null;
      this.optimisticMode = false;
      this.currentTimeLogId = null;
      
      // Update UI
      if (this.uiManager) {
        this.uiManager.setTrackingStatus('stopped');
        this.uiManager.updateTrackingButtons();
      }
      
      // Emit state change
      this.emit('tracking-state-changed', {
        isTracking: false,
        status: 'stopped',
        reason: 'manual'
      });
      
      // Clear all timer intervals
      if (window.clearAllTimers) {
        window.clearAllTimers();
      }
      
      // NOTE: ActivityMonitor stops itself by listening to 'tracking-stopped' event directly
      
      return result;
    } catch (error) {
      console.error('❌ Failed to stop tracking:', error);
      this.notificationManager.showNotification('Failed to stop tracking', 'error');
      throw error;
    }
  }

  async pauseTracking() {
    try {
      const result = await this.ipcRenderer.invoke('pause-tracking');
      console.log('⏸️ Pause tracking result:', result);
      return result;
    } catch (error) {
      console.error('❌ Failed to pause tracking:', error);
      this.notificationManager.showNotification('Failed to pause tracking', 'error');
      throw error;
    }
  }

  async resumeTracking() {
    try {
      const result = await this.ipcRenderer.invoke('resume-tracking');
      console.log('▶️ Resume tracking result:', result);
      return result;
    } catch (error) {
      console.error('❌ Failed to resume tracking:', error);
      this.notificationManager.showNotification('Failed to resume tracking', 'error');
      throw error;
    }
  }

  async getTrackingState() {
    try {
      const state = await this.ipcRenderer.invoke('get-tracking-state');
      console.log('📊 Current tracking state:', state);
      return state;
    } catch (error) {
      // FIX-3: Return null on IPC failure instead of { isTracking: false }.
      // Returning a definitive "stopped" state on transient errors causes the
      // timer display to reset to 00:00:00. Callers should preserve current
      // state when they receive null.
      console.error('❌ Failed to get tracking state (returning null):', error);
      return null;
    }
  }

  async loadUserSession() {
    try {
      const session = await this.ipcRenderer.invoke('load-user-session');
      console.log('👤 Loaded user session:', session ? 'found' : 'not found');
      return session;
    } catch (error) {
      console.error('❌ Failed to load user session:', error);
      return null;
    }
  }

  async saveUserSession(sessionData) {
    try {
      await this.ipcRenderer.invoke('user-logged-in', sessionData);
      console.log('💾 User session saved');
    } catch (error) {
      console.error('❌ Failed to save user session:', error);
      throw error;
    }
  }

  async clearUserSession() {
    try {
      await this.ipcRenderer.invoke('user-logged-out');
      console.log('🗑️ User session cleared');
    } catch (error) {
      console.error('❌ Failed to clear user session:', error);
      throw error;
    }
  }

  async performHealthCheck() {
    try {
      const result = await this.ipcRenderer.invoke('perform-health-check');
      console.log('🏥 Health check completed:', result);
      return result;
    } catch (error) {
      console.error('❌ Health check failed:', error);
      return { overall: 'fail', errors: ['Health check service unavailable'] };
    }
  }

  async requestPermissions() {
    try {
      const result = await this.ipcRenderer.invoke('request-permissions');
      console.log('🔐 Permission request result:', result);
      return result;
    } catch (error) {
      console.error('❌ Permission request failed:', error);
      return { granted: false, error: error.message };
    }
  }

  async openSystemPreferences(pane) {
    try {
      const payload = pane ? { pane } : {};
      await this.ipcRenderer.invoke('open-system-preferences', payload);
      console.log('⚙️ System preferences opened', pane || '(default)');
    } catch (error) {
      console.error('❌ Failed to open system preferences:', error);
    }
  }

  async getAppVersion() {
    try {
      const version = await this.ipcRenderer.invoke('get-app-version');
      console.log('📋 App version:', version);
      return version;
    } catch (error) {
      console.error('❌ Failed to get app version:', error);
      return 'Unknown';
    }
  }

    // Sync tracking state with main process every 30 seconds
  startTrackingSync() {
    this._falseTrackingSyncCount = 0;
    setInterval(async () => {
      try {
        // Never demote UI while a start is in flight
        if (this.startInProgress || this.optimisticMode) return;

        const mainState = await this.getTrackingState();
        
        // Check if local state is out of sync with main process
        // CRITICAL FIX: Validate main state before syncing to prevent undefined status
        if (mainState && typeof mainState.isTracking === 'boolean') {
          // CRITICAL FIX: Derive status from main process state
          let derivedStatus = 'stopped';
          if (mainState.isTracking) {
            derivedStatus = mainState.isPaused ? 'paused' : 'active';
            this._falseTrackingSyncCount = 0;
          }
          
          if (mainState.isTracking !== this.isTracking || derivedStatus !== this.trackingStatus) {
            // PAYROLL CRITICAL: require two consecutive "not tracking" readings before
            // flipping a live timer to stopped (prevents single stale sync from killing UI).
            if (!mainState.isTracking && this.isTracking) {
              this._falseTrackingSyncCount = (this._falseTrackingSyncCount || 0) + 1;
              if (this._falseTrackingSyncCount < 2) {
                console.warn(
                  '⚠️ [TRACKING-SYNC] Main said not tracking while UI is tracking — waiting for confirmation',
                  { count: this._falseTrackingSyncCount, timeLogId: this.currentTimeLogId },
                );
                return;
              }
            }

            console.log('🔄 Syncing tracking state with main process:', mainState);
            console.log('🔄 Derived status from main state:', derivedStatus);
            
            this.isTracking = mainState.isTracking;
            this.trackingStatus = derivedStatus;
            if (mainState.isTracking) this._falseTrackingSyncCount = 0;
            
            // Update UI
              this.emit('tracking-state-changed', {
              isTracking: this.isTracking,
              status: this.trackingStatus,
                synced: true,
                // Ensure downstream timer consumers have a start time
                startTime: mainState.sessionStartTime || this.sessionStartTime
            });
          }
        } else {
          console.log('⚠️ [TRACKING-SYNC] Invalid main state received:', mainState, '- skipping sync');
        }
      } catch (error) {
        console.error('❌ Failed to sync tracking state:', error);
      }
    }, 30000); // Every 30 seconds
  }

  // Function to update sync status for app/URL items
  updateSyncStatus(itemId, status, type) {
    console.log(`🔍 [SYNC-STATUS] Looking for element: ${itemId}`);
    
    // Try multiple methods to find the status element
    let statusElement = document.getElementById(itemId);
    let targetItem = null;
    
    if (!statusElement) {
      // Fallback: Search by data-status-id attribute
      statusElement = document.querySelector(`[data-status-id="${itemId}"]`);
      console.log(`🔍 [SYNC-STATUS] Trying data-status-id selector: ${statusElement ? 'FOUND' : 'NOT FOUND'}`);
    }
    
    if (!statusElement) {
      // Fallback: Search within detection items
      const detectionItems = document.querySelectorAll('.detection-item');
      for (const item of detectionItems) {
        if (item.dataset.statusId === itemId) {
          statusElement = item.querySelector('.save-status-badge');
          targetItem = item;
          console.log(`🔍 [SYNC-STATUS] Found via detection item dataset: ${statusElement ? 'YES' : 'NO'}`);
          break;
        }
      }
    }
    
    // CRITICAL FIX: Handle duplicate sync IDs for consolidated items
    if (!statusElement) {
      const detectionItems = document.querySelectorAll('.detection-item');
      for (const item of detectionItems) {
        const duplicateIds = item.dataset.duplicateSyncIds;
        if (duplicateIds && duplicateIds.split(',').includes(itemId)) {
          statusElement = item.querySelector('.save-status-badge');
          targetItem = item;
          console.log(`🔍 [SYNC-STATUS] Found via duplicate sync IDs in consolidated item`);
          break;
        }
      }
    }
    
    if (!statusElement) {
      console.log(`❌ [SYNC-STATUS] Element ${itemId} not found after all attempts`);
      console.log(`🔍 [SYNC-STATUS] Available elements:`, Array.from(document.querySelectorAll('.save-status-badge')).map(el => el.id || el.dataset.statusId));
      // For duplicate entries, this is expected behavior - don't treat as error
      if (document.querySelectorAll('.detection-item').length > 0) {
        console.log(`📝 [SYNC-STATUS] Likely a duplicate entry sync update - ignoring gracefully`);
      }
      return;
    }
    
    // Remove all status classes
    statusElement.classList.remove('queued', 'saving', 'saved', 'error');
    
    // Add new status class and update text
    statusElement.classList.add(status);
    switch(status) {
      case 'queued':
        statusElement.textContent = 'Queued';
        break;
      case 'saving':
        statusElement.textContent = 'Saving...';
        break;
      case 'saved':
        statusElement.textContent = 'Saved';
        break;
      case 'error':
        statusElement.textContent = 'Error';
        break;
    }
    
    console.log(`✅ [SYNC-STATUS] Updated ${type} ${itemId} to ${status}`);
  }

  // Add APP to real-time detection list
  addAppToDetectionList(appData) {
    try {
      console.log('📱 [IPC] Adding APP to detection list:', appData);
      
      // Find the app detection list container
      const appListContainer = document.getElementById('appDetectionList');
      
      if (!appListContainer) {
        console.error('❌ [IPC] Could not find APP detection list container (appDetectionList)');
        return;
      }
      
      // ENHANCED: Check for duplicate apps and implement visit counter
      const appTitle = appData.name || appData.appName || 'Unknown App';
      const existingItems = appListContainer.querySelectorAll('.detection-item');
      
      // 5s debounce at list-level as additional guard
      try {
        const ts = (() => {
          const t = appData && appData.timestamp;
          if (t == null) return Date.now();
          const num = (typeof t === 'number') ? t : Date.parse(t);
          return Number.isFinite(num) ? num : Date.now();
        })();
        const bucket5s = Math.floor(ts / 5000);
        const debounceKey = `${appTitle}|${(appData.title || appData.windowTitle || '')}|${bucket5s}`;
        if (this.appDetectionDebounce.has(debounceKey)) {
          console.log('⏳ [IPC] Skipping detection list duplicate within 5s bucket for', debounceKey);
          return;
        }
        this.appDetectionDebounce.set(debounceKey, true);
      } catch {}
      
      for (const item of existingItems) {
        const existingTitle = item.querySelector('.detection-title');
        if (existingTitle && existingTitle.textContent === appTitle) {
          console.log(`🔄 [IPC] DUPLICATE APP VISIT DETECTED: "${appTitle}" - incrementing visit count`);
          
          // Update timestamp
          const timeElement = item.querySelector('.detection-time');
          if (timeElement) {
            timeElement.textContent = new Date((appData && appData.timestamp) || Date.now()).toLocaleTimeString();
          }
          
          // Update visit count
          let visitCountElement = item.querySelector('.visit-count');
          if (!visitCountElement) {
            // Create visit count element if it doesn't exist
            visitCountElement = document.createElement('span');
            visitCountElement.className = 'visit-count';
            visitCountElement.textContent = 'x2';
            
            const metaDiv = item.querySelector('.detection-meta');
            if (metaDiv) {
              metaDiv.appendChild(document.createTextNode(' • '));
              metaDiv.appendChild(visitCountElement);
            }
          } else {
            // Increment existing count
            const currentCount = parseInt(visitCountElement.textContent.replace('x', '')) || 1;
            visitCountElement.textContent = `x${currentCount + 1}`;
            
            // Add animation for count update
            visitCountElement.style.transform = 'scale(1.2)';
            visitCountElement.style.transition = 'transform 0.2s ease';
            setTimeout(() => {
              visitCountElement.style.transform = 'scale(1)';
            }, 200);
          }
          
          // CRITICAL FIX: Store the new sync status ID for tracking duplicates
          // This prevents "element not found" errors when main process sends sync updates
          if (appData.syncStatusId) {
            item.dataset.duplicateSyncIds = item.dataset.duplicateSyncIds || '';
            if (!item.dataset.duplicateSyncIds.includes(appData.syncStatusId)) {
              item.dataset.duplicateSyncIds += (item.dataset.duplicateSyncIds ? ',' : '') + appData.syncStatusId;
              console.log(`📝 [IPC] Stored duplicate sync ID for "${appTitle}": ${appData.syncStatusId}`);
            }
          }
          
          console.log(`✅ [IPC] Updated visit count for: "${appTitle}"`);
          return;
        }
      }
      
      // Clear "no apps detected" message if present
      const noAppsMessage = appListContainer.querySelector('.no-detections');
      if (noAppsMessage) {
        noAppsMessage.style.display = 'none';
        console.log('✅ [IPC] Hidden "no apps detected" message');
      }
      
      // Create app item element
      const appItem = document.createElement('div');
      appItem.className = 'detection-item new-item';
      
      const time = new Date((appData && appData.timestamp) || Date.now()).toLocaleTimeString();
      const displayTitle = appData.name || appData.appName || 'Unknown App';
      
      // CRITICAL FIX: Use exact statusId from main process or generate with same format
      const statusId = appData.syncStatusId || `app-sync-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      
      console.log(`🔧 [IPC] Creating APP item with statusId: ${statusId}`);
      
      appItem.innerHTML = `
        <i data-lucide="monitor" class="detection-icon app-icon"></i>
        <div class="detection-info">
          <div class="detection-title">${displayTitle}</div>
          <div class="detection-meta">
            <span>Window: ${(appData && (appData.title || appData.windowTitle)) || 'Unknown'}</span>
          </div>
        </div>
        <div class="detection-status">
          <span class="save-status-badge queued" id="${statusId}" data-status-id="${statusId}">Queued</span>
          <span class="detection-time">${time}</span>
        </div>
      `;
      
      // Track this item for sync status updates
      appItem.dataset.statusId = statusId;
      appItem.dataset.type = 'app';
      
      // Add to top of list (most recent first)
      appListContainer.insertBefore(appItem, appListContainer.firstChild);
      
      // LIMIT LIST SIZE: Keep only the most recent 10 apps to prevent UI clutter
      const allItems = appListContainer.querySelectorAll('.detection-item');
      if (allItems.length > 10) {
        for (let i = 10; i < allItems.length; i++) {
          allItems[i].remove();
        }
        console.log(`🧹 [IPC] Trimmed APP list to 10 most recent entries`);
      }
      
      // Reinitialize Lucide icons for the new element
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
        console.log('🎨 [IPC] Lucide icons reinitialized for new APP item');
      }
      
      console.log(`✅ [IPC] APP item added to container: ${displayTitle}`);
      
    } catch (error) {
      console.error('❌ [IPC] Error adding APP to detection list:', error);
    }
  }

  // Add URL to real-time detection list
  addUrlToDetectionList(urlData) {
    try {
      console.log('🌐 [IPC] Adding URL to detection list:', urlData);
      
      // Find the URL detection list container
      const urlListContainer = document.getElementById('urlDetectionList');
      
      if (!urlListContainer) {
        console.error('❌ [IPC] Could not find URL detection list container (urlDetectionList)');
        return;
      }
      
      // ENHANCED: Check for duplicate URLs and implement visit counter
      const urlTitle = urlData.domain || urlData.url || 'Unknown URL';
      const existingItems = urlListContainer.querySelectorAll('.detection-item');
      
      for (const item of existingItems) {
        const existingTitle = item.querySelector('.detection-title');
        if (existingTitle && existingTitle.textContent === urlTitle) {
          console.log(`🔄 [IPC] DUPLICATE VISIT DETECTED: "${urlTitle}" - incrementing visit count`);
          
          // Update timestamp
          const timeElement = item.querySelector('.detection-time');
          if (timeElement) {
            timeElement.textContent = new Date(urlData.timestamp || Date.now()).toLocaleTimeString();
          }
          
          // Update visit count
          let visitCountElement = item.querySelector('.visit-count');
          if (!visitCountElement) {
            // Create visit count element if it doesn't exist
            visitCountElement = document.createElement('span');
            visitCountElement.className = 'visit-count';
            visitCountElement.textContent = 'x2';
            
            const metaDiv = item.querySelector('.detection-meta');
            if (metaDiv) {
              metaDiv.appendChild(document.createTextNode(' • '));
              metaDiv.appendChild(visitCountElement);
            }
          } else {
            // Increment existing count
            const currentCount = parseInt(visitCountElement.textContent.replace('x', '')) || 1;
            visitCountElement.textContent = `x${currentCount + 1}`;
            
            // Add animation for count update
            visitCountElement.style.transform = 'scale(1.2)';
            visitCountElement.style.transition = 'transform 0.2s ease';
            setTimeout(() => {
              visitCountElement.style.transform = 'scale(1)';
            }, 200);
          }
          
          // CRITICAL FIX: Store the new sync status ID for tracking duplicates
          // This prevents "element not found" errors when main process sends sync updates
          if (urlData.syncStatusId) {
            item.dataset.duplicateSyncIds = item.dataset.duplicateSyncIds || '';
            if (!item.dataset.duplicateSyncIds.includes(urlData.syncStatusId)) {
              item.dataset.duplicateSyncIds += (item.dataset.duplicateSyncIds ? ',' : '') + urlData.syncStatusId;
              console.log(`📝 [IPC] Stored duplicate sync ID for "${urlTitle}": ${urlData.syncStatusId}`);
            }
          }
          
          console.log(`✅ [IPC] Updated visit count for: "${urlTitle}"`);
          return;
        }
      }
      
      // Clear "no URLs detected" message if present
      const noUrlsMessage = urlListContainer.querySelector('.no-detections');
      if (noUrlsMessage) {
        noUrlsMessage.style.display = 'none';
        console.log('✅ [IPC] Hidden "no URLs detected" message');
      }
      
      // Create URL item element
      const urlItem = document.createElement('div');
      urlItem.className = 'detection-item new-item';
      
      const time = new Date(urlData.timestamp || Date.now()).toLocaleTimeString();
      const displayTitle = urlData.domain || urlData.url || 'Unknown URL';
      const urlMeta = urlData.browser ? `Browser: ${urlData.browser}` : 'Browser unknown';
      
      // CRITICAL FIX: Use exact statusId from main process or generate with same format
      const statusId = urlData.syncStatusId || `url-sync-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      
      console.log(`🔧 [IPC] Creating URL item with statusId: ${statusId}`);
      
      urlItem.innerHTML = `
        <i data-lucide="globe" class="detection-icon url-icon"></i>
        <div class="detection-info">
          <div class="detection-title">${displayTitle}</div>
          <div class="detection-meta">
            <span>Browser: ${urlData.browser || 'Unknown'}</span>
          </div>
        </div>
        <div class="detection-status">
          <span class="save-status-badge queued" id="${statusId}" data-status-id="${statusId}">Queued</span>
          <span class="detection-time">${time}</span>
        </div>
      `;
      
      // Track this item for sync status updates
      urlItem.dataset.statusId = statusId;
      urlItem.dataset.type = 'url';
      
      // Add to top of list (most recent first)
      urlListContainer.insertBefore(urlItem, urlListContainer.firstChild);
      
      // LIMIT LIST SIZE: Keep only the most recent 10 URLs to prevent UI clutter
      const allItems = urlListContainer.querySelectorAll('.detection-item');
      if (allItems.length > 10) {
        for (let i = 10; i < allItems.length; i++) {
          allItems[i].remove();
        }
        console.log(`🧹 [IPC] Trimmed URL list to 10 most recent entries`);
      }
      
      // Reinitialize Lucide icons for the new element
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
      
      console.log('✅ [IPC] URL item added to container:', displayTitle);
      
    } catch (error) {
      console.error('❌ [IPC] Error adding URL to list:', error);
    }
  }

  // Clear URL detection list
  clearUrlDetectionList() {
    try {
      const urlListContainer = document.getElementById('urlDetectionList');
      if (!urlListContainer) {
        console.error('❌ [IPC] Could not find URL detection list container');
        return;
      }
      
      // Remove all detection items
      const detectionItems = urlListContainer.querySelectorAll('.detection-item');
      detectionItems.forEach(item => item.remove());
      
      // Show "no URLs detected" message
      const noUrlsMessage = urlListContainer.querySelector('.no-detections');
      if (noUrlsMessage) {
        noUrlsMessage.style.display = 'block';
      }
      
      console.log('✅ [IPC] URL detection list cleared');
      
    } catch (error) {
      console.error('❌ [IPC] Error clearing URL list:', error);
    }
  }

  // Clear APP detection list
  clearAppDetectionList() {
    try {
      const appListContainer = document.getElementById('appDetectionList');
      if (!appListContainer) {
        console.error('❌ [IPC] Could not find APP detection list container');
        return;
      }
      
      // Remove all detection items
      const detectionItems = appListContainer.querySelectorAll('.detection-item');
      detectionItems.forEach(item => item.remove());
      
      // Show "no apps detected" message
      const noAppsMessage = appListContainer.querySelector('.no-detections');
      if (noAppsMessage) {
        noAppsMessage.style.display = 'block';
      } else {
        appListContainer.innerHTML = '<div class="no-detections">No apps detected yet - start using applications to see real-time tracking</div>';
      }
      
      console.log('✅ [IPC] APP detection list cleared');
      
    } catch (error) {
      console.error('❌ [IPC] Error clearing APP list:', error);
    }
  }

  // Get current state
  getCurrentState() {
    return {
      isTracking: this.isTracking,
      trackingStatus: this.trackingStatus,
      sessionStartTime: this.sessionStartTime,
      activityStats: this.activityStats
    };
  }

  getUserFriendlyReasonLabel(reason) {
    switch (reason) {
      case 'idle':
      case 'idle_timeout':
      case 'auto_stop_idle':
        return 'Time tracking stopped: You were inactive for too long';
      case 'on_break':
        return 'Time tracking stopped: You took a break';
      case 'manual':
        return 'Time tracking stopped: You manually stopped the timer';
      case 'screenshot_failures':
        return 'Time tracking stopped: Screenshot permissions needed';
      case 'mandatory_timeout':
      case 'mandatory_screenshot_timeout':
        return 'Time tracking stopped: Required screenshot interval exceeded';
      case 'system_sleep':
      case 'laptop_closed':
        return 'Time tracking stopped: System went to sleep';
      case 'screen_lock':
        return 'Time tracking stopped: Screen was locked';
      case 'display_sleep':
        return 'Time tracking stopped: Display turned off';
      case 'system_shutdown':
        return 'Time tracking stopped: System is shutting down';
      case 'permissions_revoked':
        return 'Time tracking stopped: Permissions were revoked';
      case 'emergency_error':
        return 'Time tracking stopped: An error occurred';
      case 'shutdown':
      case 'app_quit':
        return 'Time tracking stopped: Application closing';
      case 'forceStop':
        return 'Time tracking stopped: System stopped tracking';
      default:
        return 'Time tracking stopped';
    }
  }

  getUserFriendlyPauseMessage(reason) {
    switch (reason) {
      case 'idle':
      case 'idle_timeout':
      case 'auto_stop_idle':
        return 'Time tracking paused: You were inactive';
      case 'manual':
        return 'Time tracking paused: You manually paused the timer';
      case 'system_sleep':
      case 'laptop_closed':
        return 'Time tracking paused: System went to sleep';
      case 'screen_lock':
        return 'Time tracking paused: Screen was locked';
      case 'display_sleep':
        return 'Time tracking paused: Display turned off';
      case 'permissions_revoked':
        return 'Time tracking paused: Permissions were revoked';
      default:
        return 'Time tracking paused';
    }
  }

  /** Labels for the three shortcut buttons (screen / accessibility / “related permissions”). */
  _permissionPaneLabels() {
    const p = typeof process !== 'undefined' ? process.platform : '';
    if (p === 'win32') {
      return {
        screen: 'Graphics capture',
        screenHint: 'Privacy → Graphics capture / screen recording',
        access: 'Ease of Access',
        accessHint: 'Accessibility-related Windows settings',
        auto: 'Privacy',
        autoHint: 'Privacy & security (app permissions)',
      };
    }
    if (p === 'linux') {
      return {
        screen: 'Privacy & screen',
        screenHint: 'Privacy and screen / sharing (GNOME Control Center)',
        access: 'Accessibility',
        accessHint: 'Universal access',
        auto: 'Applications',
        autoHint: 'Installed applications',
      };
    }
    if (p === 'darwin') {
      return {
        screen: 'Screen Recording',
        screenHint: 'Privacy → Screen Recording',
        access: 'Accessibility',
        accessHint: 'Privacy → Accessibility',
        auto: 'Automation',
        autoHint: 'Privacy → Automation (System Events)',
      };
    }
    return null;
  }

  _escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  _permissionSettingsButtonsHtml() {
    const labels = this._permissionPaneLabels();
    if (!labels) {
      return `
          <button type="button" class="permission-btn-settings" onclick="window.ipc.invoke('open-system-settings')">
            Open System Settings
          </button>`;
    }
    const { screen, screenHint, access, accessHint, auto, autoHint } = labels;
    return `
          <div class="permission-settings-pane-row">
            <button type="button" class="permission-btn-settings" title="${this._escapeAttr(screenHint)}" onclick="window.ipc.invoke('open-system-settings', { pane: 'screenRecording' })">${screen}</button>
            <button type="button" class="permission-btn-settings permission-btn-settings-secondary" title="${this._escapeAttr(accessHint)}" onclick="window.ipc.invoke('open-system-settings', { pane: 'accessibility' })">${access}</button>
            <button type="button" class="permission-btn-settings permission-btn-settings-secondary" title="${this._escapeAttr(autoHint)}" onclick="window.ipc.invoke('open-system-settings', { pane: 'automation' })">${auto}</button>
          </div>`;
  }

  /**
   * Show permission required dialog when timer cannot start
   */
  showPermissionRequiredDialog(data) {
    console.log('🔐 [IPC] Showing permission required dialog:', data);
    
    // Store data for diagnostic copy
    this._lastPermissionData = data;

    // Detect if this is an input detection failure
    const isInputDetectionFailure = data.issues?.some(issue => 
      issue.toLowerCase().includes('inputdetection') || 
      issue.toLowerCase().includes('input detection') || 
      issue.toLowerCase().includes('python')
    );

    // Choose icon and title based on failure type
    const icon = isInputDetectionFailure ? '⚠️' : '🔐';
    const title = isInputDetectionFailure ? 'Activity Tracking Not Available' : 'Permissions Required';
    const description = isInputDetectionFailure
      ? 'The timer cannot start because activity tracking is not working on this device. Without it, your activity will show as 0%.'
      : 'The timer cannot start because required permissions are missing:';

    // Create or get existing modal
    let modal = document.getElementById('permissionRequiredModal');
    
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'permissionRequiredModal';
      modal.className = 'permission-modal-overlay';
      document.body.appendChild(modal);
      
      // Add styles if not already present
      this.addPermissionModalStyles();
    }

    // Build modal content dynamically based on failure type
    let guidanceHTML = '';
    if (isInputDetectionFailure) {
      guidanceHTML = `
        <div class="permission-guidance" style="margin-top: 12px; padding: 12px; background: #1e293b; border-radius: 8px; border-left: 3px solid #f59e0b;">
          <p style="font-weight: 600; color: #fbbf24; margin: 0 0 8px 0;">What to do:</p>
          <ol style="margin: 0; padding-left: 20px; color: #94a3b8; line-height: 1.8;">
            <li>Click <strong>"Copy Logs"</strong> below and send the copied text to your IT support</li>
            <li>Try restarting the application</li>
            <li>If using antivirus software, add this app to the exceptions list</li>
            <li>Contact IT support if the issue persists</li>
          </ol>
        </div>
      `;
    }

    modal.innerHTML = `
      <div class="permission-modal${isInputDetectionFailure ? ' permission-modal-warning' : ''}">
        <div class="permission-modal-header">
          <span class="permission-icon">${icon}</span>
          <h3>${title}</h3>
        </div>
        <div class="permission-modal-body">
          <p>${description}</p>
          <ul class="permission-issues-list"></ul>
          <div class="permission-details"></div>
          ${guidanceHTML}
        </div>
        <div class="permission-modal-footer">
          <button class="permission-btn-copy" id="modalCopyLogsBtn" style="background: #1e3a5f; border: 1px solid #2563eb; color: #93c5fd;">
            📋 Copy Logs
          </button>
          ${!isInputDetectionFailure ? this._permissionSettingsButtonsHtml() : ''}
          <button class="permission-btn-close" onclick="document.getElementById('permissionRequiredModal').style.display='none'">
            Close
          </button>
        </div>
      </div>
    `;

    // Wire copy logs button inside modal to the comprehensive copy handler
    const modalCopyBtn = modal.querySelector('#modalCopyLogsBtn');
    if (modalCopyBtn) {
      modalCopyBtn.addEventListener('click', async () => {
        await this.copyLogsToClipboard();
        // Also update modal button feedback
        modalCopyBtn.textContent = '✅ Copied!';
        modalCopyBtn.style.background = '#166534';
        modalCopyBtn.style.borderColor = '#22c55e';
        modalCopyBtn.style.color = '#86efac';
        setTimeout(() => {
          modalCopyBtn.textContent = '📋 Copy Logs';
          modalCopyBtn.style.background = '#1e3a5f';
          modalCopyBtn.style.borderColor = '#2563eb';
          modalCopyBtn.style.color = '#93c5fd';
        }, 2500);
      });
    }
    
    // Populate issues
    const issuesList = modal.querySelector('.permission-issues-list');
    if (issuesList && data.issues) {
      issuesList.innerHTML = data.issues.map(issue => `<li>${issue}</li>`).join('');
    }
    
    // Populate details
    const detailsDiv = modal.querySelector('.permission-details');
    if (detailsDiv && data.permissions) {
      const screenStatus = data.permissions.screenRecording ? '✅ Granted' : '❌ Not Granted';
      const accessStatus = data.permissions.accessibility ? '✅ Granted' : '❌ Not Granted';
      detailsDiv.innerHTML = `
        <div class="permission-status">
          <span>Screen Recording: ${screenStatus}</span>
          <span>Accessibility: ${accessStatus}</span>
        </div>
      `;
    }
    
    modal.style.display = 'flex';
  }
  
  /**
   * Copy diagnostic information to clipboard for support
   */
  async copyDiagnosticInfo() {
    try {
      // Gather diagnostic info
      const diagnosticInfo = await this.gatherDiagnosticInfo();
      
      // Format as text
      const text = this.formatDiagnosticText(diagnosticInfo);
      
      // Copy to clipboard
      await navigator.clipboard.writeText(text);
      
      // Show success feedback
      const copyBtn = document.getElementById('copyDiagnosticBtn');
      if (copyBtn) {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '✅ Copied!';
        copyBtn.style.background = '#22c55e';
        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.style.background = '';
        }, 2000);
      }
      
      console.log('📋 [IPC] Diagnostic info copied to clipboard');
    } catch (error) {
      console.error('❌ [IPC] Failed to copy diagnostic info:', error);
      alert('Failed to copy. Please try again.');
    }
  }

  /**
   * Copy comprehensive diagnostic logs to clipboard via main process
   * This is the primary "Copy Logs" feature accessible from the sidebar
   */
  async copyLogsToClipboard() {
    const btn = document.getElementById('copyLogsBtn');
    try {
      // Show loading state
      if (btn) {
        btn.disabled = true;
        const span = btn.querySelector('span');
        if (span) span.textContent = 'Copying...';
      }

      const result = await this.ipcRenderer.invoke('copy-logs-to-clipboard');

      if (result?.success) {
        // Show success feedback on button
        if (btn) {
          btn.classList.add('copied');
          const span = btn.querySelector('span');
          if (span) span.textContent = 'Copied!';
          setTimeout(() => {
            btn.classList.remove('copied');
            if (span) span.textContent = 'Copy Logs';
            btn.disabled = false;
          }, 2500);
        }

        // Show toast notification
        if (this.notificationManager) {
          this.notificationManager.showNotification(
            'Logs copied to clipboard! Send to IT support.',
            'success'
          );
        }
        console.log('📋 [IPC] Logs copied to clipboard successfully');
      } else {
        throw new Error(result?.error || 'Unknown error');
      }
    } catch (error) {
      console.error('❌ [IPC] Failed to copy logs:', error);
      if (btn) {
        btn.disabled = false;
        const span = btn.querySelector('span');
        if (span) span.textContent = 'Copy Logs';
      }
      if (this.notificationManager) {
        this.notificationManager.showNotification(
          'Failed to copy logs. Please try again.',
          'error'
        );
      }
    }
  }
  
  /**
   * Gather all diagnostic information
   */
  async gatherDiagnosticInfo() {
    const info = {
      timestamp: new Date().toISOString(),
      appVersion: 'Unknown',
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      permissions: this._lastPermissionData?.permissions || {},
      issues: this._lastPermissionData?.issues || [],
      pythonDiagnostics: null
    };
    
    // Get app version
    try {
      info.appVersion = await this.ipcRenderer.invoke('get-app-version');
    } catch (e) {
      console.log('Could not get app version');
    }
    
    // Get Python diagnostics
    try {
      info.pythonDiagnostics = await this.ipcRenderer.invoke('get-python-diagnostics');
    } catch (e) {
      console.log('Could not get Python diagnostics');
    }
    
    return info;
  }
  
  /**
   * Format diagnostic info as readable text
   */
  formatDiagnosticText(info) {
    let text = `=== TimeFlow Diagnostic Report ===\n`;
    text += `Generated: ${info.timestamp}\n`;
    text += `App Version: ${info.appVersion}\n`;
    text += `Platform: ${info.platform}\n\n`;
    
    text += `=== Issues ===\n`;
    if (info.issues.length > 0) {
      info.issues.forEach(issue => {
        text += `• ${issue}\n`;
      });
    } else {
      text += `No issues reported\n`;
    }
    text += `\n`;
    
    text += `=== Permissions ===\n`;
    text += `Screen Recording: ${info.permissions.screenRecording ? 'Granted' : 'Not Granted'}\n`;
    text += `Accessibility: ${info.permissions.accessibility ? 'Granted' : 'Not Granted'}\n\n`;
    
    if (info.pythonDiagnostics) {
      text += `=== Python Detection ===\n`;
      text += `Found: ${info.pythonDiagnostics.foundPath || 'Not found'}\n`;
      text += `Version: ${info.pythonDiagnostics.version || 'N/A'}\n`;
      
      if (info.pythonDiagnostics.checkedPaths && info.pythonDiagnostics.checkedPaths.length > 0) {
        text += `\nPaths Checked:\n`;
        info.pythonDiagnostics.checkedPaths.slice(0, 15).forEach(p => {
          text += `  ${p.status === 'success' ? '✓' : '✗'} ${p.path} - ${p.status}\n`;
        });
        if (info.pythonDiagnostics.checkedPaths.length > 15) {
          text += `  ... and ${info.pythonDiagnostics.checkedPaths.length - 15} more paths checked\n`;
        }
      }
    }
    
    text += `\n=== End of Report ===\n`;
    text += `Please send this to support for assistance.\n`;
    
    return text;
  }
  
  /**
   * Show permissions revoked dialog when permissions are removed during tracking
   */
  showPermissionsRevokedDialog(data) {
    console.log('🚨 [IPC] Showing permissions revoked dialog:', data);

    const settingsFooter = this._permissionSettingsButtonsHtml();

    // Create or get existing modal
    let modal = document.getElementById('permissionsRevokedModal');
    
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'permissionsRevokedModal';
      modal.className = 'permission-modal-overlay';
      modal.innerHTML = `
        <div class="permission-modal permission-modal-warning">
          <div class="permission-modal-header">
            <span class="permission-icon">🚨</span>
            <h3>Timer Paused - Permissions Revoked</h3>
          </div>
          <div class="permission-modal-body">
            <p>${data.message || 'Permissions were revoked while the timer was running.'}</p>
            <p>Please re-enable permissions in System Settings to continue tracking.</p>
            <div class="permission-details"></div>
          </div>
          <div class="permission-modal-footer">
            ${settingsFooter}
            <button class="permission-btn-close" onclick="document.getElementById('permissionsRevokedModal').style.display='none'">
              Close
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      
      // Add styles if not already present
      this.addPermissionModalStyles();
    }
    
    // Populate details
    const detailsDiv = modal.querySelector('.permission-details');
    if (detailsDiv && data.details) {
      const screenStatus = data.details.screenRecording ? '✅ Granted' : '❌ Not Granted';
      const accessStatus = data.details.accessibility ? '✅ Granted' : '❌ Not Granted';
      detailsDiv.innerHTML = `
        <div class="permission-status">
          <span>Screen Recording: ${screenStatus}</span>
          <span>Accessibility: ${accessStatus}</span>
        </div>
      `;
    }
    
    modal.style.display = 'flex';
  }
  
  /**
   * Add CSS styles for permission modals
   */
  addPermissionModalStyles() {
    if (document.getElementById('permissionModalStyles')) return;
    
    const styles = document.createElement('style');
    styles.id = 'permissionModalStyles';
    styles.textContent = `
      .permission-modal-overlay {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        z-index: 10000;
        justify-content: center;
        align-items: center;
      }
      
      .permission-modal {
        background: #1e1e2e;
        border-radius: 12px;
        padding: 24px;
        max-width: 520px;
        width: 90%;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        border: 1px solid #333;
      }
      
      .permission-modal-warning {
        border-color: #f59e0b;
      }
      
      .permission-modal-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
      }
      
      .permission-modal-header .permission-icon {
        font-size: 28px;
      }
      
      .permission-modal-header h3 {
        margin: 0;
        color: #fff;
        font-size: 18px;
      }
      
      .permission-modal-body {
        color: #ccc;
        line-height: 1.6;
      }
      
      .permission-modal-body p {
        margin: 0 0 12px 0;
      }
      
      .permission-issues-list {
        margin: 12px 0;
        padding-left: 20px;
        color: #f87171;
      }
      
      .permission-issues-list li {
        margin: 4px 0;
      }
      
      .permission-status {
        display: flex;
        flex-direction: column;
        gap: 8px;
        background: #2a2a3e;
        padding: 12px;
        border-radius: 8px;
        margin-top: 12px;
      }
      
      .permission-modal-footer {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 20px;
        justify-content: flex-end;
        align-items: center;
      }

      .permission-settings-pane-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        width: 100%;
        justify-content: flex-end;
      }
      
      .permission-btn-settings {
        background: #3b82f6;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
      }

      .permission-btn-settings-secondary {
        background: #475569;
      }

      .permission-btn-settings-secondary:hover {
        background: #64748b;
      }
      
      .permission-btn-settings:hover {
        background: #2563eb;
      }
      
      .permission-btn-close {
        background: #374151;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 6px;
        cursor: pointer;
      }
      
      .permission-btn-close:hover {
        background: #4b5563;
      }
      
      .permission-btn-copy {
        background: #6366f1;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
        transition: background 0.2s ease;
      }
      
      .permission-btn-copy:hover {
        background: #4f46e5;
      }
    `;
    document.head.appendChild(styles);
  }
  
  /**
   * Update timer state in UI (helper method)
   */
  updateTimerState(isTracking, isPaused = false) {
    // Update internal state
    this.isTracking = isTracking;
    this.isPaused = isPaused;
    
    // Emit state change event
    this.emit('tracking-state-changed', { isTracking, isPaused });
    
    // Update UI elements if they exist
    const startBtn = document.getElementById('startTimerBtn') || document.querySelector('[data-action="start-timer"]');
    const stopBtn = document.getElementById('stopTimerBtn') || document.querySelector('[data-action="stop-timer"]');
    const statusEl = document.getElementById('trackingStatus');
    
    if (startBtn) {
      startBtn.disabled = isTracking;
    }
    if (stopBtn) {
      stopBtn.disabled = !isTracking;
    }
    if (statusEl) {
      if (isPaused) {
        statusEl.textContent = 'Paused';
        statusEl.className = 'status-paused';
      } else if (isTracking) {
        statusEl.textContent = 'Tracking';
        statusEl.className = 'status-active';
      } else {
        statusEl.textContent = 'Stopped';
        statusEl.className = 'status-stopped';
      }
    }
  }
}

// Export for use in main renderer
if (typeof module !== 'undefined' && module.exports) {
  module.exports = IPCManager;
} 