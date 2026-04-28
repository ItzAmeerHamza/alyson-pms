/**
 * App History Manager
 *
 * Handles app history functionality in the desktop agent
 * Manages live detection vs history views, database queries, and analytics
 */

// Prevent duplicate declaration when the module is loaded both via <script> and via require()
if (typeof window !== 'undefined' && window.AppHistoryManager && window.__appHistoryInitialized) {
  console.log('⚠️ [APP-HISTORY] AppHistoryManager already declared - skipping redefinition');
} else {

class AppHistoryManager {
  constructor(supabaseClient, ipcRenderer) {
    // Prefer an invoker that exposes .invoke regardless of preload shape
    // Accept either the raw ipcRenderer or a preload-exposed electronAPI
    this.ipc = (ipcRenderer && typeof ipcRenderer.invoke === 'function')
      ? ipcRenderer
      : (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.invoke === 'function')
        ? window.electronAPI
        : (typeof window !== 'undefined' && window.require
            ? (() => { try { return window.require('electron').ipcRenderer; } catch { return null; } })()
            : null);
    
    // State management
    this.currentMode = 'history'; // 'live' or 'history' — default to history only
    this.dateRange = 'today';
    this.customDate = new Date().toISOString().split('T')[0];
    this.appHistory = [];
    this.filteredHistory = [];
    this.historyStats = {};
    this.searchTerm = '';
    this.categoryFilter = 'all';
    // Debounce timers
    this.__loadDebounceTimer = null;
    this.__filterDebounceTimer = null;
    
    // Initialize functionality
    this.initializeEventListeners();
    
    try {
      // Lazy logger access in renderer via preload if exposed; fallback to console
      this.__logger = (window && window.logger) ? window.logger : null;
    } catch {}
    console.log('✅ [APP-HISTORY] AppHistoryManager initialized');
    if (typeof window !== 'undefined') {
      window.__appHistoryInitialized = true;
    }
  }

  /**
   * Initialize event listeners and setup
   */
  initializeEventListeners() {
    // Setup global functions for HTML onclick handlers
    window.switchAppMode = (mode) => this.switchMode(mode);
    window.onAppDateRangeChange = () => this.onDateRangeChange();
    window.loadAppHistory = () => this.loadAppHistory();
    window.filterAppHistory = () => this.filterHistory();
    
    // Set default date
    const customDateInput = document.getElementById('appCustomDate');
    if (customDateInput) {
      customDateInput.value = this.customDate;
    }
  }



  /**
   * Switch between live and history modes
   */
  switchMode(mode) {
    console.log(`🔄 [APP-HISTORY] Switching to ${mode} mode`);
    
    this.currentMode = mode;
    
    // Update toggle buttons
    const liveToggle = document.getElementById('liveToggle');
    const historyToggle = document.getElementById('historyToggle');
    const dateSelector = document.getElementById('appDateSelector');
    const liveView = document.getElementById('liveAppView');
    const historyView = document.getElementById('historyAppView');
    const appCardTitle = document.getElementById('appCardTitle');
    
    if (mode === 'live') {
      // Force history-only UI: redirect any live requests to history
      mode = 'history';
    }

    if (mode === 'history') {
      // History mode
      this.__screen = this.__screen || { name: 'App Detection', t0: Date.now() };
      const ctx = { filters: { dateRange: this.dateRange } };
      try { this.__logger && this.__logger.info({ category: 'SCREEN', screen: this.__screen.name, step: 'OPEN', ctx }); } catch {}
      liveToggle?.classList.remove('active');
      historyToggle?.classList.add('active');
      if (dateSelector) dateSelector.style.display = 'block';
      if (liveView) liveView.style.display = 'none';
      if (historyView) historyView.style.display = 'block';
      
      if (appCardTitle) {
        appCardTitle.textContent = 'App Usage Summary';
      }
      
      // Load history data
      this.loadAppHistory();
    }
    
    // Reinitialize Lucide icons
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  /**
   * Handle date range change
   */
  onDateRangeChange() {
    const dateRangeSelect = document.getElementById('appDateRange');
    const customDateInput = document.getElementById('appCustomDate');
    
    this.dateRange = dateRangeSelect?.value || 'today';
    
    if (this.dateRange === 'custom') {
      if (customDateInput) customDateInput.style.display = 'block';
    } else {
      if (customDateInput) customDateInput.style.display = 'none';
      // Debounce loads to avoid duplicate queries on rapid changes
      if (this.__loadDebounceTimer) clearTimeout(this.__loadDebounceTimer);
      this.__loadDebounceTimer = setTimeout(() => {
        this.loadAppHistory();
      }, 250);
    }
    
    console.log(`📅 [APP-HISTORY] Date range changed to: ${this.dateRange}`);
  }

  /**
   * Load app history from database
   */
  async loadAppHistory() {
    try {
      console.log('📊 [APP-HISTORY] Loading app history...');
      const screenName = (this.__screen && this.__screen.name) || 'App Detection';
      const loadT0 = Date.now();
      try { this.__logger && this.__logger.info({ category: 'SCREEN', screen: screenName, step: 'DATA LOAD START', ctx: { filters: { dateRange: this.dateRange } } }); } catch {}
      
      // Add initial delay to allow services to initialize
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Show loading state instead of error on first load
      this.showLoadingState();
      
      // Ensure current user ID is synced to main before requesting history
      let userId = null;
      let userRole = 'employee';
      try {
        const stored = localStorage.getItem('ebdaa_user');
        if (stored) {
          const parsed = JSON.parse(stored);
          userId = parsed?.id || parsed?.user?.id || null;
          userRole = parsed?.role || parsed?.user?.role || 'employee';
        }
      } catch (_) {}
      
      if (userId && this.ipc && typeof this.ipc.invoke === 'function') {
        try {
          const setResult = await this.ipc.invoke('set-current-user-id', userId, userRole);
          console.log('👤 [APP-HISTORY] Ensured current user set in main:', userId, 'Result:', setResult);
          
          // Verify the sync was successful
          if (!setResult || !setResult.success) {
            console.warn('⚠️ [APP-HISTORY] Failed to sync user ID to main process:', setResult?.error || 'Unknown error');
            // Add small delay to allow for background sync
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (e) {
          console.warn('⚠️ [APP-HISTORY] Failed to set current user in main:', e?.message || e);
          // Still proceed but with a small delay
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } else if (!userId) {
        console.warn('⚠️ [APP-HISTORY] No user ID found in localStorage');
      }

      // Calculate date range
      const { startDate, endDate } = this.calculateDateRange();
      
      console.log(`📅 [APP-HISTORY] Querying from ${startDate} to ${endDate}`);
      
      // Query app history via IPC with retry logic for initialization and authentication failures
      if (!this.ipc || typeof this.ipc.invoke !== 'function') {
        throw new Error('IPC invoker unavailable');
      }

      let response = null;
      let retryCount = 0;
      const maxRetries = 6; // Increased retries for initialization issues

      while (retryCount <= maxRetries) {
        try {
          response = await this.ipc.invoke('get-app-history', {
            startDate: startDate,
            endDate: endDate
          });

          // If successful, break the retry loop
          if (response && response.success) {
            break;
          }

          // Handle different types of errors
          if (response && response.error) {
            // If Supabase service not initialized (fetch failed)
            if (response.error.includes('fetch failed') || response.error.includes('TypeError') || response.error.includes('initialization timeout')) {
              console.warn(`⚠️ [APP-HISTORY] Service initialization error on attempt ${retryCount + 1}, retrying...`);
              retryCount++;
              // Wait longer for service initialization with exponential backoff
              const waitTime = Math.min(1000 * Math.pow(1.5, retryCount), 5000);
              await new Promise(resolve => setTimeout(resolve, waitTime));
              continue;
            }
            
            // If authentication error and we can retry
            if (response.error.includes('User not authenticated') && retryCount < maxRetries) {
              console.warn(`⚠️ [APP-HISTORY] Authentication error on attempt ${retryCount + 1}, retrying...`);
              retryCount++;
              
              // Re-sync user ID before retry
              if (userId && this.ipc && typeof this.ipc.invoke === 'function') {
                try {
                  const retrySetResult = await this.ipc.invoke('set-current-user-id', userId, userRole);
                  console.log('🔄 [APP-HISTORY] Retry: User ID sync result:', retrySetResult);
                  // Give more time for sync on retry
                  await new Promise(resolve => setTimeout(resolve, 250));
                } catch (e) {
                  console.warn('⚠️ [APP-HISTORY] Retry: Failed to sync user ID:', e?.message || e);
                }
              }
              continue;
            }
          }
          
          // Non-retryable error or max retries reached
          break;
        } catch (e) {
          // Handle IPC invocation errors (like service not ready)
          if (e.message && (e.message.includes('fetch failed') || e.message.includes('TypeError') || e.message.includes('initialization timeout'))) {
            console.warn(`⚠️ [APP-HISTORY] Service not ready on attempt ${retryCount + 1}, retrying...`);
            retryCount++;
            const waitTime = Math.min(1000 * Math.pow(1.5, retryCount), 5000);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
          // Re-throw other errors
          throw e;
        }
      }

      if (!response || !response.success) {
        let errorMsg = response?.error || 'Failed to load app history';
        if (response?.error && response.error.includes('User not authenticated')) {
          errorMsg = 'Authentication failed. Please try refreshing the page or logging in again.';
        } else if (response?.error && (response.error.includes('fetch failed') || response.error.includes('TypeError') || response.error.includes('initialization timeout'))) {
          errorMsg = 'Service is initializing. Please wait a moment and try again.';
        }
        throw new Error(errorMsg);
      }

      this.appHistory = response.data || [];
      this.historyStats = response.stats || {};
      
      console.log(`📊 [APP-HISTORY] Loaded ${this.appHistory.length} app records`);
      console.log('🧩 [PARSE-DB] AppHistory: start normalize/process', {
        incoming: this.appHistory.length,
        dateRange: this.dateRange
      });
      try { this.__logger && this.__logger.info({ category: 'SCREEN', screen: screenName, step: 'DATA LOAD END', ctx: { records: this.appHistory.length, duration_ms: Date.now() - loadT0 } }); } catch {}
      
      // Process and display history
      this.processAppHistory();
      this.updateHistoryStatistics();
      this.displayAppHistory();
      this.displayTopApps();
      
    } catch (error) {
      console.error('❌ [APP-HISTORY] Failed to load app history:', error);
      try { this.__logger && this.__logger.error({ category: 'SCREEN', screen: (this.__screen && this.__screen.name) || 'App Detection', step: 'DB SAVE ERROR', message: error.message }); } catch {}
      
      // Show appropriate error message based on error type
      if (error.message.includes('Service is initializing')) {
        this.showHistoryEmptyState('Service is initializing. Please wait a moment and refresh the page.');
      } else {
        this.showHistoryEmptyState('Failed to load app history: ' + error.message);
      }
    }
  }

  /**
   * Calculate date range for queries
   */
  calculateDateRange() {
    const now = new Date();
    let startDate, endDate;

    switch (this.dateRange) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        break;
        
      case 'yesterday':
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        startDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
        endDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59);
        break;
        
      case 'week':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 7);
        endDate = now;
        break;
        
      case 'custom':
        const customDateInput = document.getElementById('appCustomDate');
        const selectedDate = new Date(customDateInput.value);
        startDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
        endDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 23, 59, 59);
        break;
        
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    }

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    };
  }

  /**
   * Process app history data
   */
  processAppHistory() {
    console.log('🧩 [PARSE-DB] AppHistory: processAppHistory()', { items: this.appHistory.length });
    // Add categories to app history items
    this.appHistory = this.appHistory.map(app => ({
      ...app,
      category: app.category || this.categorizeApp(app.app_name)
    }));

    // Ensure each item has a reasonable duration even if DB didn't provide it
    this.appHistory = this.estimateMissingDurations(this.appHistory);
    
    // Deterministic ordering: newest first by detected_at (ms) when available,
    // otherwise fall back to timestamp.
    this.appHistory.sort((a, b) => {
      const aDet = a && a.detected_at != null ? Number(a.detected_at) : Date.parse(a?.timestamp || 0);
      const bDet = b && b.detected_at != null ? Number(b.detected_at) : Date.parse(b?.timestamp || 0);
      if (!isNaN(bDet) && !isNaN(aDet) && bDet !== aDet) return bDet - aDet;
      const aTs = Date.parse(a?.timestamp || 0);
      const bTs = Date.parse(b?.timestamp || 0);
      if (!isNaN(bTs) && !isNaN(aTs) && bTs !== aTs) return bTs - aTs;
      // Final stable tie-breaker: id desc if present
      if (a?.id && b?.id) return String(b.id).localeCompare(String(a.id));
      return 0;
    });
    
    // Apply current filters
    this.filterHistory();
  }

  /**
   * Estimate durations for items that are missing duration_seconds.
   * Uses the time difference to the next record (per chronological order),
   * caps each segment to 5 minutes, and defaults lone entries to 1 minute.
   */
  estimateMissingDurations(appData) {
    if (!Array.isArray(appData) || appData.length === 0) return [];

    // Work on a shallow copy sorted by timestamp ascending
    const items = appData.map(x => ({ ...x })).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const MAX_SEGMENT_SECONDS = 5 * 60; // 5 minutes cap

    for (let i = 0; i < items.length; i++) {
      const hasValidDuration = typeof items[i].duration_seconds === 'number' && items[i].duration_seconds > 0;
      if (!hasValidDuration) {
        const currentTs = new Date(items[i].timestamp).getTime();
        const nextTs = i < items.length - 1 ? new Date(items[i + 1].timestamp).getTime() : currentTs;
        let diff = Math.max(0, Math.floor((nextTs - currentTs) / 1000));
        if (diff === 0) diff = 60; // default to 1 minute when no next entry
        items[i].duration_seconds = Math.min(diff, MAX_SEGMENT_SECONDS);
      }
    }

    // Maintain original ordering (typically desc by timestamp)
    const estimatedById = new Map(items.map(it => [it.id, it]));
    return appData.map(it => estimatedById.get(it.id) || it);
  }

  /**
   * Categorize an app by name
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
   * Filter history based on search and category
   */
  filterHistory() {
    console.log('🔎 [APP-HISTORY] filterHistory() called');
    // Debounce filter to avoid re-render storms while typing
    if (this.__filterDebounceTimer) clearTimeout(this.__filterDebounceTimer);
    this.__filterDebounceTimer = setTimeout(() => this.__applyFilter(), 150);
  }

  __applyFilter() {
    const searchInput = document.getElementById('appSearchInput');
    const categorySelect = document.getElementById('appCategoryFilter');
    
    this.searchTerm = searchInput?.value.toLowerCase() || '';
    this.categoryFilter = categorySelect?.value || 'all';
    
    // Debug logging for search
    if (this.searchTerm) {
      console.log('🔍 [APP-HISTORY] Searching for:', this.searchTerm);
      console.log('🔍 [APP-HISTORY] Available apps:', this.appHistory.map(a => a.app_name));
    }
    
    // Build synonym set for common cases (e.g., note/notes/notebook/onenote)
    const synonyms = new Set([this.searchTerm]);
    if (this.searchTerm.startsWith('note')) {
      ['note', 'notes', 'notebook', 'one note', 'onenote', 'apple notes'].forEach(s => synonyms.add(s));
    }

    this.filteredHistory = this.appHistory.filter(app => {
      const appNameLower = app.app_name?.toLowerCase() || '';
      const windowTitleLower = app.window_title?.toLowerCase() || '';
      
      // Enhanced search: handle "notebook" searching for "notes"
      let matchesSearch = !this.searchTerm;
      if (this.searchTerm) {
        // Direct include for raw search term
        matchesSearch = appNameLower.includes(this.searchTerm) || windowTitleLower.includes(this.searchTerm);
        // Synonym fuzzy match
        if (!matchesSearch) {
          for (const alt of synonyms) {
            if (!alt) continue;
            if (appNameLower.includes(alt) || windowTitleLower.includes(alt)) { matchesSearch = true; break; }
          }
        }
      }
        
      const matchesCategory = this.categoryFilter === 'all' || 
        app.category === this.categoryFilter;
        
      return matchesSearch && matchesCategory;
    });
    
    // Sort by latest (newest first) for display using detected_at when present
    this.filteredHistory.sort((a, b) => {
      const aDet = a && a.detected_at != null ? Number(a.detected_at) : Date.parse(a?.timestamp || 0);
      const bDet = b && b.detected_at != null ? Number(b.detected_at) : Date.parse(b?.timestamp || 0);
      if (!isNaN(bDet) && !isNaN(aDet) && bDet !== aDet) return bDet - aDet;
      const aTs = Date.parse(a?.timestamp || 0);
      const bTs = Date.parse(b?.timestamp || 0);
      if (!isNaN(bTs) && !isNaN(aTs) && bTs !== aTs) return bTs - aTs;
      if (a?.id && b?.id) return String(b.id).localeCompare(String(a.id));
      return 0;
    });
    
    console.log(`🔍 [APP-HISTORY] Filtered to ${this.filteredHistory.length} items`);
    
    // Update display
    this.displayAppHistory();
    this.updateHistoryStatistics();
  }

  /**
   * Display app history list
   */
  displayAppHistory() {
    const historyList = document.getElementById('appHistoryList');
    const historyTitle = document.getElementById('historyTitle');
    
    if (!historyList) return;
    
    // Update title
    const displayDate = this.getDisplayDateString();
    if (historyTitle) {
      historyTitle.textContent = `App History - ${displayDate}`;
    }
    
    if (this.filteredHistory.length === 0) {
      this.showHistoryEmptyState();
      return;
    }
    
    // Generate history items HTML
    const historyHTML = this.filteredHistory.map(app => {
      const tsMs = app && app.detected_at != null ? Number(app.detected_at) : Date.parse(app?.timestamp || 0);
      const timestamp = new Date(tsMs);
      
      // Parse save time (created_at)
      const saveTime = app.created_at ? new Date(app.created_at) : null;
      const saveDelay = saveTime && timestamp ? Math.round((saveTime.getTime() - timestamp.getTime()) / 1000) : null;
      
      // Show HH:mm on the right badge, but also include exact time tooltip
      const timeString = new Date(tsMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      const saveTimeString = saveTime ? saveTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : null;
      const fullTime = new Date(tsMs).toLocaleTimeString();
      const fullSaveTime = saveTime ? saveTime.toLocaleTimeString() : null;
      const category = app.category || 'other';
      const duration = this.formatDuration(app.duration_seconds);
      
      // Build tooltip with both times
      let tooltip = `Detected: ${fullTime}`;
      if (fullSaveTime) {
        tooltip += ` • Saved: ${fullSaveTime}`;
        if (saveDelay !== null) {
          tooltip += ` (+${saveDelay}s)`;
        }
      }
      tooltip += ` • Duration: ${duration}`;
      
      return `
        <div class="detection-item history-item" data-app="${app.app_name}" data-category="${category}">
          <i data-lucide="monitor" class="detection-icon app-icon"></i>
          <div class="detection-info">
            <div class="detection-title">${app.app_name || 'Unknown App'}</div>
            <div class="detection-meta">
              <span>Window: ${app.window_title || 'Unknown'}</span>
              ${app.app_path ? `<span>Path: ${app.app_path}</span>` : ''}
            </div>
          </div>
          <div class="detection-status">
            <span class="app-category category-${category}">${category}</span>
            <div class="time-info">
              <span class="detection-time" title="${tooltip}">
                <i data-lucide="clock" style="width: 12px; height: 12px; margin-right: 2px;"></i>
                ${timeString}
              </span>
              ${saveTimeString ? `
                <span class="save-time" title="${tooltip}">
                  <i data-lucide="database" style="width: 12px; height: 12px; margin-right: 2px; color: #16a34a;"></i>
                  ${saveTimeString}
                  ${saveDelay !== null && saveDelay > 0 ? `<span class="save-delay">+${saveDelay}s</span>` : ''}
                </span>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    historyList.innerHTML = historyHTML;
    
    // Reinitialize Lucide icons
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
    
    console.log(`✅ [APP-HISTORY] Displayed ${this.filteredHistory.length} history items`);
  }

  /**
   * Display top apps section
   */
  displayTopApps() {
    const topAppsSection = document.getElementById('topAppsSection');
    const topAppsList = document.getElementById('topAppsList');
    
    if (!topAppsList || this.filteredHistory.length === 0) {
      if (topAppsSection) {
        topAppsSection.style.display = 'none';
      }
      return;
    }
    
    // Use top apps from IPC response or calculate from filtered data
    let appStats = [];
    if (this.historyStats && this.historyStats.topApps && this.historyStats.topApps.length > 0) {
      // Filter top apps to only show those in current filtered history
      const filteredAppNames = new Set(this.filteredHistory.map(app => app.app_name));
      appStats = this.historyStats.topApps.filter(app => filteredAppNames.has(app.name));
    }
    
    // Fallback: calculate from filtered data if no IPC stats available
    if (appStats.length === 0) {
      appStats = this.calculateTopApps();
    }
    
    if (appStats.length === 0) {
      topAppsSection.style.display = 'none';
      return;
    }
    
    // Generate top apps HTML
    const topAppsHTML = appStats.slice(0, 5).map((app, index) => {
      const duration = this.formatDuration(app.duration);
      const category = this.categorizeApp(app.name);
      
      return `
        <div class="top-app-item">
          <div class="top-app-info">
            <span class="top-app-rank">#${index + 1}</span>
            <span class="top-app-name">${app.name}</span>
          </div>
          <div class="top-app-stats">
            <span class="top-app-duration">${duration}</span>
            <span class="top-app-sessions">${app.sessions} sessions</span>
            <span class="app-category category-${category}">${category}</span>
          </div>
        </div>
      `;
    }).join('');
    
    topAppsList.innerHTML = topAppsHTML;
    topAppsSection.style.display = 'block';
    
    console.log(`✅ [APP-HISTORY] Displayed ${appStats.length} top apps`);
  }

  /**
   * Calculate top apps by usage time (fallback method)
   */
  calculateTopApps() {
    const appTotals = {};
    
    this.filteredHistory.forEach(app => {
      const appName = app.app_name || 'Unknown';
      if (!appTotals[appName]) {
        appTotals[appName] = { duration: 0, sessions: 0 };
      }
      appTotals[appName].duration += app.duration_seconds || 0;
      appTotals[appName].sessions += 1;
    });
    
    return Object.entries(appTotals)
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.duration - a.duration);
  }

  /**
   * Update statistics for live mode
   */
  updateLiveStatistics() {
    // For live mode, show basic counters from existing live data
    // This integrates with existing live detection functionality
    console.log('📊 [APP-HISTORY] Updated live statistics');
  }

  /**
   * Update statistics for history mode
   */
  updateHistoryStatistics() {
    const appsToday = document.getElementById('appsToday');
    const activeTime = document.getElementById('activeTime');
    const switchCount = document.getElementById('switchCount');
    const productivityScore = document.getElementById('productivityScore');
    
    if (this.filteredHistory.length === 0 || !this.historyStats) {
      if (appsToday) appsToday.textContent = '0';
      if (activeTime) activeTime.textContent = '0h 0m';
      if (switchCount) switchCount.textContent = '0';
      if (productivityScore) productivityScore.textContent = '0%';
      return;
    }
    
    // Use statistics from IPC response, but calculate for filtered data
    const uniqueApps = new Set(this.filteredHistory.map(app => app.app_name)).size;
    const totalDuration = this.filteredHistory.reduce((sum, app) => sum + (app.duration_seconds || 0), 0);
    const totalSessions = this.filteredHistory.length;
    
    // Calculate productivity score for filtered data
    const productivityCategories = ['development', 'productivity', 'communication'];
    const productiveTime = this.filteredHistory
      .filter(app => productivityCategories.includes(app.category || this.categorizeApp(app.app_name)))
      .reduce((sum, app) => sum + (app.duration_seconds || 0), 0);
    const productivityPercent = totalDuration > 0 ? Math.round((productiveTime / totalDuration) * 100) : 0;
    
    // Update UI
    if (appsToday) appsToday.textContent = uniqueApps.toString();
    if (activeTime) activeTime.textContent = this.formatDuration(totalDuration);
    if (switchCount) switchCount.textContent = totalSessions.toString();
    if (productivityScore) productivityScore.textContent = `${productivityPercent}%`;
    
    console.log(`📊 [APP-HISTORY] Updated statistics: ${uniqueApps} apps, ${this.formatDuration(totalDuration)} active time, ${productivityPercent}% productivity`);
  }

  /**
   * Show loading state for history
   */
  showLoadingState() {
    const historyList = document.getElementById('appHistoryList');
    const topAppsSection = document.getElementById('topAppsSection');
    
    if (historyList) {
      historyList.innerHTML = `
        <div class="no-detections" style="text-align: center; padding: 2rem;">
          <div style="margin-bottom: 1rem;">
            <div class="loading-spinner" style="width: 32px; height: 32px; border: 3px solid #f3f3f3; border-top: 3px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
          </div>
          <div>Loading app history...</div>
        </div>
        <style>
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      `;
    }
    
    if (topAppsSection) {
      topAppsSection.style.display = 'none';
    }
  }

  /**
   * Show empty state for history
   */
  showHistoryEmptyState(message = null) {
    const historyList = document.getElementById('appHistoryList');
    const topAppsSection = document.getElementById('topAppsSection');
    
    if (historyList) {
      const displayMessage = message || `No app history found for ${this.getDisplayDateString()}`;
      historyList.innerHTML = `<div class="no-detections">${displayMessage}</div>`;
    }
    
    if (topAppsSection) {
      topAppsSection.style.display = 'none';
    }
  }

  /**
   * Get display string for current date range
   */
  getDisplayDateString() {
    switch (this.dateRange) {
      case 'today':
        return 'Today';
      case 'yesterday':
        return 'Yesterday';
      case 'week':
        return 'Last 7 days';
      case 'custom':
        const customDate = document.getElementById('appCustomDate')?.value;
        return customDate ? new Date(customDate).toLocaleDateString() : 'Custom date';
      default:
        return 'Today';
    }
  }

  /**
   * Format duration in seconds to human readable string
   */
  formatDuration(seconds) {
    // Hide seconds in UI; round to minutes with a minimum of 1m for non-zero
    if (!seconds || seconds <= 0) return '0m';

    const totalMinutes = Math.max(1, Math.round(seconds / 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  /**
   * Get current state for debugging
   */
  getCurrentState() {
    return {
      currentMode: this.currentMode,
      dateRange: this.dateRange,
      historyCount: this.appHistory.length,
      filteredCount: this.filteredHistory.length,
      searchTerm: this.searchTerm,
      categoryFilter: this.categoryFilter
    };
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AppHistoryManager;
}

// Global initialization function
window.initializeAppHistoryManager = function(supabaseClient, ipcRenderer) {
  window.AppHistoryManager = new AppHistoryManager(supabaseClient, ipcRenderer);
  return window.AppHistoryManager;
};


// Mark as defined to guard against duplicate loads
if (typeof window !== 'undefined') {
  window.AppHistoryManager = window.AppHistoryManager || AppHistoryManager;
}

}
