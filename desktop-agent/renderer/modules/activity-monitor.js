class ActivityMonitor {
  constructor(ipcRenderer) {
    this.ipcRenderer = ipcRenderer;
    this.pollInterval = null;
    this.statsInterval = null;
    this.elements = this.cacheElements();
    
    // Activity history for rate calculation (last 60 seconds)
    this.activityHistory = {
      clicks: [],
      keys: [],
      moves: []
    };
    this.rateUpdateInterval = null;
    this.lastActivityValues = { clicks: 0, keys: 0, moves: 0 };
    
    // Debug logging
    this.verboseLogging = localStorage.getItem('tf_verbose_activity') === '1';
    this.ipcEventLog = [];
    this.maxLogEvents = 10;
    
    // Track registered listeners for cleanup
    this._ipcHandlers = {};
    this._keyboardHandler = null;
    this._mounted = false;
  }

  cacheElements() {
    return {
      // Large live counters
      clicks: () => document.getElementById('currentClicks'),
      keys: () => document.getElementById('currentKeys'),
      moves: () => document.getElementById('currentMoves'),

      // Activity rate displays
      clicksPerMinute: () => document.getElementById('clicksPerMinute'),
      keysPerMinute: () => document.getElementById('keysPerMinute'),
      movesPerMinute: () => document.getElementById('movesPerMinute'),

      // Timer + since-last-screenshot counters
      timer: () => document.getElementById('nextScreenshotTimer'),
      sinceClicks: () => document.getElementById('screenshotClicks'),
      sinceKeys: () => document.getElementById('screenshotKeys'),
      sinceMoves: () => document.getElementById('screenshotMoves'),

      // Recent screenshots list
      recentList: () => document.getElementById('recentScreenshotsList'),
      
      // Debug panel elements
      debugPanel: () => document.getElementById('activityDebugPanel'),
      ipcEventLog: () => document.getElementById('ipcEventLog'),
      currentStatsDebug: () => document.getElementById('currentStatsDebug'),
      toggleVerboseBtn: () => document.getElementById('toggleVerboseBtn')
    };
  }

  mount() {
    try {
      // Full cleanup of intervals AND listeners to prevent accumulation
      this.stop();
      
      // Initial reset
      this.renderLiveCounters({ mouseClicks: 0, keystrokes: 0, mouseMovements: 0 });
      this.renderSinceLast({ clicks: 0, keys: 0, moves: 0 });
      this.renderTimer('--:--');
      this.loadRecentScreenshots().catch(() => {});

      // Listen to main-process activity stream directly
      // PERF FIX: Throttle DOM writes to max 1 render per 2 seconds + change detection
      this._lastRenderedValues = { mouseClicks: -1, keystrokes: -1, mouseMovements: -1 };
      this._lastRenderTime = 0;
      const RENDER_THROTTLE_MS = 2000;
      
      if (this.ipcRenderer) {
        // Define handlers as bound methods for cleanup
        this._ipcHandlers['activity-update'] = (_e, data) => {
          const mapped = {
            mouseClicks: data.mouseClicks ?? data.clicks ?? 0,
            keystrokes: data.keystrokes ?? data.keys ?? data.keyPresses ?? 0,
            mouseMovements: data.mouseMovements ?? data.moves ?? 0,
          };
          
          // Skip render if values unchanged OR if last render was <2s ago
          const valuesChanged = mapped.mouseClicks !== this._lastRenderedValues.mouseClicks ||
            mapped.keystrokes !== this._lastRenderedValues.keystrokes ||
            mapped.mouseMovements !== this._lastRenderedValues.mouseMovements;
          const now = Date.now();
          
          if (valuesChanged && (now - this._lastRenderTime) >= RENDER_THROTTLE_MS) {
            this._lastRenderedValues = { ...mapped };
            this._lastRenderTime = now;
            this.renderLiveCounters(mapped);
          }
          
          if (data.activitySinceLastScreenshot) {
            this.renderSinceLast(data.activitySinceLastScreenshot);
          }
        };

        this._ipcHandlers['screenshot-update'] = (_e, data) => {
          this.logIpcEvent('screenshot-update', data);
          console.log('📡 [ActivityMonitor] screenshot-update', data);
          this._applyTimerPayload(data);
          if (data.activitySinceLastScreenshot) {
            this.renderSinceLast(data.activitySinceLastScreenshot);
          }
        };

        this._ipcHandlers['timer-update'] = (_e, data) => {
          this.logIpcEvent('timer-update', data);
          console.log('📡 [ActivityMonitor] timer-update', data);
          this._applyTimerPayload(data);
        };

        this._ipcHandlers['perf-update'] = (_e, data) => {
          this.logIpcEvent('perf-update', data);
          console.log('📡 [ActivityMonitor] perf-update', data);
          if (data?.activity) {
            const a = data.activity;
            const mapped = {
              mouseClicks: a.mouseClicks ?? a.clicks ?? 0,
              keystrokes: a.keystrokes ?? a.keys ?? 0,
              mouseMovements: a.mouseMovements ?? a.moves ?? 0,
            };
            this.renderLiveCounters(mapped);
          }
          if (data?.screenshot) {
            this._applyTimerPayload(data.screenshot);
            if (data.screenshot.activitySinceLastScreenshot) {
              this.renderSinceLast(data.screenshot.activitySinceLastScreenshot);
            }
          }
        };

        this._ipcHandlers['live-activity-update'] = (_e, data) => {
          this.logIpcEvent('live-activity-update', data);
          console.log('📡 [ActivityMonitor] live-activity-update', data);
          const mapped = {
            mouseClicks: data?.activity?.mouseClicks ?? data?.mouseClicks ?? data?.clicks ?? 0,
            keystrokes: data?.activity?.keystrokes ?? data?.keyPresses ?? data?.keys ?? 0,
            mouseMovements: data?.activity?.mouseMovements ?? data?.mouseMovements ?? data?.moves ?? 0,
          };
          this.renderLiveCounters(mapped);
        };

        this._ipcHandlers['next-screenshot-update'] = (_e, data) => {
          this.logIpcEvent('next-screenshot-update', data);
          console.log('📡 [ActivityMonitor] next-screenshot-update', data);
          const s = typeof data.secondsUntilNext === 'number' ? data.secondsUntilNext
                  : (typeof data.secondsToNext === 'number' ? data.secondsToNext
                  : (typeof data.secondsToNextScreenshot === 'number' ? data.secondsToNextScreenshot : null));
          if (typeof s === 'number' && s >= 0) {
            const mm = Math.floor(s / 60);
            const ss = Math.floor(s % 60).toString().padStart(2, '0');
            this.renderTimer(`${mm}:${ss}`);
          }
          if (data.activitySinceLastScreenshot) {
            this.renderSinceLast(data.activitySinceLastScreenshot);
          }
        };

        // Register all IPC handlers
        for (const [channel, handler] of Object.entries(this._ipcHandlers)) {
          this.ipcRenderer.on(channel, handler);
        }
        
        // CRITICAL FIX: Listen for tracking-stopped to stop polling intervals
        // This ensures ActivityMonitor stops itself when tracking stops
        // Only register once - check if handler already exists to prevent duplicates
        if (!this._trackingStoppedHandler) {
          this._trackingStoppedHandler = () => {
            // BUG1 FIX: Guard against stale events - only stop if currently mounted
            // This prevents premature stops from stale events during remount
            if (!this._mounted) {
              console.log('⚠️ [ActivityMonitor] Ignoring tracking-stopped - not mounted');
              return;
            }
            console.log('🛑 [ActivityMonitor] Received tracking-stopped, stopping intervals');
            this.stop();
          };
          this.ipcRenderer.on('tracking-stopped', this._trackingStoppedHandler);
          console.log('✅ [ActivityMonitor] Registered tracking-stopped listener');
        }
      }

      // Poll database for recent screenshots (reduced from 10s to 30s to lower IPC/DB pressure)
      this.pollInterval = setInterval(() => {
        this.loadRecentScreenshots().catch(() => {});
      }, 30000);

      // Fallback: poll get-activity-stats (reduced from 5s to 15s - IPC activity-update handles real-time)
      this.statsInterval = setInterval(async () => {
        try {
          if (!this.ipcRenderer) return;
          // Prefer consolidated 'get-stats' which draws from global.displayActivityStats
          const consolidated = await this.ipcRenderer.invoke('get-stats');
          const s = consolidated?.stats || consolidated; // handle either format
          if (s && typeof s === 'object') {
            const keystrokeValue = s.keyPresses ?? s.keystrokes ?? s.keys 
              ?? s.activity?.keystrokes ?? s.activity?.keys ?? 0;
            const mapped = {
              mouseClicks: s.mouseClicks ?? s.clicks ?? s.activity?.mouseClicks ?? 0,
              keystrokes: keystrokeValue,
              mouseMovements: s.mouseMovements ?? s.moves ?? s.activity?.mouseMovements ?? 0,
            };
            console.log('🔄 [Polling] Fetched stats:', mapped);
            this.renderLiveCounters(mapped);
            return;
          }
          // Fallback to legacy handler
          const legacy = await this.ipcRenderer.invoke('get-activity-stats');
          if (legacy && typeof legacy === 'object') {
            const keystrokeValueLegacy = legacy.keyPresses ?? legacy.keystrokes ?? legacy.keys ?? 0;
            const mappedLegacy = {
              mouseClicks: legacy.mouseClicks ?? legacy.clicks ?? 0,
              keystrokes: keystrokeValueLegacy,
              mouseMovements: legacy.mouseMovements ?? legacy.moves ?? 0,
            };
            console.log('🔄 [Polling-Legacy] Fetched stats:', mappedLegacy);
            this.renderLiveCounters(mappedLegacy);
          }
        } catch {}
      }, 15000);
      
      // Start activity rate calculation (updates every 15 seconds, consolidated with stats)
      this.startActivityRateCalculation();
      
      // Setup debug panel controls
      this.setupDebugPanel();
      
      this._mounted = true;
      
    } catch (err) {
      console.error('❌ [ActivityMonitor] mount failed:', err);
    }
  }
  
  startActivityRateCalculation() {
    if (this.rateUpdateInterval) {
      clearInterval(this.rateUpdateInterval);
    }
    
    this.rateUpdateInterval = setInterval(() => {
      this.updateActivityRates();
    }, 10000); // Update every 10 seconds
    
    // Initial update
    this.updateActivityRates();
  }
  
  updateActivityRates() {
    const now = Date.now();
    const sixtySecondsAgo = now - 60000;
    
    // Filter history to last 60 seconds and sum counts
    const filterAndSum = (history) => {
      return history
        .filter(entry => entry.timestamp > sixtySecondsAgo)
        .reduce((sum, entry) => sum + entry.count, 0);
    };
    
    const clicksInLast60 = filterAndSum(this.activityHistory.clicks);
    const keysInLast60 = filterAndSum(this.activityHistory.keys);
    const movesInLast60 = filterAndSum(this.activityHistory.moves);
    
    // Clean up old history (keep only last 60 seconds)
    this.activityHistory.clicks = this.activityHistory.clicks.filter(e => e.timestamp > sixtySecondsAgo);
    this.activityHistory.keys = this.activityHistory.keys.filter(e => e.timestamp > sixtySecondsAgo);
    this.activityHistory.moves = this.activityHistory.moves.filter(e => e.timestamp > sixtySecondsAgo);
    
    // Update UI
    const clicksPerMinEl = this.elements.clicksPerMinute();
    const keysPerMinEl = this.elements.keysPerMinute();
    const movesPerMinEl = this.elements.movesPerMinute();
    
    if (clicksPerMinEl) clicksPerMinEl.textContent = `${clicksInLast60}/min`;
    if (keysPerMinEl) keysPerMinEl.textContent = `${keysInLast60}/min`;
    if (movesPerMinEl) movesPerMinEl.textContent = `${movesInLast60}/min`;
  }
  
  setupDebugPanel() {
    const toggleBtn = this.elements.toggleVerboseBtn();
    if (toggleBtn) {
      // Update button state
      if (this.verboseLogging) {
        toggleBtn.textContent = 'Disable Verbose Logging';
        toggleBtn.classList.add('active');
      }
      
      toggleBtn.onclick = () => {
        this.verboseLogging = !this.verboseLogging;
        localStorage.setItem('tf_verbose_activity', this.verboseLogging ? '1' : '0');
        
        if (this.verboseLogging) {
          toggleBtn.textContent = 'Disable Verbose Logging';
          toggleBtn.classList.add('active');
        } else {
          toggleBtn.textContent = 'Enable Verbose Logging';
          toggleBtn.classList.remove('active');
        }
      };
    }
    
    // Keyboard shortcut: Cmd+Shift+D to toggle debug panel
    // Store reference for cleanup to prevent listener accumulation
    if (!this._keyboardHandler) {
      this._keyboardHandler = (e) => {
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'D') {
          e.preventDefault();
          const debugPanel = this.elements.debugPanel();
          if (debugPanel) {
            const isHidden = debugPanel.style.display === 'none';
            debugPanel.style.display = isHidden ? 'block' : 'none';
          }
        }
      };
      document.addEventListener('keydown', this._keyboardHandler);
    }
  }
  
  logIpcEvent(channel, data) {
    const event = {
      timestamp: new Date().toISOString(),
      channel,
      data: JSON.stringify(data)
    };
    
    this.ipcEventLog.unshift(event);
    if (this.ipcEventLog.length > this.maxLogEvents) {
      this.ipcEventLog.pop();
    }
    
    // Update debug UI if visible
    const logEl = this.elements.ipcEventLog();
    if (logEl) {
      logEl.textContent = this.ipcEventLog
        .map(e => `[${e.timestamp}] ${e.channel}\n${e.data}`)
        .join('\n\n');
    }
  }

  _applyTimerPayload(data) {
    const s = (typeof data?.secondsUntilNext === 'number') ? data.secondsUntilNext
            : (typeof data?.secondsToNext === 'number') ? data.secondsToNext
            : (typeof data?.secondsToNextScreenshot === 'number') ? data.secondsToNextScreenshot
            : null;
    if (typeof s === 'number' && s >= 0) {
      const mm = Math.floor(s / 60);
      const ss = Math.floor(s % 60).toString().padStart(2, '0');
      this.renderTimer(`${mm}:${ss}`);
    }
  }

  /**
   * Cleanup all registered listeners to prevent accumulation
   */
  _cleanupListeners() {
    // Remove IPC listeners
    if (this.ipcRenderer && this._ipcHandlers) {
      for (const [channel, handler] of Object.entries(this._ipcHandlers)) {
        try {
          this.ipcRenderer.removeListener(channel, handler);
        } catch (e) {
          // Ignore errors if listener wasn't registered
        }
      }
      this._ipcHandlers = {};
    }
    
    // NOTE: Do NOT remove tracking-stopped listener here!
    // It must persist for the app lifetime to handle future stop events.
    // The listener is only registered once in mount() and should stay active.
    
    // Remove keyboard listener
    if (this._keyboardHandler) {
      document.removeEventListener('keydown', this._keyboardHandler);
      this._keyboardHandler = null;
    }
  }

  stop() {
    console.log('🛑 [ActivityMonitor] stop() called');
    
    // Clear all intervals
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
    if (this.rateUpdateInterval) {
      clearInterval(this.rateUpdateInterval);
      this.rateUpdateInterval = null;
    }
    
    // BUG1 FIX: Remove tracking-stopped listener to prevent stale events on remount
    // This ensures clean state when remounting during a new tracking session
    if (this._trackingStoppedHandler && this.ipcRenderer) {
      try {
        this.ipcRenderer.removeListener('tracking-stopped', this._trackingStoppedHandler);
        this._trackingStoppedHandler = null;
        console.log('✅ [ActivityMonitor] tracking-stopped listener removed');
      } catch (e) {
        console.warn('⚠️ [ActivityMonitor] Error removing tracking-stopped listener:', e);
      }
    }
    
    // Cleanup all listeners
    this._cleanupListeners();
    
    this._mounted = false;
    console.log('✅ [ActivityMonitor] All intervals cleared, listeners cleaned up');
  }

  renderLiveCounters({ mouseClicks = 0, keystrokes = 0, mouseMovements = 0 }) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString();
    
    const updateElement = (el, value) => {
      if (!el) return;
      const oldValue = parseInt(el.textContent) || 0;
      el.textContent = String(value);
      
      // Visual feedback on change
      if (value !== oldValue) {
        el.classList.add('updated');
        setTimeout(() => el.classList.remove('updated'), 600);
      }
    };
    
    updateElement(this.elements.clicks(), mouseClicks);
    updateElement(this.elements.keys(), keystrokes);
    updateElement(this.elements.moves(), mouseMovements);
    
    // Track activity changes for rate calculation
    if (mouseClicks > this.lastActivityValues.clicks) {
      this.activityHistory.clicks.push({ timestamp: now.getTime(), count: mouseClicks - this.lastActivityValues.clicks });
    }
    if (keystrokes > this.lastActivityValues.keys) {
      this.activityHistory.keys.push({ timestamp: now.getTime(), count: keystrokes - this.lastActivityValues.keys });
    }
    if (mouseMovements > this.lastActivityValues.moves) {
      this.activityHistory.moves.push({ timestamp: now.getTime(), count: mouseMovements - this.lastActivityValues.moves });
    }
    
    // MEMORY FIX: Cap activity history arrays at 120 entries (UI only reads last 60s)
    // Without this cap, arrays grow unbounded over hours of tracking
    const MAX_HISTORY = 120;
    if (this.activityHistory.clicks.length > MAX_HISTORY) {
      this.activityHistory.clicks = this.activityHistory.clicks.slice(-MAX_HISTORY);
    }
    if (this.activityHistory.keys.length > MAX_HISTORY) {
      this.activityHistory.keys = this.activityHistory.keys.slice(-MAX_HISTORY);
    }
    if (this.activityHistory.moves.length > MAX_HISTORY) {
      this.activityHistory.moves = this.activityHistory.moves.slice(-MAX_HISTORY);
    }
    
    this.lastActivityValues = { clicks: mouseClicks, keys: keystrokes, moves: mouseMovements };
    
    // Update debug display
    if (this.verboseLogging) {
      const statsEl = this.elements.currentStatsDebug();
      if (statsEl) {
        statsEl.textContent = JSON.stringify({ mouseClicks, keystrokes, mouseMovements, timestamp: timeStr }, null, 2);
      }
    }
  }

  renderSinceLast({ clicks = 0, keys = 0, moves = 0 }) {
    const c = this.elements.sinceClicks();
    const k = this.elements.sinceKeys();
    const m = this.elements.sinceMoves();
    if (c) c.textContent = String(clicks || 0);
    if (k) k.textContent = String(keys || 0);
    if (m) m.textContent = String(moves || 0);
  }

  renderTimer(text) {
    const t = this.elements.timer();
    if (t) t.textContent = text;
  }

  async loadRecentScreenshots() {
    if (!this.ipcRenderer) return;
    try {
      let resp;
      try {
        resp = await this.ipcRenderer.invoke('get-today-screenshots');
      } catch (e) {
        if ((e?.message || '').includes("No handler registered for 'get-today-screenshots'")) {
          console.warn('🛟 [ActivityMonitor] Handler not ready, retrying get-today-screenshots in 500ms');
          await new Promise(r => setTimeout(r, 500));
          resp = await this.ipcRenderer.invoke('get-today-screenshots');
        } else {
          throw e;
        }
      }
      const list = Array.isArray(resp?.data) ? resp.data.slice(0, 5) : [];
      this.renderRecent(list);
    } catch (e) {
      // Keep silent; UI will keep last known state
    }
  }

  renderRecent(items) {
    const container = this.elements.recentList();
    if (!container) return;

    if (!items || items.length === 0) {
      container.innerHTML = '<div class="no-screenshots">No screenshots captured yet</div>';
      return;
    }

    const html = items.map((s, idx) => {
      const url = s.image_url || s.file_path || '';
      const ts = s.captured_at || s.timestamp || new Date().toISOString();
      const time = new Date(ts).toLocaleTimeString();
      return `
        <div class="screenshot-item">
          ${url ? `<img src="${url}" alt="Screenshot ${idx+1}" onerror="this.style.display='none'">` : '<div style="width:80px;height:50px;background:#1e293b;border-radius:6px;"></div>'}
          <span class="time">${time}</span>
        </div>`;
    }).join('');

    container.innerHTML = html;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ActivityMonitor;
}


