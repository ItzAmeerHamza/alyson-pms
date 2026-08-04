const {
  formatWorkTime,
  formatWorkDateShort,
  getWorkTimezone,
  workDateKey,
} = require('../../src/modules/utils/work-timezone');

class UIManager {
  constructor(ipcRenderer, notificationManager) {
    this.ipcRenderer = ipcRenderer;
    this.notificationManager = notificationManager;
    this.reportsRefreshInterval = null;
    this.screenshotActivityInterval = null;
    this.monthlyReportRefreshInterval = null;
    
    // UI state
    this.cachedElements = null;
    this.performanceMetrics = {
      tabSwitchTimes: [],
      loadTimes: []
    };
    
    // Content loading states
    this.contentLoadingStates = {
      dashboard: false,
      screenshots: false,
      reports: false,
      projects: false
    };
    
    // Content cache
    this.contentCache = {
      dashboard: null,
      screenshots: null,
      reports: null,
      projects: null,
      lastUpdated: {}
    };
    
    // Tracking state
    this.trackingStatus = 'stopped'; // 'active', 'paused', 'stopped'
    this.isTracking = false;
    
    this.setupNavigation();
    
    // Bind methods that are defined later in the class
    // Note: These methods are defined as class methods below, so binding is not necessary
    // but we keep this structure for potential future dynamic method loading
  }

  setupNavigation() {
    // Debounced navigation to prevent performance issues
    this.handleNavigation = this.debounce((targetPage) => {
      this.showPage(targetPage);
      this.updatePageTitle(targetPage);
    }, 150);
  }

  /** Open the Alyson web dashboard in the system browser. */
  async openExternalDashboard(url = 'https://app.alyson.ai') {
    try {
      const result = await this.ipcRenderer.invoke('open-external-url', { url });
      if (!result?.success) {
        console.error('❌ [UI-MANAGER] Failed to open dashboard:', result?.error);
        this.notificationManager?.showNotification?.(
          'Could not open the web dashboard. Please visit app.alyson.ai in your browser.',
          'error'
        );
      }
    } catch (err) {
      console.error('❌ [UI-MANAGER] openExternalDashboard error:', err?.message || err);
      this.notificationManager?.showNotification?.(
        'Could not open the web dashboard. Please visit app.alyson.ai in your browser.',
        'error'
      );
    }
  }

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /** Retry IPC invoke while main process is still registering handlers at startup. */
  async _invokeIpcWhenReady(channel, maxAttempts = 24, delayMs = 250) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await this.ipcRenderer.invoke(channel);
      } catch (err) {
        const msg = String(err?.message || err);
        const notReady = msg.includes('No handler registered');
        if (!notReady || attempt === maxAttempts - 1) throw err;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  initializeUICache() {
    if (this.cachedElements) return this.cachedElements;
    
    console.log('🎯 Initializing UI element cache for performance...');
    
    this.cachedElements = {
      pages: {},
      navItems: {},
      currentActivePage: null,
      currentActiveNav: null
    };
    
    // Cache all page sections
    const pageIds = ['dashboard', 'timetracker', 'screenshots', 'faq', 'reports', 'url-activity', 'app-activity', 'activity-between-screenshots', 'today-history', 'developer-console', 'featureStatus'];
    pageIds.forEach(pageId => {
      const pageElement = document.getElementById(pageId + 'Page');
      if (pageElement) {
        this.cachedElements.pages[pageId] = pageElement;
        
        // Track current active page
        if (pageElement.classList.contains('active')) {
          this.cachedElements.currentActivePage = pageElement;
        }
      }
    });
    
    // Cache all navigation items
    pageIds.forEach(pageId => {
      const navElement = document.querySelector(`[data-page="${pageId}"]`);
      if (navElement) {
        this.cachedElements.navItems[pageId] = navElement;
        
        // Track current active nav
        if (navElement.classList.contains('active')) {
          this.cachedElements.currentActiveNav = navElement;
        }
        
        // Add click listener with enhanced debugging
        navElement.addEventListener('click', (e) => {
          console.log('🔍 [UI-MANAGER-DEBUG] Nav item clicked:', pageId);
          e.preventDefault();
          e.stopPropagation();

          const externalUrl = navElement.getAttribute('data-external-url');
          if (externalUrl) {
            this.openExternalDashboard(externalUrl);
            return;
          }
          
          // Special debugging for screenshot activity
          if (pageId === 'activity-between-screenshots') {
            console.log('🎯 [UI-MANAGER-DEBUG] Activity Monitor nav clicked!');
          }
          
          this.handleNavigation(pageId);
        });
        
        console.log('✅ [UI-MANAGER-DEBUG] Attached click listener to:', pageId);
      }
    });
    
    console.log('✅ UI cache initialized:', {
      pages: Object.keys(this.cachedElements.pages).length,
      navItems: Object.keys(this.cachedElements.navItems).length
    });
    
    return this.cachedElements;
  }

  // ULTRA PERFORMANCE OPTIMIZED: Lightning-fast tab switching with cached elements
  showPage(pageId) {
    try { if (window.RendererLogger) { window.RendererLogger.info({ category: 'SCREEN', screen: this.getPageTitle(pageId), step: 'OPEN' }); } } catch {}
    // Initialize cache if not already done - fast validation
    const cache = this.cachedElements || this.initializeUICache();
    
    // Ultra-fast early return if already on the target page
    if (cache.currentActivePage && cache.currentActivePage.id === pageId + 'Page') {
      return; // Already on page, no work needed
    }
    
    // Stop Activity Monitor when navigating away
    if (pageId !== 'activity-between-screenshots') {
      this.stopScreenshotActivityAutoRefresh();
      if (this.activityMonitorInstance) {
        this.activityMonitorInstance.stop();
      }
    }

    // Mount Activity Monitor when navigating to that page
    if (pageId === 'activity-between-screenshots') {
      console.log('📊 [UI-MANAGER] Navigating to Activity Monitor page');
      
      // Ensure we mount the ActivityMonitor component for live updates
      setTimeout(() => {
        console.log('📊 [UI-MANAGER] Mounting ActivityMonitor component...');
        if (!this.activityMonitorInstance) {
          try {
            const ActivityMonitor = require('./activity-monitor');
            this.activityMonitorInstance = new ActivityMonitor(this.ipcRenderer);
            console.log('✅ [UI-MANAGER] ActivityMonitor instance created');
          } catch (error) {
            console.error('❌ [UI-MANAGER] Failed to create ActivityMonitor:', error);
            return;
          }
        }
        
        // Mount the component to start live updates
        try {
          this.activityMonitorInstance.mount();
          console.log('✅ [UI-MANAGER] ActivityMonitor mounted successfully');
        } catch (error) {
          console.error('❌ [UI-MANAGER] Failed to mount ActivityMonitor:', error);
        }
      }, 100);
    }
    
    // Load today's history when navigating to that page
    if (pageId === 'today-history') {
      console.log('📅 [UI-MANAGER] Navigating to Today\'s History page');
      console.log('📅 [UI-MANAGER] loadTodayHistory method available:', !!this.loadTodayHistory);
      
      // Ensure we call the method after a small delay to let the page render
      setTimeout(() => {
        console.log('📅 [UI-MANAGER] Calling loadTodayHistory()...');
        if (this.loadTodayHistory) {
          this.loadTodayHistory();
        } else {
          console.error('❌ [UI-MANAGER] loadTodayHistory method not found!');
        }
      }, 100);
    }
    
    // Load time tracker content when navigating to that page
    if (pageId === 'timetracker') {
      console.log('⏱️ [UI-MANAGER] Navigating to Time Tracker page');
      console.log('⏱️ [UI-MANAGER] loadTimeTrackerContent method available:', !!this.loadTimeTrackerContent);
      
      // Ensure we call the method after a small delay to let the page render
      setTimeout(() => {
        console.log('⏱️ [UI-MANAGER] Calling loadTimeTrackerContent()...');
        if (this.loadTimeTrackerContent) {
          this.loadTimeTrackerContent();
        } else {
          console.error('❌ [UI-MANAGER] loadTimeTrackerContent method not found!');
        }
        if (typeof window.updateTrackerDailyRefreshHint === 'function') {
          window.updateTrackerDailyRefreshHint();
        }
        // Load monthly work report (uses its own cache)
        this.loadMonthlyReport();
        this.startMonthlyReportAutoRefresh();
        // Load recent screenshots on the time tracker page
        this.loadTrackerScreenshots();
      }, 100);
    } else {
      this.stopMonthlyReportAutoRefresh();
    }
    
    // Batch DOM operations for better performance
    const operations = [];
    
    // Hide current active page (single operation)
    if (cache.currentActivePage) {
      operations.push(() => cache.currentActivePage.classList.remove('active'));
    }
    
    // Remove active state from current nav item (single operation)
    if (cache.currentActiveNav) {
      operations.push(() => cache.currentActiveNav.classList.remove('active'));
    }
    
    // Show target page using cached element
    const targetPage = cache.pages[pageId];
    if (targetPage) {
      operations.push(() => {
        targetPage.classList.add('active');
        cache.currentActivePage = targetPage;
      });
    } else {
      // Fallback with cache update
      const fallbackPage = document.getElementById(pageId + 'Page');
      if (fallbackPage) {
        operations.push(() => {
          fallbackPage.classList.add('active');
          cache.currentActivePage = fallbackPage;
          cache.pages[pageId] = fallbackPage; // Update cache
        });
      }
    }
    
    // Add active state to corresponding nav item using cached element
    const navItem = cache.navItems[pageId];
    if (navItem) {
      operations.push(() => {
        navItem.classList.add('active');
        cache.currentActiveNav = navItem;
      });
    } else {
      // Fallback with cache update
      const fallbackNav = document.querySelector(`[data-page="${pageId}"]`);
      if (fallbackNav) {
        operations.push(() => {
          fallbackNav.classList.add('active');
          cache.currentActiveNav = fallbackNav;
          cache.navItems[pageId] = fallbackNav; // Update cache
        });
      }
    }
    
    // Execute all DOM operations in a single batch
    operations.forEach(op => op());
    
    // Load content if needed using lazy loading
    this.lazyLoadContent(pageId);
  }

  // === Activity Monitor Auto-Refresh (every 10s) ===
  startScreenshotActivityAutoRefresh() {
    try {
      // Clear any existing interval to avoid duplicates
      this.stopScreenshotActivityAutoRefresh();
      this.screenshotActivityInterval = setInterval(() => {
        // Only refresh if the Activity Monitor page is currently active
        const active = this.cachedElements?.currentActivePage?.id === 'activity-between-screenshotsPage';
        if (active && typeof this.loadScreenshotActivity === 'function') {
          this.loadScreenshotActivity();
        }
      }, 10000); // 10 seconds
      console.log('⏱️ [UI-MANAGER] Activity Monitor auto-refresh started (10s)');
    } catch (e) {
      console.log('⚠️ [UI-MANAGER] Failed to start Activity Monitor auto-refresh:', e?.message);
    }
  }

  stopScreenshotActivityAutoRefresh() {
    if (this.screenshotActivityInterval) {
      clearInterval(this.screenshotActivityInterval);
      this.screenshotActivityInterval = null;
      console.log('⏹️ [UI-MANAGER] Activity Monitor auto-refresh stopped');
    }
  }

  updatePageTitle(pageId) {
    const pageTitle = document.getElementById('pageTitle');
    if (!pageTitle) return;
    
    const pageTitles = {
      'dashboard': 'Dashboard',
      'timetracker': 'Time Tracker', 
      'screenshots': 'Screenshots',
      'reports': 'Live Report',
      // Added missing titles so the header reflects the active page
      'url-activity': 'URL History',
      'app-activity': 'App Detection',
      'activity-between-screenshots': 'Activity Monitor',
      'today-history': "Today's History",
      'faq': 'FAQ'
    };
    
    pageTitle.textContent = pageTitles[pageId] || 'Dashboard';
  }

  lazyLoadContent(pageId) {
    // Prevent multiple simultaneous loads
    if (this.contentLoadingStates[pageId]) {
      return;
    }
    
    // SPECIAL CASE: Always load fresh data for reports
    if (pageId === 'reports') {
      console.log('📊 Force loading fresh reports data (no cache)');
      this.contentCache.reports = null;
      this.contentCache.lastUpdated.reports = null;
    } else {
      // Check if content is cached and fresh (within 5 minutes) for other pages
      const cached = this.contentCache[pageId];
      const lastUpdated = this.contentCache.lastUpdated[pageId];
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      
      if (cached && lastUpdated && lastUpdated > fiveMinutesAgo) {
        // Use cached content
        console.log(`📋 Using cached content for ${pageId}`);
        return;
      }
    }
    
    // Use requestIdleCallback for better performance
    this.safeRequestIdleCallback(() => {
      this.loadPageContent(pageId);
    });
  }

  safeRequestIdleCallback(callback, fallbackDelay = 16) {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(callback, { timeout: 100 });
    } else {
      setTimeout(callback, fallbackDelay);
    }
  }

  loadPageContent(pageId) {
    if (this.contentLoadingStates[pageId]) return;
    
    this.contentLoadingStates[pageId] = true;
    
    try {
      switch (pageId) {
        case 'screenshots':
          this.loadRecentScreenshots();
          break;
        case 'reports':
          // Force fresh data load for reports, don't use cache
          this.contentLoadingStates.reports = false;
          this.contentCache.reports = null;
          console.log('🔄 [UI-MANAGER] Force loading fresh reports data (no cache)');
          this.loadRecentReports();
          break;
        case 'dashboard':
          this.loadDashboardMetrics();
          break;
        case 'url-activity':
          // Always force reload; do not use cache
          this.contentCache['url-activity'] = null;
          this.contentCache.lastUpdated['url-activity'] = null;
          if (typeof window !== 'undefined' && typeof window.initUrlHistoryPage === 'function') {
            try { window.initUrlHistoryPage(); } catch (e) { console.error('Failed to init URL history page', e); }
          } else if (this.loadUrlActivity) {
            this.loadUrlActivity();
          }
          break;
        case 'app-activity':
          this.loadAppActivity();
          break;
        case 'activity-between-screenshots':
          this.loadScreenshotActivity();
          break;
        case 'today-history':
          this.loadTodayHistory();
          break;
        case 'timetracker':
          this.loadTimeTrackerContent();
          break;
        default:
          console.log(`📄 No specific content loader for ${pageId}`);
      }
      
      // Cache the loaded content
      this.contentCache[pageId] = true;
      this.contentCache.lastUpdated[pageId] = Date.now();
      
    } catch (error) {
      console.error(`❌ Failed to load content for ${pageId}:`, error);
    } finally {
      this.contentLoadingStates[pageId] = false;
    }
  }

  async loadRecentScreenshots() {
    const __t0 = Date.now();
    try { if (window.RendererLogger) { window.RendererLogger.info({ category: 'SCREEN', screen: 'Screenshots', step: 'DATA LOAD START' }); } } catch {}
    console.log('📸 [UI-MANAGER] Loading recent screenshots...');
    
    // Call the global loadRecentScreenshots function from the UI system
    if (typeof window.loadRecentScreenshots === 'function') {
      console.log('📸 [UI-MANAGER] Calling global loadRecentScreenshots...');
      await window.loadRecentScreenshots();
      try { if (window.RendererLogger) { window.RendererLogger.info({ category: 'SCREEN', screen: 'Screenshots', step: 'DATA LOAD END', ctx: { duration_ms: Date.now() - __t0 } }); } } catch {}
    } else {
      console.error('❌ [UI-MANAGER] loadRecentScreenshots function not found on window');
      
      // Fallback: Try to call it directly
      try {
        if (typeof loadRecentScreenshots === 'function') {
          console.log('📸 [UI-MANAGER] Calling direct loadRecentScreenshots...');
          await loadRecentScreenshots();
          try { if (window.RendererLogger) { window.RendererLogger.info({ category: 'SCREEN', screen: 'Screenshots', step: 'DATA LOAD END', ctx: { duration_ms: Date.now() - __t0 } }); } } catch {}
        } else {
          console.error('❌ [UI-MANAGER] loadRecentScreenshots function not available');
        }
      } catch (error) {
        console.error('❌ [UI-MANAGER] Error calling loadRecentScreenshots:', error);
        try { if (window.RendererLogger) { window.RendererLogger.error({ category: 'SCREEN', screen: 'Screenshots', step: 'DATA LOAD ERROR', message: error?.message }); } } catch {}
      }
    }
  }

  async loadRecentReports(retryCount = 0) {
    console.log(`📊 Loading recent reports... (attempt ${retryCount + 1})`);
    
    // 🧠 Optimization: Prevent multiple simultaneous report loads
    if (this.contentLoadingStates.reports) {
      console.log('⚠️ Reports already loading, skipping...');
      return;
    }
    
    this.contentLoadingStates.reports = true;
    
    try {
      // Get the reports page container
      const reportsPage = document.getElementById('reportsPage');
      if (!reportsPage) {
        console.error('❌ Reports page not found');
        return;
      }

      // Show loading state
      this.showLoadingState(reportsPage, 'Loading reports...');

      // 🧠 Optimization: Reduced timeout and improved error handling
      const fetchWithTimeout = (promise, timeout = 3000) => {
        return Promise.race([
          promise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Request timeout')), timeout))
        ]);
      };

      // Use the new unified tracking snapshot
      const result = await fetchWithTimeout(
        this.ipcRenderer.invoke('reports:get-tracking-snapshot', {
          limit: 20,
          timeRange: '24h'
        })
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to get tracking snapshot');
      }

      console.log('📊 [UI-MANAGER] Tracking snapshot received:', {
        isTracking: result.data.session.isTracking,
        statsUpdated: result.data.stats.updatedAt,
        logsCount: result.data.logs.items.length,
        hasMore: result.data.logs.hasMore,
        networkStatus: result.data.network
      });

      // Generate modern reports HTML with unified data
      const reportsHTML = this.generateModernReportsHTML(result.data);
      
      // Update the reports page content
      reportsPage.innerHTML = reportsHTML;

      // Apply Lucide icons
      if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
      }

      // Add event listeners for interactive elements
      this.attachReportsEventListeners(result.data);

      // Mark as loaded
      this.contentLoadingStates.reports = true;
      this.contentCache.reports = reportsHTML;
      this.contentCache.lastUpdated.reports = new Date();

      console.log('✅ Reports loaded successfully');

      // AUTO-REFRESH: Set up real-time updates for Recent Activity Logs
      this.setupReportsAutoRefresh();

    } catch (error) {
      console.error('❌ Error loading reports:', error);
      
      // Check if this is a "no handler registered" error
      const isHandlerError = error.message && error.message.includes('No handler registered');
      
      if (isHandlerError) {
        console.error('❌ Reports handler not available - showing fallback UI');
        this.showFallbackReportsUI();
        return;
      }
      
      // Retry logic - attempt up to 2 more times with delay for other errors
      if (retryCount < 2) {
        console.log(`🔄 Retrying reports load in 2 seconds... (${retryCount + 1}/2)`);
        setTimeout(() => {
          this.loadRecentReports(retryCount + 1);
        }, 2000);
      } else {
        console.error('❌ All retry attempts exhausted for reports loading');
        this.showErrorState(document.getElementById('reportsPage'), 'Failed to load reports. Click here to retry.');
        
        // Add click handler for manual retry
        const reportsPage = document.getElementById('reportsPage');
        if (reportsPage) {
          reportsPage.style.cursor = 'pointer';
          reportsPage.onclick = () => {
            reportsPage.onclick = null;
            reportsPage.style.cursor = 'default';
            this.loadRecentReports(0);
          };
        }
      }
    } finally {
      // 🧠 Optimization: Reset loading state to allow future loads
      this.contentLoadingStates.reports = false;
    }
  }

  setupReportsAutoRefresh() {
    // Clear any existing auto-refresh to prevent duplicates
    if (this.reportsRefreshInterval) {
      clearInterval(this.reportsRefreshInterval);
    }

    // Auto-refresh every 30 seconds when on reports page
    this.reportsRefreshInterval = setInterval(() => {
      const reportsPage = document.getElementById('reportsPage');
      const currentPage = document.querySelector('.page.active')?.id;
      
      // Only refresh if reports page is currently visible
      if (reportsPage && currentPage === 'reportsPage') {
        console.log('🔄 [AUTO-REFRESH] Updating Recent Activity Logs...');
        
        // Silent refresh - don't show loading state again
        this.refreshRecentReportsData();
      }
    }, 30000); // 30 seconds

    console.log('🔄 [AUTO-REFRESH] Set up 30-second auto-refresh for Recent Activity Logs');
  }

  async refreshRecentReportsData() {
    try {
      // Fetch fresh data without showing loading state
      const [activityStats, antiCheatReport, activityLogs] = await Promise.all([
        this.ipcRenderer.invoke('get-activity-stats').catch(err => ({ error: err.message })),
        this.ipcRenderer.invoke('get-anti-cheat-report').catch(err => ({ error: err.message })),
        this.ipcRenderer.invoke('get-activity-logs').catch(err => ({ error: err.message }))
      ]);

      console.log('🔄 [AUTO-REFRESH] Fresh data received:', {
        activityStats: {
          mouseMovements: activityStats.mouseMovements,
          keyPresses: activityStats.keyPresses,
          mouseClicks: activityStats.mouseClicks,
          activeTime: activityStats.activeTime,
          error: activityStats.error
        },
        logsCount: activityLogs.logs?.length || 0,
        latestLog: activityLogs.logs?.[0]?.description,
        timestamp: new Date().toLocaleTimeString()
      });

      // Update the reports page content
      const reportsPage = document.getElementById('reportsPage');
      if (reportsPage) {
        const reportsHTML = this.generateReportsHTML(activityStats, antiCheatReport, activityLogs);
        reportsPage.innerHTML = reportsHTML;
        
        console.log('✅ [AUTO-REFRESH] Reports updated successfully');
      }

    } catch (error) {
      console.error('❌ [AUTO-REFRESH] Error refreshing reports:', error);
    }
  }

  generateReportsHTML(activityStats, antiCheatReport, activityLogs) {
    const now = new Date();
    const formatTime = (date) => date.toLocaleString();
    
    return `
      <div class="control-section">
        <div class="control-header">
          <div class="control-title">My Reports</div>
          <div class="control-subtitle">View your time tracking reports and statistics</div>
        </div>
        
        <div class="reports-container">
          <!-- Activity Statistics -->
          <div class="report-card">
            <div class="report-card-header">
              <i data-lucide="activity" style="width: 20px; height: 20px;"></i>
              <h3>Activity Statistics</h3>
              <span class="report-timestamp">Updated: ${formatTime(now)}</span>
            </div>
            <div class="report-card-content">
              ${this.generateActivityStatsHTML(activityStats)}
            </div>
          </div>

          <!-- Anti-Cheat Report -->
          <div class="report-card">
            <div class="report-card-header">
              <i data-lucide="shield-check" style="width: 20px; height: 20px;"></i>
              <h3>Security Monitor</h3>
              <span class="report-timestamp">Updated: ${formatTime(now)}</span>
            </div>
            <div class="report-card-content">
              ${this.generateAntiCheatHTML(antiCheatReport)}
            </div>
          </div>

          <!-- Recent Activity Logs -->
          <div class="report-card">
            <div class="report-card-header">
              <i data-lucide="list" style="width: 20px; height: 20px;"></i>
              <h3>Recent Activity Logs</h3>
              <span class="report-timestamp">Updated: ${formatTime(now)}</span>
            </div>
            <div class="report-card-content">
              ${this.generateActivityLogsHTML(activityLogs)}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  generateActivityStatsHTML(stats) {
    if (stats.error) {
      return `<div class="error-message">Error loading activity stats: ${stats.error}</div>`;
    }

    return `
      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-icon"><i data-lucide="mouse-pointer-2"></i></span>
          <div class="stat-value">${stats.mouseMovements || 0}</div>
          <div class="stat-label">Mouse Movements</div>
        </div>
        <div class="stat-item">
          <span class="stat-icon"><i data-lucide="keyboard"></i></span>
          <div class="stat-value">${stats.keyPresses || 0}</div>
          <div class="stat-label">Key Presses</div>
        </div>
        <div class="stat-item">
          <span class="stat-icon"><i data-lucide="mouse"></i></span>
          <div class="stat-value">${stats.mouseClicks || 0}</div>
          <div class="stat-label">Mouse Clicks</div>
        </div>
        <div class="stat-item">
          <span class="stat-icon"><i data-lucide="timer"></i></span>
          <div class="stat-value">${this.formatDuration(stats.activeTime || 0)}</div>
          <div class="stat-label">Active Time</div>
        </div>
        <div class="stat-item">
          <span class="stat-icon"><i data-lucide="app-window"></i></span>
          <div class="stat-value">${stats.appsCount || 0}</div>
          <div class="stat-label">Apps Used</div>
        </div>
        <div class="stat-item">
          <span class="stat-icon"><i data-lucide="camera"></i></span>
          <div class="stat-value">${stats.screenshotCount || 0}</div>
          <div class="stat-label">Screenshots</div>
        </div>
      </div>
    `;
  }

  generateAntiCheatHTML(report) {
    if (report.error) {
      return `<div class="error-message">Error loading security report: ${report.error}</div>`;
    }

    const riskLevel = report.currentRiskLevel || 'LOW';
    const riskColor = riskLevel === 'HIGH' ? '#ef4444' : riskLevel === 'MEDIUM' ? '#f59e0b' : '#10b981';

    return `
      <div class="security-status">
        <div class="status-item">
          <div class="status-label">Risk Level</div>
          <div class="status-value" style="color: ${riskColor};">${riskLevel}</div>
        </div>
        <div class="status-item">
          <div class="status-label">Suspicious Events</div>
          <div class="status-value">${report.totalSuspiciousEvents || 0}</div>
        </div>
        <div class="status-item">
          <div class="status-label">Last Check</div>
          <div class="status-value">${report.lastCheck ? new Date(report.lastCheck).toLocaleTimeString() : 'N/A'}</div>
        </div>
      </div>
    `;
  }

  generateActivityLogsHTML(logs) {
    console.log('🎨 [UI-MANAGER] Generating activity logs HTML:', {
      hasError: !!logs.error,
      logsLength: logs.logs?.length || 0,
      firstLogType: logs.logs?.[0]?.type
    });

    if (logs.error) {
      return `<div class="error-message">Error loading activity logs: ${logs.error}</div>`;
    }

    if (!logs.logs || logs.logs.length === 0) {
      return `<div class="empty-state">
        <p>No recent activity logs available</p>
        <small style="color: #666; font-size: 12px;">Activity logs will appear here when you start tracking time and using applications.</small>
      </div>`;
    }

    const logItems = logs.logs.slice(0, 10).map(log => `
      <div class="log-item">
        <div class="log-timestamp">${new Date(log.timestamp).toLocaleString()}</div>
        <div class="log-type" style="font-weight: 500; color: #2563eb;">${log.type || 'Activity'}</div>
        <div class="log-description">${log.description || 'No description'}</div>
      </div>
    `).join('');

    console.log(`✅ [UI-MANAGER] Generated HTML for ${logs.logs.length} activity logs`);
    return `<div class="logs-list">${logItems}</div>`;
  }

  showLoadingState(container, message = 'Loading...') {
    container.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <p>${message}</p>
      </div>
    `;
  }

  showErrorState(container, message = 'An error occurred') {
    container.innerHTML = `
      <div class="error-state">
        <i data-lucide="alert-circle" style="width: 48px; height: 48px; color: #ef4444; margin-bottom: 16px;"></i>
        <p style="color: #ef4444;">${message}</p>
        <button onclick="location.reload()" style="margin-top: 16px;">Retry</button>
      </div>
    `;
  }

  showFallbackReportsUI() {
    const reportsPage = document.getElementById('reportsPage');
    if (!reportsPage) return;

    const fallbackHTML = `
      <div class="reports-container">
        <div class="report-card">
          <div class="report-card-header">
            <i data-lucide="info" style="width: 20px; height: 20px; color: #3b82f6;"></i>
            <h3>Reports Service Unavailable</h3>
            <div class="report-timestamp">Service temporarily unavailable</div>
          </div>
          <div class="report-card-content">
            <div class="empty-state">
              <p style="margin-bottom: 16px;">The reports service is currently initializing or unavailable.</p>
              <p style="margin-bottom: 16px;">This can happen during application startup or if there are connectivity issues.</p>
              <button onclick="window.location.reload()" style="
                padding: 8px 16px;
                background: #3b82f6;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
              ">Reload Application</button>
            </div>
          </div>
        </div>
      </div>
    `;

    reportsPage.innerHTML = fallbackHTML;
    
    // Apply Lucide icons
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }

    console.log('✅ Fallback reports UI displayed');
  }

  formatDuration(seconds) {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  /**
   * Generate modern reports HTML with unified tracking snapshot data
   */
  generateModernReportsHTML(snapshot) {
    const { session, stats, security, logs, network } = snapshot;
    const now = new Date();
    const formatTime = (date) => new Date(date).toLocaleString();

    return `
      <div class="control-section">
        <div class="control-header">
          <div class="control-title">My Reports</div>
          <div class="control-subtitle">View your time tracking reports and statistics</div>
          ${this.generateTrackingStatusPill(session)}
        </div>
        
        <div class="reports-container">
          <!-- Activity Statistics Card -->
          <div class="report-card" id="activity-stats-card">
            <div class="report-card-header">
              <i data-lucide="activity" style="width: 20px; height: 20px;"></i>
              <h3>Activity Statistics</h3>
              <span class="report-timestamp">Updated: ${formatTime(stats.updatedAt)}</span>
            </div>
            <div class="report-card-content">
              ${this.generateModernActivityStatsHTML(stats, session)}
            </div>
          </div>

          <!-- Security Monitor Card -->
          <div class="report-card" id="security-monitor-card">
            <div class="report-card-header">
              <i data-lucide="shield-check" style="width: 20px; height: 20px;"></i>
              <h3>Security Monitor</h3>
              <span class="report-timestamp">Updated: ${formatTime(security.updatedAt)}</span>
            </div>
            <div class="report-card-content">
              ${this.generateModernSecurityHTML(security)}
            </div>
          </div>

          <!-- Recent Activity Logs Card -->
          <div class="report-card" id="activity-logs-card">
            <div class="report-card-header">
              <i data-lucide="list" style="width: 20px; height: 20px;"></i>
              <h3>Recent Activity Logs</h3>
              <span class="report-timestamp">Updated: ${formatTime(logs.updatedAt)}</span>
            </div>
            <div class="report-card-content">
              ${this.generateModernActivityLogsHTML(logs)}
            </div>
          </div>

          <!-- Network Status Indicator -->
          ${this.generateNetworkStatusHTML(network)}
        </div>
      </div>
    `;
  }

  /**
   * Generate tracking status pill
   */
  generateTrackingStatusPill(session) {
    let status, className, icon;
    
    if (session.isTracking && !session.isPaused && !session.isIdle) {
      status = 'Tracking';
      className = 'tracking';
      icon = 'play-circle';
    } else if (session.isPaused) {
      status = 'Paused';
      className = 'paused';
      icon = 'pause-circle';
    } else if (session.isIdle && session.isTracking) {
      status = 'Idle';
      className = 'idle';
      icon = 'clock';
    } else {
      status = 'Not Tracking';
      className = 'not-tracking';
      icon = 'stop-circle';
    }

    return `
      <div class="tracking-status-pill ${className}">
        <i data-lucide="${icon}" style="width: 16px; height: 16px;"></i>
        <span>${status}</span>
      </div>
    `;
  }

  /**
   * Generate modern activity stats HTML with context-aware messaging
   */
  generateModernActivityStatsHTML(stats, session) {
    const isTracking = session.isTracking && !session.isPaused;
    
    if (!isTracking) {
      return `
        <div class="stats-grid dimmed">
          <div class="stat-item">
            <span class="stat-icon"><i data-lucide="mouse-pointer-2"></i></span>
            <div class="stat-value">${stats.mouseMoves || 0}</div>
            <div class="stat-label">Mouse Movements</div>
          </div>
          <div class="stat-item">
            <span class="stat-icon"><i data-lucide="keyboard"></i></span>
            <div class="stat-value">${stats.keyPresses || 0}</div>
            <div class="stat-label">Key Presses</div>
          </div>
          <div class="stat-item">
            <span class="stat-icon"><i data-lucide="mouse"></i></span>
            <div class="stat-value">${stats.mouseClicks || 0}</div>
            <div class="stat-label">Mouse Clicks</div>
          </div>
          <div class="stat-item">
            <span class="stat-icon"><i data-lucide="timer"></i></span>
            <div class="stat-value">${this.formatDuration(stats.activeSeconds || 0)}</div>
            <div class="stat-label">Active Time</div>
          </div>
        </div>
        <div class="helper-text">
          <i data-lucide="info" style="width: 16px; height: 16px;"></i>
          <span>Showing last 24h activity. Start tracking to see live session stats.</span>
        </div>
      `;
    }

    return `
      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-icon"><i data-lucide="mouse-pointer-2"></i></span>
          <div class="stat-value">${stats.mouseMoves || 0}</div>
          <div class="stat-label">Mouse Movements</div>
        </div>
        <div class="stat-item">
          <span class="stat-icon"><i data-lucide="keyboard"></i></span>
          <div class="stat-value">${stats.keyPresses || 0}</div>
          <div class="stat-label">Key Presses</div>
        </div>
        <div class="stat-item">
          <span class="stat-icon"><i data-lucide="mouse"></i></span>
          <div class="stat-value">${stats.mouseClicks || 0}</div>
          <div class="stat-label">Mouse Clicks</div>
        </div>
        <div class="stat-item">
          <span class="stat-icon"><i data-lucide="timer"></i></span>
          <div class="stat-value">${this.formatDuration(stats.activeSeconds || 0)}</div>
          <div class="stat-label">Active Time</div>
        </div>
      </div>
    `;
  }

  /**
   * Generate modern security monitor HTML
   */
  generateModernSecurityHTML(security) {
    if (!security.screenPermOk) {
      return `
        <div class="security-warning">
          <div class="warning-header">
            <i data-lucide="alert-triangle" style="width: 20px; height: 20px; color: #f59e0b;"></i>
            <span>Permission Required</span>
          </div>
          <p>Screen recording permission is required for full functionality.</p>
          <button class="permission-fix-btn" onclick="window.fixPermissions()">
            <i data-lucide="settings" style="width: 16px; height: 16px;"></i>
            Fix Permissions
          </button>
        </div>
      `;
    }

    const flagsCount = security.antiCheatFlags?.length || 0;
    const riskLevel = flagsCount > 0 ? 'MEDIUM' : 'LOW';
    const riskColor = riskLevel === 'HIGH' ? '#ef4444' : riskLevel === 'MEDIUM' ? '#f59e0b' : '#10b981';

    return `
      <div class="security-status">
        <div class="status-item">
          <div class="status-label">Risk Level</div>
          <div class="status-value" style="color: ${riskColor};">${riskLevel}</div>
        </div>
        <div class="status-item">
          <div class="status-label">Security Flags</div>
          <div class="status-value">${flagsCount}</div>
        </div>
        <div class="status-item">
          <div class="status-label">Screen Permission</div>
          <div class="status-value" style="color: #10b981;">✓ Granted</div>
        </div>
      </div>
    `;
  }

  /**
   * Generate modern activity logs HTML with pagination
   */
  generateModernActivityLogsHTML(logs) {
    if (!logs.items || logs.items.length === 0) {
      return `
        <div class="empty-state">
          <i data-lucide="inbox" style="width: 48px; height: 48px; color: #9ca3af; margin-bottom: 16px;"></i>
          <p>No recent activity</p>
          <small>Activity logs will appear here when you start using the application.</small>
        </div>
      `;
    }

    const logItems = logs.items.map(log => {
      const typeColors = {
        'App Switch': '#3b82f6',
        'Web Activity': '#10b981',
        'Screenshot': '#8b5cf6',
        'Input Activity': '#f59e0b',
        'Idle Start': '#6b7280',
        'Idle End': '#10b981',
        'Warning': '#f59e0b',
        'Error': '#ef4444'
      };

      return `
        <div class="log-item" data-log-type="${log.type}">
          <div class="log-icon" style="background-color: ${typeColors[log.type] || '#6b7280'};">
            <i data-lucide="${this.getLogIcon(log.type)}" style="width: 14px; height: 14px; color: white;"></i>
          </div>
          <div class="log-content">
            <div class="log-header">
              <span class="log-type">${log.type}</span>
              <span class="log-timestamp">${new Date(log.ts).toLocaleString()}</span>
            </div>
            <div class="log-message">${log.message}</div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="logs-container">
        <div class="logs-list" id="activity-logs-list">
          ${logItems}
        </div>
        ${logs.hasMore ? `
          <button class="load-more-btn" id="load-more-logs">
            <i data-lucide="chevron-down" style="width: 16px; height: 16px;"></i>
            Load More
          </button>
        ` : ''}
      </div>
    `;
  }

  /**
   * Generate network status HTML
   */
  generateNetworkStatusHTML(network) {
    if (!network.isOnline || network.offlineQueue > 0) {
      return `
        <div class="network-status-banner ${network.isOnline ? 'warning' : 'error'}">
          <i data-lucide="${network.isOnline ? 'wifi' : 'wifi-off'}" style="width: 16px; height: 16px;"></i>
          <span>
            ${network.isOnline ? 
              `${network.offlineQueue} items queued for sync` : 
              'Offline - data will sync when connection is restored'
            }
          </span>
        </div>
      `;
    }
    return '';
  }

  /**
   * Get appropriate icon for log type
   */
  getLogIcon(type) {
    const icons = {
      'App Switch': 'monitor',
      'Web Activity': 'globe',
      'Screenshot': 'camera',
      'Input Activity': 'mouse-pointer-2',
      'Idle Start': 'moon',
      'Idle End': 'sun',
      'Warning': 'alert-triangle',
      'Error': 'alert-circle'
    };
    return icons[type] || 'activity';
  }

  /**
   * Attach event listeners for interactive reports elements
   */
  attachReportsEventListeners(snapshot) {
    // Load more logs button
    const loadMoreBtn = document.getElementById('load-more-logs');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', () => this.loadMoreLogs(snapshot.logs.nextCursor));
    }

    // Permission fix button
    window.fixPermissions = () => {
      this.ipcRenderer.invoke('request-screen-permissions');
    };

    // Log item click handlers for details
    const logItems = document.querySelectorAll('.log-item');
    logItems.forEach(item => {
      item.addEventListener('click', (e) => {
        const logType = item.getAttribute('data-log-type');
        this.showLogDetails(logType, e);
      });
    });
  }

  /**
   * Load more activity logs
   */
  async loadMoreLogs(cursor) {
    if (!cursor) return;

    try {
      const result = await this.ipcRenderer.invoke('reports:get-tracking-snapshot', {
        cursor,
        limit: 20,
        timeRange: '24h'
      });

      if (result.success && result.data.logs.items.length > 0) {
        const logsList = document.getElementById('activity-logs-list');
        const moreLogsHTML = result.data.logs.items.map(log => {
          // Same log item generation logic as above
          return this.generateLogItemHTML(log);
        }).join('');

        logsList.insertAdjacentHTML('beforeend', moreLogsHTML);

        // Update load more button
        const loadMoreBtn = document.getElementById('load-more-logs');
        if (!result.data.logs.hasMore) {
          loadMoreBtn.style.display = 'none';
        } else {
          loadMoreBtn.onclick = () => this.loadMoreLogs(result.data.logs.nextCursor);
        }
      }
    } catch (error) {
      console.error('❌ Error loading more logs:', error);
    }
  }

  /**
   * Show log details in a modal or drawer
   */
  showLogDetails(logType, event) {
    console.log('📋 Showing details for log type:', logType);
    // Implementation for showing detailed log information
  }

  // PERF FIX: Cache + single-flight get-today-time-stats so login storms
  // (10+ parallel calls) share one query and never race zeros onto the clock.
  async _getCachedTodayTimeStats({ force = false } = {}) {
    const now = Date.now();
    const trackingLive =
      !!window.__lastTrackingStartTime ||
      this.trackingStatus === 'active' ||
      !!(typeof window.isTrayTimerDrivingDisplay === 'function' && window.isTrayTimerDrivingDisplay());
    const ttlMs = trackingLive ? 15000 : 5000;

    if (
      !force &&
      this._todayStatsCache &&
      !this._todayStatsCache.error &&
      (now - this._todayStatsCacheTime) < ttlMs &&
      this._todayStatsCache.effectiveStatsComputed !== false
    ) {
      return this._todayStatsCache;
    }

    if (this._todayStatsInFlight) {
      return this._todayStatsInFlight;
    }

    this._todayStatsInFlight = (async () => {
      try {
        const result = await this.ipcRenderer.invoke('get-today-time-stats');
        // Keep last-good only on hard failure / wipe-to-zero — never freeze an
        // inflated total (that made the live clock run ahead of wall time).
        const prev = this._todayStatsCache;
        const incomingTotal = Math.max(0, Math.floor(Number(result?.totalTime) || 0));
        const prevTotal = Math.max(0, Math.floor(Number(prev?.totalTime) || 0));
        if (result?.error && prev && !prev.error && prevTotal > 0) {
          console.warn('⚠️ [TODAY-TIME] Keeping cached stats after error');
          return prev;
        }
        if (
          prev &&
          !prev.error &&
          prevTotal > 60 &&
          incomingTotal < 30 &&
          !result?.offlinePendingCount
        ) {
          console.warn('⚠️ [TODAY-TIME] Keeping cached stats; ignoring wipe-to-zero response');
          return prev;
        }
        // Live tracking: reject mid-range sync drops (network blip / partial remote).
        if (
          trackingLive &&
          prev &&
          !prev.error &&
          prevTotal > 60 &&
          incomingTotal + 15 < prevTotal &&
          !result?.floorHeld
        ) {
          console.warn(
            `⚠️ [TODAY-TIME] Keeping cached ${prevTotal}s; ignoring sync drop to ${incomingTotal}s while tracking`,
          );
          return {
            ...prev,
            ongoingCurrentSessionSeconds: result?.ongoingCurrentSessionSeconds ?? prev.ongoingCurrentSessionSeconds,
            offlinePendingCount: result?.offlinePendingCount ?? prev.offlinePendingCount,
          };
        }
        if (result && !result.error) {
          this._todayStatsCache = result;
          this._todayStatsCacheTime = Date.now();
        }
        return result;
      } finally {
        this._todayStatsInFlight = null;
      }
    })();

    return this._todayStatsInFlight;
  }

  /** Bust cache so Start / focus refresh get fresh effective split. */
  invalidateTodayTimeStatsCache() {
    this._todayStatsCache = null;
    this._todayStatsCacheTime = 0;
    this._todayStatsInFlight = null;
  }

  async loadDashboardMetrics() {
    console.log('📈 Loading comprehensive dashboard metrics...');
    
    try {
      if (this.ipcRenderer) {
        // Load user profile
        await this.loadUserProfile();
        
        // Load all time statistics in parallel (using cached today stats to prevent duplicate DB query)
        const [todayStats, weeklyStats, monthlyStats] = await Promise.all([
          this._getCachedTodayTimeStats(),
          this.ipcRenderer.invoke('get-weekly-time-stats'),
          this.ipcRenderer.invoke('get-monthly-time-stats')
        ]);
        
        // Dashboard stats loaded successfully
        
        // Update today's time
        if (todayStats && !todayStats.error) {
          if (typeof window.applyTodayEffectiveStats === 'function') {
            window.applyTodayEffectiveStats(todayStats);
          }
          this.updateTodayTime(todayStats.totalTime, {
            effectiveSeconds: todayStats.effectiveSeconds,
          });
        }
        
        // Update weekly time
        if (weeklyStats && !weeklyStats.error) {
          this.updateWeeklyTime(weeklyStats.totalTime);
        }
        
        // Update monthly time
        if (monthlyStats && !monthlyStats.error) {
          this.updateMonthlyTime(monthlyStats.totalTime);
        }
        
        // Progress insights removed - analytics section no longer displayed
        
        console.log('✅ Dashboard metrics loaded successfully');
      } else {
        console.error('❌ [DASHBOARD] IPC renderer not available');
      }
    } catch (error) {
      console.error('❌ [DASHBOARD] Error loading dashboard metrics:', error);
    }
  }

  /** First name for welcome banners (supports Cognito `name` or RDS `full_name`). */
  firstNameFromProfile(userProfile) {
    if (!userProfile) return 'User';
    const raw =
      userProfile.first_name ||
      userProfile.name ||
      userProfile.full_name ||
      userProfile.email?.split('@')[0] ||
      'User';
    const first = String(raw).trim().split(/\s+/)[0];
    return first || 'User';
  }

  /** Apply welcome text from renderer auth state (Cognito path — no Supabase profile). */
  syncWelcomeFromAuthManager() {
    try {
      const authUser =
        window.moduleInstances?.authManager?.getCurrentUser?.() ||
        window.moduleInstances?.authManager?.currentUser;
      if (!authUser) return;
      this.updateUserDisplay({
        email: authUser.email,
        full_name: authUser.name || authUser.full_name,
        name: authUser.name,
        role: authUser.role,
      });
    } catch (e) {
      console.warn('[UI-MANAGER] syncWelcomeFromAuthManager failed:', e?.message || e);
    }
  }

  async loadUserProfile() {
    try {
      if (this.ipcRenderer) {
        const response = await this.ipcRenderer.invoke('get-user-profile');
        if (response && response.success && response.profile) {
          this.updateUserDisplay(response.profile);
        }
      }
    } catch (error) {
      console.error('❌ [USER-PROFILE] Error loading user profile:', error);
    }
  }

  updateUserDisplay(userProfile) {
    const firstName = this.firstNameFromProfile(userProfile);
    const displayName =
      userProfile.full_name || userProfile.name || userProfile.email?.split('@')[0] || firstName;
    const initials = displayName
      ? displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
      : userProfile.email?.split('@')[0].substring(0, 2).toUpperCase();
    
    // Update user name in sidebar
    const sidebarName = document.getElementById('userName');
    if (sidebarName) {
      sidebarName.textContent = displayName;
    }
    
    // Update dashboard welcome (if exists)
    const welcomeName = document.getElementById('welcomeUserName');
    if (welcomeName) {
      welcomeName.textContent = firstName;
    }
    
    // Update Time Tracker welcome section
    const trackerWelcomeName = document.getElementById('trackerWelcomeUserName');
    if (trackerWelcomeName) {
      trackerWelcomeName.textContent = firstName;
    }
    
    // Update user initials - dashboard
    const userInitialsElement = document.getElementById('userInitials');
    if (userInitialsElement) {
      userInitialsElement.textContent = initials;
    }
    
    // Update user initials - Time Tracker
    const trackerInitialsElement = document.getElementById('trackerUserInitials');
    if (trackerInitialsElement) {
      trackerInitialsElement.textContent = initials;
    }
    
    // Update user role in sidebar if available
    const userRoleElement = document.getElementById('userRole');
    if (userRoleElement) {
      userRoleElement.textContent = userProfile.role || 'Team Member';
    }
  }

  updateTodayTime(totalSeconds, options = {}) {
    const todayTimeElement = document.getElementById('todayTime');
    const metaEl = document.getElementById('todayTimeMeta');
    const effectiveSeconds =
      typeof options.effectiveSeconds === 'number'
        ? Math.max(0, Math.floor(options.effectiveSeconds))
        : typeof window.toEffectiveSeconds === 'function'
          ? window.toEffectiveSeconds(totalSeconds)
          : Math.max(0, Math.floor(Number(totalSeconds) || 0));
    if (todayTimeElement) {
      todayTimeElement.textContent = this.formatDuration(effectiveSeconds);
    }
    if (metaEl) {
      const tracked = Math.max(0, Math.floor(Number(totalSeconds) || 0));
      const nonEff = Math.max(0, tracked - effectiveSeconds);
      metaEl.textContent =
        nonEff > 0
          ? `Effective · Tracked ${this.formatDuration(tracked)} (−${this.formatDuration(nonEff)} non-effective)`
          : 'Effective working time';
    }
  }

  updateWeeklyTime(totalSeconds) {
    const weeklyTimeElement = document.getElementById('weeklyTime');
    if (weeklyTimeElement) {
      weeklyTimeElement.textContent = this.formatDuration(totalSeconds);
    }
  }

  updateMonthlyTime(totalSeconds) {
    const monthlyTimeElement = document.getElementById('monthlyTime');
    if (monthlyTimeElement) {
      monthlyTimeElement.textContent = this.formatDuration(totalSeconds);
    }
  }

  // updateWeeklyChart function removed - analytics section no longer displayed

  // updateProgressInsights function removed - analytics section no longer displayed

  async loadTimeTrackerContent() {
    console.log('⏱️ [UI-MANAGER] Loading time tracker content...');
    
    try {
      // Get current tracking state to show proper timer display
      if (this.ipcRenderer) {
        const trackingState = await this.ipcRenderer.invoke('get-tracking-state');
        console.log('📊 [TIMETRACKER] Current tracking state:', trackingState);
        
        // Update timer display if tracking is active
        if (trackingState && trackingState.isTracking) {
          this.setTrackingStatus('active');
          
          // Update the timer display (tracker = today's cumulative; uses closed logs + this session)
          const timerElement = document.getElementById('trackerTime');
          if (timerElement && trackingState.sessionStartTime) {
            const startTime = new Date(trackingState.sessionStartTime);
            const elapsed = typeof window.getTodayElapsedSeconds === 'function'
              ? window.getTodayElapsedSeconds(startTime)
              : Math.floor((Date.now() - startTime.getTime()) / 1000);
            const hours = Math.floor(elapsed / 3600);
            const minutes = Math.floor((elapsed % 3600) / 60);
            const seconds = elapsed % 60;
            const sessionStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            try {
              this._todayStatsCacheTime = 0;
              const today = await this._getCachedTodayTimeStats();
              if (typeof window.applyTodayEffectiveStats === 'function') {
                window.applyTodayEffectiveStats(today);
              }
              if (typeof window.applyClosedBaseFromStats === 'function') {
                window.applyClosedBaseFromStats(
                  today?.completedTodayBeforeCurrentSessionSeconds,
                  { live: true },
                );
              } else {
                window.__completedTodayBaseSeconds = Math.max(
                  Math.floor(Number(window.__completedTodayBaseSeconds) || 0),
                  Math.floor(Number(today?.completedTodayBeforeCurrentSessionSeconds) || 0),
                );
              }
              const base = Math.max(0, Math.floor(Number(window.__completedTodayBaseSeconds) || 0));
              const totalSec = base + elapsed;
              if (typeof window.setTrackerDisplaySeconds === 'function') {
                window.setTrackerDisplaySeconds(totalSec);
              }
            } catch {
              // Keep prior effective display; don't flash session-only time into the big clock.
              console.warn('⚠️ [TIMETRACKER] Could not refresh effective clock; keeping current display');
            }
          }
        } else {
          this.setTrackingStatus('stopped');
          try {
            this._todayStatsCacheTime = 0;
            const today = await this._getCachedTodayTimeStats();
            const te = document.getElementById('trackerTime');
            if (te && today && typeof today.totalTime === 'number') {
              if (typeof window.applyTodayEffectiveStats === 'function') {
                window.applyTodayEffectiveStats(today);
              }
              const trackedSec =
                typeof window.resolveStoppedDisplaySeconds === 'function'
                  ? window.resolveStoppedDisplaySeconds(today.totalTime)
                  : Math.max(0, Math.floor(today.totalTime));
              if (typeof window.setTrackerDisplaySeconds === 'function') {
                window.setTrackerDisplaySeconds(trackedSec);
              }
              if (typeof today.completedTodayBeforeCurrentSessionSeconds === 'number') {
                if (typeof window.applyClosedBaseFromStats === 'function') {
                  window.applyClosedBaseFromStats(
                    today.completedTodayBeforeCurrentSessionSeconds,
                    { live: false },
                  );
                } else {
                  window.__completedTodayBaseSeconds = Math.max(
                    Math.floor(Number(window.__completedTodayBaseSeconds) || 0),
                    Math.floor(today.completedTodayBeforeCurrentSessionSeconds),
                  );
                }
              }
            }
          } catch { /* keep default */ }
        }
        
        // Load projects for the dropdowns if not already populated
        const projectSelect = document.getElementById('projectSelect');
        if (!projectSelect || projectSelect.options.length <= 1) {
          await this.loadMainAppProjects();
        }
        
        console.log('✅ [TIMETRACKER] Time tracker content loaded successfully');
      } else {
        console.error('❌ [TIMETRACKER] IPC renderer not available');
      }
    } catch (error) {
      console.error('❌ [TIMETRACKER] Error loading time tracker content:', error);
    }
  }

  async loadUrlActivity() {
    const __t0 = Date.now();
    try { if (window.RendererLogger) { window.RendererLogger.info({ category: 'SCREEN', screen: 'URL History', step: 'DATA LOAD START' }); } } catch {}
    console.log('🌐 Loading URL activity data...');
    try {
      if (this.ipcRenderer) {
        const response = await this.ipcRenderer.invoke('get-url-activity');
        if (response && response.success && response.data && response.data.length > 0) {
          this.updateUrlActivityDisplay(response.data);
          try { if (window.RendererLogger) { window.RendererLogger.info({ category: 'SCREEN', screen: 'URL History', step: 'DATA LOAD END', ctx: { duration_ms: Date.now() - __t0, records: response.data.length } }); } } catch {}
        } else {
          console.log('📭 No URL activity data available');
          this.showNoDataMessage('url-activity', 'No URL activity recorded in the last 24 hours');
          try { if (window.RendererLogger) { window.RendererLogger.info({ category: 'SCREEN', screen: 'URL History', step: 'DATA LOAD END', ctx: { duration_ms: Date.now() - __t0, records: 0 } }); } } catch {}
        }
      }
    } catch (error) {
      console.error('❌ Failed to load URL activity:', error);
      try { if (window.RendererLogger) { window.RendererLogger.error({ category: 'SCREEN', screen: 'URL History', step: 'DATA LOAD ERROR', message: error?.message }); } } catch {}
      this.showErrorMessage('url-activity', 'Failed to load URL activity data');
    }
  }

  async loadAppActivity() {
    const __t0 = Date.now();
    try { if (window.RendererLogger) { window.RendererLogger.info({ category: 'SCREEN', screen: 'App Detection', step: 'DATA LOAD START' }); } } catch {}
    console.log('📱 Loading app activity data...');
    try {
      if (this.ipcRenderer) {
        const response = await this.ipcRenderer.invoke('get-app-activity');
        if (response && response.success && response.data && response.data.length > 0) {
          this.updateAppActivityDisplay(response.data);
          try { if (window.RendererLogger) { window.RendererLogger.info({ category: 'SCREEN', screen: 'App Detection', step: 'DATA LOAD END', ctx: { duration_ms: Date.now() - __t0, records: response.data.length } }); } } catch {}
        } else {
          console.log('📭 No app activity data available');
          this.showNoDataMessage('app-activity', 'No app activity recorded in the last 24 hours');
          try { if (window.RendererLogger) { window.RendererLogger.info({ category: 'SCREEN', screen: 'App Detection', step: 'DATA LOAD END', ctx: { duration_ms: Date.now() - __t0, records: 0 } }); } } catch {}
        }
      }
    } catch (error) {
      console.error('❌ Failed to load app activity:', error);
      try { if (window.RendererLogger) { window.RendererLogger.error({ category: 'SCREEN', screen: 'App Detection', step: 'DATA LOAD ERROR', message: error?.message }); } } catch {}
      this.showErrorMessage('app-activity', 'Failed to load app activity data');
    }
  }

  async loadScreenshotActivity() {
    // In-flight + debounce guard
    if (this.__screenshotActivityLoading) {
      console.log('⏳ [UI-MANAGER] Screenshot activity load in-flight, skipping duplicate');
      return;
    }
    const now = Date.now();
    this.__lastScreenshotActivityLoad = this.__lastScreenshotActivityLoad || 0;
    if (now - this.__lastScreenshotActivityLoad < 500) {
      console.log('🕒 [UI-MANAGER] Screenshot activity load debounced');
      return;
    }
    this.__lastScreenshotActivityLoad = now;
    this.__screenshotActivityLoading = true;
    const __t0 = Date.now();
    console.log('🔍 [UI-MANAGER-DEBUG] loadScreenshotActivity called');
    console.log('🔍 [UI-MANAGER-DEBUG] IPC Renderer available:', !!this.ipcRenderer);
    try { if (window.RendererLogger) { window.RendererLogger.info({ category: 'SCREEN', screen: 'Activity Monitor', step: 'DATA LOAD START' }); } } catch {}
    console.log('📊 [UI-MANAGER] Loading activity monitor feed...');
    try {
      if (!this.ipcRenderer) {
        console.error('❌ [UI-MANAGER] IPC Renderer not available');
        return this.showErrorMessage('activity-between-screenshots', 'IPC not available');
      }

      // Primary source
      console.log('🔍 [UI-MANAGER-DEBUG] Making IPC call to get-screenshot-activity...');
      const response = await this.ipcRenderer.invoke('get-screenshot-activity');
      console.log('📊 [UI-MANAGER-DEBUG] Response received:', response);
      
      if (response && response.success && response.data && response.data.length > 0) {
        console.log('✅ [UI-MANAGER] Got', response.data.length, 'activity snapshots');
        this.updateScreenshotActivityDisplay(response.data);
        try { if (window.RendererLogger) { window.RendererLogger.info({ category: 'SCREEN', screen: 'Activity Monitor', step: 'DATA LOAD END', ctx: { duration_ms: Date.now() - __t0, records: response.data.length } }); } } catch {}
      } else {
        console.log('📭 [UI-MANAGER] No data available');
        this.showNoDataMessage('activity-between-screenshots', 'No activity recorded in the last 24 hours. Start tracking to see data here.');
        try { if (window.RendererLogger) { window.RendererLogger.info({ category: 'SCREEN', screen: 'Activity Monitor', step: 'DATA LOAD END', ctx: { duration_ms: Date.now() - __t0, records: 0 } }); } } catch {}
      }
    } catch (error) {
      console.error('❌ [UI-MANAGER] Error loading screenshot activity:', error);
      try { if (window.RendererLogger) { window.RendererLogger.error({ category: 'SCREEN', screen: 'Activity Monitor', step: 'DATA LOAD ERROR', message: error?.message }); } } catch {}
      this.showErrorMessage('activity-between-screenshots', 'Failed to load activity monitor data');
    } finally {
      this.__screenshotActivityLoading = false;
    }
  }

  updateScreenshotActivityDisplay(activityItems = []) {
    try {
      // DON'T wipe the entire page - only update the recent screenshots list
      const container = document.getElementById('recentScreenshotsList');
      if (!container) {
        console.warn('⚠️ [UI-MANAGER] Recent screenshots list container not found');
        return;
      }

      const total = Array.isArray(activityItems) ? activityItems.length : 0;
      console.log(`📊 [UI-MANAGER] Updating recent screenshots list with ${total} items`);

      if (!total || total === 0) {
        container.innerHTML = '<div class="no-screenshots">No screenshots captured yet</div>';
        return;
      }

      // Only show the 5 most recent screenshots
      const recentItems = activityItems.slice(0, 5);
      
      const html = recentItems.map((it, idx) => {
        const ts = it.captured_at || it.timestamp || it.created_at;
        const timeStr = ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
        const clicks = it.mouse_clicks || it.clicks || 0;
        const keys = it.keystrokes || it.keys || 0;
        const moves = it.mouse_movements || it.moves || 0;
        const activity = it.activity_percent ?? 0;
        const img = it.image_url || it.file_path || '';
        
        return `
          <div class="recent-screenshot-item" style="display:flex;gap:12px;align-items:center;padding:12px;border-bottom:1px solid #e5e7eb;">
            <div style="width:84px;height:52px;background:#f1f5f9;border-radius:6px;overflow:hidden;flex:none;">
              ${img ? `<img src="${img}" alt="Screenshot ${idx+1}" style="width:100%;height:100%;object-fit:contain;background:#f1f5f9;" onerror="this.style.display='none'">` : ''}
            </div>
            <div style="flex:1;">
              <div style="font-size:13px;color:#0f172a;font-weight:500;margin-bottom:4px;">${it.window_title || it.app_name || 'Screenshot'}</div>
              <div style="font-size:11px;color:#64748b;">${timeStr} · Clicks: ${clicks} · Keys: ${keys} · Moves: ${moves} · Activity: ${activity}%</div>
            </div>
          </div>
        `;
      }).join('');

      container.innerHTML = html;
      console.log('✅ [UI-MANAGER] Recent screenshots list updated');
    } catch (e) {
      console.error('❌ [UI-MANAGER] Failed to update recent screenshots list:', e);
    }
  }

  async loadTodayHistory() {
    const __t0 = Date.now();
    try { if (window.RendererLogger) { window.RendererLogger.info({ category: 'SCREEN', screen: "Today's History", step: 'DATA LOAD START' }); } } catch {}
    console.log('📅 [TODAY-HISTORY] Loading today\'s activity history...');
    
    try {
      // Set today's date in the header
      const todayElement = document.getElementById('todayDate');
      if (todayElement) {
        const today = new Date();
        todayElement.textContent = today.toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
      }
      
      // Update last updated timestamp
      this.updateLastUpdatedTime();
      
      // Set up refresh button event listener
      this.setupTodayHistoryEventListeners();
      
      if (!this.ipcRenderer) {
        console.error('❌ [TODAY-HISTORY] IPC Renderer not available');
        return this.showErrorMessage('today-history', 'IPC not available');
      }

      // Load all today's data in parallel
      const [summaryData, screenshotsData, activityData] = await Promise.all([
        this.loadTodayStats(),
        this.loadTodayScreenshots(),
        this.loadTodayActivityLog()
      ]);

      // Update the UI with loaded data
      this.updateTodayStats(summaryData);
      this.updateScreenshotGallery(screenshotsData);
      this.updateActivityTimeline(activityData);
      this.updateActivityLog(activityData);
      
      console.log('✅ [TODAY-HISTORY] Today\'s history loaded successfully');
      try { if (window.RendererLogger) { window.RendererLogger.info({ category: 'SCREEN', screen: "Today's History", step: 'DATA LOAD END', ctx: { duration_ms: Date.now() - __t0 } }); } } catch {}
      
    } catch (error) {
      console.error('❌ [TODAY-HISTORY] Failed to load today\'s history:', error);
      try { if (window.RendererLogger) { window.RendererLogger.error({ category: 'SCREEN', screen: "Today's History", step: 'DATA LOAD ERROR', message: error?.message }); } } catch {}
      this.showErrorMessage('today-history', 'Failed to load today\'s activity data');
    }
  }

  async loadTodayStats() {
    console.log('📊 [TODAY-HISTORY] Loading today\'s stats...');
    try {
      const response = await this.ipcRenderer.invoke('get-today-stats');
      return response?.data || {};
    } catch (error) {
      console.error('❌ [TODAY-HISTORY] Failed to load today\'s stats:', error);
      return {};
    }
  }

  async loadTodayScreenshots() {
    console.log('📸 [TODAY-HISTORY] Loading today\'s screenshots...');
    try {
      const response = await this.ipcRenderer.invoke('get-today-screenshots');
      return response?.data || [];
    } catch (error) {
      console.error('❌ [TODAY-HISTORY] Failed to load today\'s screenshots:', error);
      return [];
    }
  }

  async loadTodayActivityLog() {
    console.log('📝 [TODAY-HISTORY] Loading today\'s activity log...');
    try {
      const response = await this.ipcRenderer.invoke('get-today-activity-log');
      return response?.data || [];
    } catch (error) {
      console.error('❌ [TODAY-HISTORY] Failed to load today\'s activity log:', error);
      return [];
    }
  }

  updateTodayStats(stats) {
    console.log('📊 [TODAY-HISTORY] Updating stats display:', stats);
    
    // Update active time
    const activeTimeEl = document.getElementById('active-time');
    if (activeTimeEl) {
      activeTimeEl.textContent = this.formatDuration(stats.activeTime || 0);
    }
    
    // Update idle time
    const idleTimeEl = document.getElementById('idle-time');
    if (idleTimeEl) {
      idleTimeEl.textContent = this.formatDuration(stats.idleTime || 0);
    }
    
    // Update screenshot count
    const screenshotCountEl = document.getElementById('screenshot-count');
    if (screenshotCountEl) {
      screenshotCountEl.textContent = stats.screenshotCount || 0;
    }
    
    // Update app count
    const appCountEl = document.getElementById('app-count');
    if (appCountEl) {
      appCountEl.textContent = stats.appCount || 0;
    }
    
    // Update total clicks
    const totalClicksEl = document.getElementById('total-clicks');
    if (totalClicksEl) {
      totalClicksEl.textContent = this.formatNumber(stats.totalClicks || 0);
    }
    
    // Update total keystrokes
    const totalKeystrokesEl = document.getElementById('total-keystrokes');
    if (totalKeystrokesEl) {
      totalKeystrokesEl.textContent = this.formatNumber(stats.totalKeystrokes || 0);
    }

    // Update total mouse movements
    const totalMouseMovesEl = document.getElementById('total-mouse-movements');
    if (totalMouseMovesEl) {
      totalMouseMovesEl.textContent = this.formatNumber(stats.totalMouseMovements || 0);
    }

    // Update URL count
    const urlCountEl = document.getElementById('url-count');
    if (urlCountEl) {
      urlCountEl.textContent = this.formatNumber(stats.urlCount || 0);
    }
  }

  updateScreenshotGallery(screenshots) {
    console.log('🖼️ [TODAY-HISTORY] Updating screenshot gallery:', screenshots.length, 'screenshots');
    
    const galleryEl = document.getElementById('screenshot-gallery');
    if (!galleryEl) return;
    
    // Clear loading state
    galleryEl.innerHTML = '';
    
    if (!screenshots || screenshots.length === 0) {
      galleryEl.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #64748b;">
          <i data-lucide="camera-off" style="width: 48px; height: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
          <p>No screenshots captured today</p>
          <p style="font-size: 14px; margin-top: 8px;">Start tracking to capture screenshots</p>
        </div>
      `;
      return;
    }
    
    // PERF FIX: Render screenshots in batches of 10 using requestAnimationFrame
    // to avoid blocking the main thread when rendering 50+ screenshots at once.
    // Also adds loading="lazy" to images to defer offscreen image loading.
    const BATCH_SIZE = 10;
    const renderBatch = (startIndex) => {
      const endIndex = Math.min(startIndex + BATCH_SIZE, screenshots.length);
      const fragment = document.createDocumentFragment();
      
      for (let i = startIndex; i < endIndex; i++) {
        const screenshot = screenshots[i];
        const screenshotEl = document.createElement('div');
        screenshotEl.className = 'screenshot-thumbnail';
        screenshotEl.style.cssText = `
          background: white;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          padding: 12px;
          cursor: pointer;
          transition: all 0.2s;
        `;
        
        const timestamp = new Date(screenshot.captured_at);
        const activityPercent = screenshot.activity_percent || 0;
        const imageUrl = screenshot.image_url || screenshot.file_path || '';
        
        screenshotEl.innerHTML = `
          <div style="position: relative; aspect-ratio: 32/10; background: #f8fafc; border-radius: 6px; margin-bottom: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
            <img src="${imageUrl}" loading="lazy" alt="Screenshot ${timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}" style="width: 100%; height: 100%; object-fit: contain; display: block; background: #f1f5f9;" onerror="this.onerror=null; this.src='/placeholder-screenshot.png';" />
            <div style="position: absolute; top: 8px; right: 8px; font-size: 11px; background: white; color: #0f172a; border: 1px solid #e2e8f0; border-radius: 999px; padding: 2px 6px;">${activityPercent}%</div>
          </div>
          <div style="font-size: 12px; color: #374151; font-weight: 600; margin-bottom: 4px;">
            ${timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div style="font-size: 11px; color: #64748b; margin-bottom: 6px;">
            ${screenshot.app_name || 'Unknown App'}
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 11px; color: #64748b;">Activity:</span>
            <span style="font-size: 11px; font-weight: 600; color: ${activityPercent > 50 ? '#10b981' : activityPercent > 20 ? '#f59e0b' : '#ef4444'};">
              ${activityPercent}%
            </span>
          </div>
        `;
        
        screenshotEl.addEventListener('click', () => {
          this.showScreenshotModal(screenshot);
        });
        
        fragment.appendChild(screenshotEl);
      }
      
      galleryEl.appendChild(fragment);
      
      // Schedule next batch if there are more screenshots
      if (endIndex < screenshots.length) {
        requestAnimationFrame(() => renderBatch(endIndex));
      } else {
        // All batches done - re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
          lucide.createIcons();
        }
      }
    };
    
    // Start rendering first batch
    renderBatch(0);
  }

  updateActivityTimeline(activities) {
    console.log('📈 [TODAY-HISTORY] Updating activity timeline');

    const timelineEl = document.getElementById('activity-timeline');
    if (!timelineEl) return;

    // Clear loading state
    const loadingEl = document.getElementById('timelineLoading');
    if (loadingEl) loadingEl.style.display = 'none';

    // Defensive defaults
    const events = Array.isArray(activities) ? activities : [];

    // Build 24h bins (15-minute segments → 96 bins)
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const segmentMinutes = 15;
    const totalSegments = Math.floor((24 * 60) / segmentMinutes); // 96

    const segments = new Array(totalSegments).fill(null).map((_, index) => {
      const segmentStart = new Date(dayStart.getTime() + index * segmentMinutes * 60 * 1000);
      const segmentEnd = new Date(segmentStart.getTime() + segmentMinutes * 60 * 1000);
      return { index, start: segmentStart, end: segmentEnd, count: 0 };
    });

    // Count events per segment
    for (const evt of events) {
      const ts = new Date(evt.timestamp || evt.captured_at || evt.started_at || evt.time || evt.created_at);
      if (Number.isNaN(ts.getTime())) continue;
      if (ts < dayStart) continue;
      const minutesSinceStart = Math.floor((ts.getTime() - dayStart.getTime()) / (60 * 1000));
      const segIdx = Math.min(Math.floor(minutesSinceStart / segmentMinutes), totalSegments - 1);
      if (segIdx >= 0 && segIdx < totalSegments) segments[segIdx].count += 1;
    }

    // Determine thresholds for coloring
    const counts = segments.map(s => s.count);
    const maxCount = Math.max(0, ...counts);
    const midThreshold = Math.max(1, Math.ceil(maxCount * 0.33));
    const highThreshold = Math.max(2, Math.ceil(maxCount * 0.66));

    // Colors
    const COLOR_IDLE = '#e2e8f0'; // gray-300
    const COLOR_MED = '#f59e0b';  // amber-500
    const COLOR_HIGH = '#10b981'; // emerald-500

    // Compute active minutes summary
    const activeSegments = segments.filter(s => s.count > 0).length;
    const activeMinutes = activeSegments * segmentMinutes;

    // Render segments flexibly
    const segWidth = (100 / totalSegments).toFixed(4) + '%';
    const segmentsHtml = segments.map(s => {
      const color = s.count === 0 ? COLOR_IDLE : (s.count >= highThreshold ? COLOR_HIGH : COLOR_MED);
      const title = `${s.start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${s.end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}\nEvents: ${s.count}`;
      return `<div title="${title}" style="width:${segWidth};height:100%;background:${color};"></div>`;
    }).join('');

    // Add a compact legend inside the bar area for clarity
    timelineEl.innerHTML = `
      <div style="height: 100%; border-radius: 6px; overflow: hidden; border: 1px solid #e2e8f0;">
        <div style="display:flex; height: 70%; width: 100%;">${segmentsHtml}</div>
        <div style="display:flex; gap: 12px; align-items:center; padding: 6px 8px; height: 30%; background:#f8fafc; border-top: 1px solid #e2e8f0; font-size: 11px; color:#475569;">
          <span style="display:flex; align-items:center; gap:6px;"><span style="width:10px;height:10px;background:${COLOR_IDLE};border:1px solid #cbd5e1;border-radius:2px;"></span>Idle</span>
          <span style="display:flex; align-items:center; gap:6px;"><span style="width:10px;height:10px;background:${COLOR_MED};border-radius:2px;"></span>Active</span>
          <span style="display:flex; align-items:center; gap:6px;"><span style="width:10px;height:10px;background:${COLOR_HIGH};border-radius:2px;"></span>High</span>
          <span style="margin-left:auto;">Active today: ${this.formatDuration(activeMinutes * 60)}</span>
        </div>
      </div>
    `;
  }

  updateActivityLog(activities) {
    console.log('📝 [TODAY-HISTORY] Updating activity log with', activities?.length || 0, 'activities');
    
    const logBodyEl = document.getElementById('activity-log-body');
    if (!logBodyEl) return;
    
    // Clear loading state
    logBodyEl.innerHTML = '';
    
    if (!activities || activities.length === 0) {
      logBodyEl.innerHTML = `
        <tr>
          <td colspan="4" style="padding: 40px; text-align: center; color: #64748b;">
            <i data-lucide="clock" style="width: 20px; height: 20px; margin-right: 8px; opacity: 0.5;"></i>
            No activity recorded today
          </td>
        </tr>
      `;
      return;
    }
    
    // Sort activities by timestamp (most recent first) and take last 20
    const sortedActivities = [...activities].sort((a, b) => {
      // Handle multiple timestamp field names
      const aTime = new Date(a.timestamp || a.captured_at || a.started_at || a.created_at || 0);
      const bTime = new Date(b.timestamp || b.captured_at || b.started_at || b.created_at || 0);
      return bTime - aTime;
    });
    
    const recentActivities = sortedActivities.slice(0, 20);
    
    recentActivities.forEach(activity => {
      const row = document.createElement('tr');
      row.style.borderBottom = '1px solid #f1f5f9';
      
      // Handle multiple timestamp field names with fallback
      const timestampValue = activity.timestamp || activity.captured_at || activity.started_at || activity.created_at;
      let timeDisplay = 'Unknown time';
      
      if (timestampValue) {
        const timestamp = new Date(timestampValue);
        if (!isNaN(timestamp.getTime())) {
          timeDisplay = timestamp.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
          });
        }
      }
      
      const statusColor = activity.synced ? '#10b981' : activity.failed ? '#ef4444' : '#f59e0b';
      const statusIcon = activity.synced ? '✓' : activity.failed ? '❌' : '⏳';
      
      row.innerHTML = `
        <td style="padding: 12px; font-size: 12px; color: #64748b;">
          ${timeDisplay}
        </td>
        <td style="padding: 12px; font-size: 13px; color: #374151; font-weight: 500;">
          ${activity.type || 'Unknown'}
        </td>
        <td style="padding: 12px; font-size: 13px; color: #64748b;">
          ${activity.details || activity.description || 'Activity recorded'}
        </td>
        <td style="padding: 12px; text-align: center;">
          <span style="color: ${statusColor}; font-size: 16px;" title="${activity.synced ? 'Synced' : activity.failed ? 'Failed' : 'Pending'}">
            ${statusIcon}
          </span>
        </td>
      `;
      
      logBodyEl.appendChild(row);
    });
    
    // Re-initialize Lucide icons
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  showScreenshotModal(screenshot) {
    console.log('🖼️ [TODAY-HISTORY] Showing screenshot modal:', screenshot);
    // TODO: Implement screenshot modal
    alert(`Screenshot from ${new Date(screenshot.captured_at).toLocaleString()}\nApp: ${screenshot.app_name}\nActivity: ${screenshot.activity_percent}%`);
  }

  setupTodayHistoryEventListeners() {
    const refreshBtn = document.getElementById('refreshHistoryBtn');
    if (refreshBtn) {
      // Remove existing listener to prevent duplicates
      refreshBtn.replaceWith(refreshBtn.cloneNode(true));
      const newRefreshBtn = document.getElementById('refreshHistoryBtn');
      
      newRefreshBtn.addEventListener('click', () => {
        console.log('🔄 [TODAY-HISTORY] Refresh button clicked');
        this.loadTodayHistory();
      });
      
      console.log('✅ [TODAY-HISTORY] Event listeners set up');
    }
  }

  updateLastUpdatedTime() {
    const lastUpdatedEl = document.getElementById('lastUpdatedHistory');
    if (lastUpdatedEl) {
      const now = new Date();
      lastUpdatedEl.textContent = `Last updated: ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    }
  }

  formatDuration(seconds) {
    if (!seconds || seconds < 0) return '0h 0m';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  formatNumber(number) {
    if (!number || number < 0) return '0';
    
    if (number >= 1000000) {
      return (number / 1000000).toFixed(1) + 'M';
    }
    if (number >= 1000) {
      return (number / 1000).toFixed(1) + 'K';
    }
    return number.toString();
  }

  updateUrlActivityDisplay(urlData) {
    console.log('🔄 Updating URL activity display with', urlData.length, 'entries');
    
    const detectionList = document.getElementById('urlDetectionList');
    if (detectionList && urlData && urlData.length > 0) {
      detectionList.innerHTML = urlData.map(url => `
        <div class="detection-item">
          <div class="detection-time">${new Date(url.started_at || url.timestamp).toLocaleTimeString()}</div>
          <div class="detection-details">
            <div class="detection-main">${url.site_url || url.url}</div>
            <div class="detection-meta">
              ${url.browser || 'Unknown Browser'}
              ${url.title ? ` • ${url.title}` : ''}
              ${url.users ? ` • ${url.users.full_name || url.users.email}` : ''}
              <span class="status-badge saved">SAVED</span>
            </div>
          </div>
        </div>
      `).join('');

      // Update stats
      const uniqueDomains = new Set(urlData.map(url => {
        try {
          return url.domain || new URL(url.site_url || url.url).hostname;
        } catch {
          return url.domain || 'Unknown';
        }
      })).size;
      const uniqueBrowsers = new Set(urlData.map(url => url.browser).filter(Boolean)).size;
      
      document.getElementById('urlsToday').textContent = urlData.length;
      document.getElementById('domainsToday').textContent = uniqueDomains;
      document.getElementById('browsersUsed').textContent = uniqueBrowsers;
      
      // Also update today's stats if available
      this.updateTodayUrlStats(urlData);
    }
  }

  updateTodayUrlStats(urlData) {
    console.log('📊 Updating today\'s URL statistics...');
    try {
      // Calculate today's unique URLs, domains, and browsers
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      
      // Filter URLs for today only
      const todayUrls = urlData.filter(url => {
        const urlDate = new Date(url.started_at || url.timestamp);
        return urlDate >= todayStart;
      });
      
      const uniqueUrls = new Set(todayUrls.map(url => url.site_url || url.url)).size;
      const uniqueDomains = new Set(todayUrls.map(url => {
        try {
          return url.domain || new URL(url.site_url || url.url).hostname;
        } catch {
          return url.domain || 'Unknown';
        }
      })).size;
      const uniqueBrowsers = new Set(todayUrls.map(url => url.browser).filter(Boolean)).size;
      
      // Update the statistics cards in both live and history views
      const updateStats = (prefix = '') => {
        const urlsElement = document.getElementById(prefix + 'urlsToday');
        const domainsElement = document.getElementById(prefix + 'domainsToday');
        const browsersElement = document.getElementById(prefix + 'browsersUsed');
        
        if (urlsElement) urlsElement.textContent = uniqueUrls;
        if (domainsElement) domainsElement.textContent = uniqueDomains;
        if (browsersElement) browsersElement.textContent = uniqueBrowsers;
      };
      
      updateStats(); // Update main stats
      updateStats('history'); // Update history stats if they exist
      
      console.log(`📊 Today's URL stats updated: ${uniqueUrls} URLs, ${uniqueDomains} domains, ${uniqueBrowsers} browsers`);
    } catch (error) {
      console.error('❌ Failed to update today\'s URL stats:', error);
    }
  }

  updateAppActivityDisplay(appData) {
    console.log('🔄 Updating app activity display with', appData.length, 'entries');
    
    const detectionList = document.getElementById('appDetectionList');
    if (detectionList && appData && appData.length > 0) {
      detectionList.innerHTML = appData.map(app => {
        const tsMs = app && app.detected_at != null ? Number(app.detected_at) : Date.parse(app?.timestamp || 0);
        const timeString = new Date(tsMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        const fullTime = new Date(tsMs).toLocaleTimeString();
        return `
        <div class="detection-item">
          <div class="detection-time" title="${fullTime}">${timeString}</div>
          <div class="detection-details">
            <div class="detection-main">${app.app_name}</div>
            <div class="detection-meta">
              ${app.window_title ? app.window_title : 'No window title'}
            </div>
          </div>
        </div>
      `}).join('');

      // Update stats
      const uniqueApps = new Set(appData.map(app => app.app_name)).size;
      document.getElementById('appsToday').textContent = uniqueApps;
      document.getElementById('switchCount').textContent = appData.length;
    }
  }



  showNoDataMessage(pageId, message) {
    let targetElement;
    if (pageId === 'url-activity') {
      targetElement = document.getElementById('urlDetectionList');
    } else if (pageId === 'app-activity') {
      targetElement = document.getElementById('appDetectionList');
    } else if (pageId === 'activity-between-screenshots') {
      // Only show the message inside the recent screenshots list area so we don't wipe live counters
      targetElement = document.getElementById('recentScreenshotsList');
    }

    if (targetElement) {
      targetElement.innerHTML = `
        <div class="no-data-message">
          <div class="no-data-icon">📭</div>
          <h3>No Data Available</h3>
          <p>${message}</p>
          <p>Start tracking to see activity data here.</p>
        </div>
      `;
    }
  }

  showErrorMessage(pageId, message) {
    let targetElement;
    if (pageId === 'url-activity') {
      targetElement = document.getElementById('urlDetectionList');
    } else if (pageId === 'app-activity') {
      targetElement = document.getElementById('appDetectionList');
    } else if (pageId === 'activity-between-screenshots') {
      // Only affect recent screenshots list section
      targetElement = document.getElementById('recentScreenshotsList');
    }

    if (targetElement) {
      targetElement.innerHTML = `
        <div class="error-message">
          <div class="error-icon">❌</div>
          <h3>Error Loading Data</h3>
          <p>${message}</p>
          <button onclick="location.reload()" class="retry-button">Retry</button>
        </div>
      `;
    }
  }





  showLogin() {
    if (window.__updateGateActive) {
      console.log('🛑 [UI-MANAGER] Login blocked — mandatory update gate active');
      return;
    }
    // Use correct element IDs matching index.html (loginContainer / appContainer)
    const loginContainer = document.getElementById('loginContainer');
    const appContainer = document.getElementById('appContainer');
    
    if (loginContainer) {
      loginContainer.style.display = 'flex';
    }
    
    if (appContainer) {
      appContainer.style.display = 'none';
    }
    
    // Also hide the startup overlay so the login form is visible
    try {
      const overlay = document.getElementById('startupOverlay');
      if (overlay) overlay.style.display = 'none';
    } catch (_) {}
    
    console.log('🔐 Showing login screen');
  }

  showOnboardingGuide() {
    console.log('🎯 [UI-MANAGER] Starting onboarding guide...');
    console.log('🎯 [UI-MANAGER] Current moduleInstances:', typeof moduleInstances);
    console.log('🎯 [UI-MANAGER] Document ready state:', document.readyState);
    
    // Create onboarding overlay
    const overlay = document.createElement('div');
    overlay.className = 'onboarding-overlay';
    overlay.innerHTML = `
      <div class="onboarding-modal">
        <div class="onboarding-header">
          <div class="onboarding-logo">
            <div class="logo-icon">⏱️</div>
            <h2>Welcome to TimeFlow</h2>
          </div>
          <div class="onboarding-step">Step 1 of 3</div>
        </div>
        
        <div class="onboarding-content">
          <div class="onboarding-step-content active" data-step="1">
            <div class="step-icon">🔒</div>
            <h3>Grant Required Permissions</h3>
            <p>TimeFlow needs Screen Recording and Accessibility permissions to track your activity and take screenshots for productivity monitoring.</p>
            <div class="permission-list">
              <div class="permission-item">
                <span class="permission-icon">📸</span>
                <span>Screen Recording - for automatic screenshots</span>
                <span class="permission-status" id="screen-status">❌</span>
              </div>
              <div class="permission-item">
                <span class="permission-icon">⌨️</span>
                <span>Accessibility - for activity tracking</span>
                <span class="permission-status" id="accessibility-status">❌</span>
              </div>
            </div>
            <button class="onboarding-btn primary" onclick="moduleInstances.uiManager.requestPermissions()">Grant Permissions</button>
          </div>
          
          <div class="onboarding-step-content" data-step="2">
            <div class="step-icon">📋</div>
            <h3>Select Your Project</h3>
            <p>Choose which project you'll be working on. You can change this anytime during your work session.</p>
            <div class="project-selector">
              <select id="onboarding-project-select" class="project-dropdown">
                <option value="">Loading projects...</option>
              </select>
            </div>
            <button class="onboarding-btn primary" onclick="moduleInstances.uiManager.nextStep(3)">Continue</button>
          </div>
          
          <div class="onboarding-step-content" data-step="3">
            <div class="step-icon">🚀</div>
            <h3>Ready to Start!</h3>
            <p>Everything is set up! Click "Start Tracking" to begin monitoring your time and productivity.</p>
            <div class="feature-preview">
              <div class="feature-item">
                <span class="feature-icon">📊</span>
                <span>Activity monitoring</span>
              </div>
              <div class="feature-item">
                <span class="feature-icon">📸</span>
                <span>Periodic screenshots</span>
              </div>
              <div class="feature-item">
                <span class="feature-icon">📱</span>
                <span>Application tracking</span>
              </div>
            </div>
            <button class="onboarding-btn success" onclick="moduleInstances.uiManager.startTracking()">Start Tracking</button>
          </div>
        </div>
        
        <div class="onboarding-footer">
          <button class="onboarding-btn secondary" onclick="moduleInstances.uiManager.closeOnboarding()">Skip Setup</button>
          <div class="onboarding-dots">
            <span class="dot active" data-step="1"></span>
            <span class="dot" data-step="2"></span>
            <span class="dot" data-step="3"></span>
          </div>
        </div>
      </div>
    `;
    
    // Add improved CSS styling
    const style = document.createElement('style');
    style.textContent = `
      .onboarding-overlay {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        background: rgba(0, 0, 0, 0.7) !important;
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
        z-index: 10000 !important;
      }
      .onboarding-modal {
        background: white !important;
        border-radius: 12px !important;
        padding: 20px !important;
        max-width: 420px !important;
        width: 85% !important;
        max-height: 70vh !important;
        overflow-y: auto !important;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3) !important;
        transform: scale(0.95) !important;
      }
      .onboarding-header {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        margin-bottom: 20px !important;
        border-bottom: 1px solid #eee !important;
        padding-bottom: 16px !important;
      }
      .onboarding-logo {
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
      }
      .logo-icon {
        font-size: 24px !important;
      }
      .onboarding-logo h2 {
        margin: 0 !important;
        color: #333 !important;
        font-size: 20px !important;
      }
      .onboarding-step {
        color: #666 !important;
        font-size: 14px !important;
      }
      .onboarding-content {
        margin-bottom: 20px !important;
      }
      .onboarding-step-content {
        display: none !important;
        text-align: center !important;
      }
      .onboarding-step-content.active {
        display: block !important;
      }
      .step-icon {
        font-size: 36px !important;
        margin-bottom: 12px !important;
      }
      .onboarding-step-content h3 {
        margin: 0 0 12px 0 !important;
        color: #333 !important;
        font-size: 18px !important;
      }
      .onboarding-step-content p {
        margin: 0 0 20px 0 !important;
        color: #666 !important;
        line-height: 1.5 !important;
      }
      .permission-list {
        margin: 20px 0 !important;
      }
      .permission-item {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        padding: 10px 14px !important;
        margin: 6px 0 !important;
        background: #f8f9fa !important;
        border-radius: 6px !important;
        font-size: 14px !important;
      }
      .permission-icon {
        margin-right: 8px !important;
      }
      .permission-status {
        font-size: 18px !important;
      }
      .onboarding-btn {
        padding: 12px 24px !important;
        border: none !important;
        border-radius: 8px !important;
        font-size: 14px !important;
        cursor: pointer !important;
        transition: all 0.2s !important;
      }
      .onboarding-btn.primary {
        background: #007bff !important;
        color: white !important;
      }
      .onboarding-btn.primary:hover {
        background: #0056b3 !important;
      }
      .onboarding-btn.success {
        background: #28a745 !important;
        color: white !important;
      }
      .onboarding-btn.secondary {
        background: #6c757d !important;
        color: white !important;
      }
      .onboarding-footer {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        border-top: 1px solid #eee !important;
        padding-top: 16px !important;
      }
      .onboarding-dots {
        display: flex !important;
        gap: 8px !important;
      }
      .dot {
        width: 8px !important;
        height: 8px !important;
        border-radius: 50% !important;
        background: #ddd !important;
        cursor: pointer !important;
      }
      .dot.active {
        background: #007bff !important;
      }
      #onboarding-project-select {
        width: 100% !important;
        padding: 10px !important;
        border: 1px solid #ddd !important;
        border-radius: 6px !important;
        margin: 12px 0 !important;
      }
      .feature-list {
        text-align: left !important;
        margin: 20px 0 !important;
      }
      .feature-item {
        display: flex !important;
        align-items: center !important;
        margin: 8px 0 !important;
        color: #666 !important;
      }
      .feature-icon {
        margin-right: 8px !important;
      }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(overlay);
    console.log('🎯 [UI-MANAGER] Onboarding overlay added to DOM with improved styling');
    
    // Initialize step management
    this.currentStep = 1;
    this.showStep(1);
    console.log('🎯 [UI-MANAGER] Showing step 1 of onboarding');
    
    // Check permissions immediately and start periodic checks
    setTimeout(() => {
      // Check immediately
      this.checkPermissionStatus();
      console.log('🎯 [UI-MANAGER] Started permission status checking');
      
      // Keep checking every second until both permissions are granted
      this.permissionCheckInterval = setInterval(() => {
        this.checkPermissionStatus();
      }, 1000);
      
      // Also check if we should skip onboarding entirely
      const { ipcRenderer } = require('electron');
      ipcRenderer.invoke('check-permissions').then(permissions => {
        if (permissions.screen && permissions.accessibility) {
          console.log('✅ [UI-MANAGER] All permissions already granted, closing onboarding');
          // Close onboarding and show main app
          this.closeOnboarding();
          this.showMainApp();
        }
      }).catch(err => {
        console.error('Failed to check initial permissions:', err);
      });
    }, 200);
  }

  showStep(step) {
    // Hide all steps
    for (let i = 1; i <= 3; i++) {
      const stepElement = document.getElementById(`step-${i}`);
      if (stepElement) {
        stepElement.style.display = 'none';
      }
    }
    
    // Show current step
    const currentStepElement = document.getElementById(`step-${step}`);
    if (currentStepElement) {
      currentStepElement.style.display = 'block';
    }
    
    // Update dots
    document.querySelectorAll('.dot').forEach((dot, index) => {
      dot.classList.toggle('active', index + 1 === step);
    });
    
    console.log(`🎯 [UI-MANAGER] Switched to step ${step}`);
  }

  nextStep(step) {
    console.log(`🎯 [UI-MANAGER] Moving to step ${step}...`);
    
    // Update internal state
    this.currentStep = step;
    
    // Update DOM - Hide current active step
    const currentActive = document.querySelector('.onboarding-step-content.active');
    if (currentActive) {
      currentActive.classList.remove('active');
    }
    
    // Show target step
    const targetStep = document.querySelector(`[data-step="${step}"]`);
    if (targetStep) {
      targetStep.classList.add('active');
    }
    
    // Update progress dots
    document.querySelectorAll('.dot').forEach(dot => dot.classList.remove('active'));
    const targetDot = document.querySelector(`[data-step="${step}"].dot`);
    if (targetDot) {
      targetDot.classList.add('active');
    }
    
    // Update step counter
    const stepCounter = document.querySelector('.onboarding-step');
    if (stepCounter) {
      stepCounter.textContent = `Step ${step} of 3`;
    }
    
    // Call showStep for backward compatibility
    this.showStep(step);
    
    // Load projects for step 2
    if (step === 2) {
      console.log('🎯 [UI-MANAGER] Loading projects for step 2...');
      this.loadProjects();
    }
    
    console.log(`✅ [UI-MANAGER] Successfully moved to step ${step}`);
  }

  checkPermissionStatus() {
    // Check permissions and update UI
    const { ipcRenderer } = require('electron');
    console.log('🔧 [UI-MANAGER] Checking permission status...');
    
    // Get DOM elements first
    const screenStatus = document.getElementById('screen-status');
    const accessibilityStatus = document.getElementById('accessibility-status');
    
    console.log('🔧 [UI-MANAGER] DOM elements found:', {
      screenStatus: !!screenStatus,
      accessibilityStatus: !!accessibilityStatus
    });
    
    ipcRenderer.invoke('check-permissions').then(permissions => {
      console.log('🔧 [UI-MANAGER] Received permissions:', permissions);
      
      if (screenStatus) {
        screenStatus.textContent = permissions.screen ? '✅' : '❌';
        console.log('🔧 [UI-MANAGER] Screen permission UI updated:', permissions.screen ? 'GRANTED ✅' : 'DENIED ❌');
      } else {
        console.warn('⚠️ [UI-MANAGER] Screen status element not found!');
      }
      
      if (accessibilityStatus) {
        accessibilityStatus.textContent = permissions.accessibility ? '✅' : '❌';
        console.log('🔧 [UI-MANAGER] Accessibility permission UI updated:', permissions.accessibility ? 'GRANTED ✅' : 'DENIED ❌');
      } else {
        console.warn('⚠️ [UI-MANAGER] Accessibility status element not found!');
      }
      
      // Auto-advance if both permissions are granted and we're still on step 1
      if (permissions.screen && permissions.accessibility) {
        console.log('🎉 [UI-MANAGER] Both permissions granted, advancing to step 2 in 1.5 seconds');
        
        // Clear the permission check interval
        if (this.permissionCheckInterval) {
          clearInterval(this.permissionCheckInterval);
          this.permissionCheckInterval = null;
        }
        
        if (this.currentStep === 1) {
          setTimeout(() => this.nextStep(2), 1500);
        } else {
          console.log('🎯 [UI-MANAGER] Already past step 1, skipping auto-advance');
        }
      } else {
        console.log('⚠️ [UI-MANAGER] Permissions missing - Screen:', permissions.screen, 'Accessibility:', permissions.accessibility);
      }
    }).catch(error => {
      console.error('❌ [UI-MANAGER] Failed to check permissions:', error);
      // Fallback: assume granted since backend logs show they are
      this.forceUpdatePermissionUI(true, true);
    });
  }
  
  forceUpdatePermissionUI(screenGranted, accessibilityGranted) {
    console.log('🔧 [UI-MANAGER] Force updating permission UI...');
    const screenStatus = document.getElementById('screen-status');
    const accessibilityStatus = document.getElementById('accessibility-status');
    
    if (screenStatus) {
      screenStatus.textContent = screenGranted ? '✅' : '❌';
      console.log('🔧 [UI-MANAGER] FORCE: Screen permission set to', screenGranted ? '✅' : '❌');
    }
    
    if (accessibilityStatus) {
      accessibilityStatus.textContent = accessibilityGranted ? '✅' : '❌';
      console.log('🔧 [UI-MANAGER] FORCE: Accessibility permission set to', accessibilityGranted ? '✅' : '❌');
    }
    
    // Auto-advance if both permissions are granted
    if (screenGranted && accessibilityGranted) {
      console.log('🎉 [UI-MANAGER] FORCE: Both permissions granted, advancing to step 2');
      setTimeout(() => this.nextStep(2), 1500);
    }
  }

  requestPermissions() {
    const { ipcRenderer } = require('electron');
    console.log('🔧 [UI-MANAGER] Requesting permissions via IPC...');
    
    // Only proceed if we're on step 1
    if (this.currentStep !== 1) {
      console.log('🎯 [UI-MANAGER] Not on step 1, skipping permission request');
      return;
    }
    
    // Force immediate UI update first
    this.checkPermissionStatus();
    
    ipcRenderer.invoke('request-permissions').then((result) => {
      console.log('🔧 [UI-MANAGER] Permission request result:', result);
      
      // Multiple checks to ensure UI gets updated (only if still on step 1)
      if (this.currentStep === 1) {
        setTimeout(() => this.checkPermissionStatus(), 500);
        setTimeout(() => this.checkPermissionStatus(), 1500);
        setTimeout(() => this.checkPermissionStatus(), 3000);
      }
      
    }).catch(error => {
      console.error('❌ [UI-MANAGER] Failed to request permissions:', error);
      // Still check status even if request failed (only if still on step 1)
      if (this.currentStep === 1) {
        setTimeout(() => this.checkPermissionStatus(), 1000);
      }
    });
  }

  // REMOVED: Duplicate nextStep method that was causing infinite loop
  // The real nextStep method is defined earlier in the file

  startTracking() {
    const projectId = document.getElementById('onboarding-project-select').value;
    if (projectId) {
      const { ipcRenderer } = require('electron');
      
      // Mark onboarding as completed first
      ipcRenderer.invoke('complete-onboarding').then(() => {
        console.log('🎯 [UI-MANAGER] Onboarding marked as completed');
        
        // Now start tracking
        ipcRenderer.invoke('start-timer', projectId).then(result => {
          if (result.success) {
            console.log('✅ [UI-MANAGER] Tracking started successfully');
            this.closeOnboarding();
          } else {
            console.error('❌ [UI-MANAGER] Failed to start tracking:', result.error);
            alert(result.error || 'Failed to start tracking');
          }
        });
      });
    } else {
      alert('Please select a project first');
    }
  }

  closeOnboarding() {
    const overlay = document.querySelector('.onboarding-overlay');
    if (overlay) {
      overlay.remove();
      console.log('🎯 [UI-MANAGER] Onboarding overlay closed');
    }
    
    // Clear permission check interval if exists
    if (this.permissionCheckInterval) {
      clearInterval(this.permissionCheckInterval);
      this.permissionCheckInterval = null;
    }
    
    // Mark onboarding as completed
    const { ipcRenderer } = require('electron');
    ipcRenderer.invoke('complete-onboarding').catch(err => {
      console.error('Failed to mark onboarding complete:', err);
    });
  }

  loadProjects() {
    // Load user projects for selection (onboarding)
    const { ipcRenderer } = require('electron');
    console.log('🔧 [UI-MANAGER] Loading user projects for onboarding...');
    ipcRenderer.invoke('get-user-projects').then(projects => {
      console.log('🔧 [UI-MANAGER] Received projects:', projects);
      const select = document.getElementById('onboarding-project-select');
      if (select) {
        if (projects && projects.length > 0) {
          select.innerHTML = '<option value="">Select a project...</option>';
          projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = project.name;
            select.appendChild(option);
          });
          console.log(`🎯 [UI-MANAGER] Loaded ${projects.length} projects successfully`);
        } else {
          select.innerHTML = '<option value="">No projects found</option>';
          console.log('⚠️ [UI-MANAGER] No projects found for user');
        }
      } else {
        console.error('❌ [UI-MANAGER] Project select element not found');
      }
    }).catch(error => {
      console.error('❌ [UI-MANAGER] Failed to load projects:', error);
      const select = document.getElementById('onboarding-project-select');
      if (select) {
        select.innerHTML = '<option value="">Error loading projects</option>';
      }
    });
  }

  async loadMainAppProjects() {
    // Load user projects for main app dropdowns using database query
    console.log('🔧 [UI-MANAGER] Loading projects for main app...');
    
    try {
      // Get current user from localStorage
      const savedUser = localStorage.getItem('alyson_user');
      if (!savedUser) {
        console.log('⚠️ [UI-MANAGER] No saved user found');
        return;
      }
      
      const currentUser = JSON.parse(savedUser);
      console.log('👤 [UI-MANAGER] Current user:', currentUser.id);
      
      // Use IPC to get Supabase instance and query projects
      const projectData = await this.ipcRenderer.invoke('get-user-project-assignments', currentUser.id);
      console.log('📋 [UI-MANAGER] Received project assignments:', projectData);
      
      const projectSelect = document.getElementById('projectSelect');
      const dashboardProjectSelect = document.getElementById('dashboardProjectSelect');
      const previousProjectId = projectSelect?.value || '';
      
      // Clear existing options for both dropdowns
      if (projectSelect) {
        projectSelect.innerHTML = '<option value="">Choose a project to track time...</option>';
      }
      if (dashboardProjectSelect) {
        dashboardProjectSelect.innerHTML = '<option value="">Choose a project to track time...</option>';
      }
      
      if (!projectData || projectData.length === 0) {
        let emptyMessage = 'No projects assigned — ask your admin';
        try {
          const appConfig = await this.ipcRenderer.invoke('get-config');
          const backendReady = !!(appConfig?.backend_api_url && appConfig?.backend_api_key);
          if (appConfig?.auth_provider === 'cognito' && !backendReady) {
            emptyMessage =
              'App build missing API config — rebuild with generate-env-config.js --build';
            console.warn('⚠️ [UI-MANAGER] Cognito mode but backend API keys not embedded in this build');
          }
        } catch (_) {}

        const noProjectsOption = `<option value="" disabled>${emptyMessage}</option>`;
        if (projectSelect) projectSelect.innerHTML += noProjectsOption;
        if (dashboardProjectSelect) dashboardProjectSelect.innerHTML += noProjectsOption;
        try { window.refreshProjectDropdown?.(); } catch (_) {}
        console.log('⚠️ [UI-MANAGER] No projects for user', currentUser.id);
        return;
      }
      
      // Add projects to both dropdowns
      projectData.forEach((assignment) => {
        const project =
          assignment.projects ||
          (assignment.project_id && assignment.name
            ? { id: assignment.project_id, name: assignment.name }
            : null);
        if (!project?.name) return;

        if (projectSelect) {
          const option = document.createElement('option');
          option.value = assignment.project_id || project.id;
          option.textContent = project.name;
          projectSelect.appendChild(option);
        }

        if (dashboardProjectSelect) {
          const option = document.createElement('option');
          option.value = assignment.project_id || project.id;
          option.textContent = project.name;
          dashboardProjectSelect.appendChild(option);
        }
      });

      // Restore prior selection so reload doesn't flash back to placeholder
      if (projectSelect && previousProjectId) {
        const stillExists = Array.from(projectSelect.options).some((o) => o.value === previousProjectId);
        if (stillExists) projectSelect.value = previousProjectId;
      }
      if (dashboardProjectSelect && previousProjectId) {
        const stillExists = Array.from(dashboardProjectSelect.options).some((o) => o.value === previousProjectId);
        if (stillExists) dashboardProjectSelect.value = previousProjectId;
      }

      try {
        window.initProjectDropdown?.();
        window.refreshProjectDropdown?.();
      } catch (_) {}
      
      console.log(`✅ [UI-MANAGER] Added ${projectData.length} projects to main app dropdowns`);
      
    } catch (error) {
      console.error('❌ [UI-MANAGER] Error loading main app projects:', error);
      const projectSelect = document.getElementById('projectSelect');
      const dashboardProjectSelect = document.getElementById('dashboardProjectSelect');
      const errorOption = '<option value="" disabled>Could not load projects</option>';
      if (projectSelect) projectSelect.innerHTML = errorOption;
      if (dashboardProjectSelect) dashboardProjectSelect.innerHTML = errorOption;
      try { window.refreshProjectDropdown?.(); } catch (_) {}
    }
  }

  showMainApp() {
    if (window.__updateGateActive) {
      console.log('🛑 [UI-MANAGER] Main app blocked — mandatory update gate active');
      return;
    }
    console.log('🔧 [UI-MANAGER] showMainApp() called - starting UI initialization...');
    
    try {
      // CRITICAL: Always hide startup overlay when showing main app
      try {
        const overlay = document.getElementById('startupOverlay');
        if (overlay) overlay.style.display = 'none';
      } catch (_) {}
      
      const loginContainer = document.getElementById('loginContainer');
      const appContainer = document.getElementById('appContainer');
      
      console.log('🔧 [UI-MANAGER] DOM elements check:', {
        loginContainer: !!loginContainer,
        appContainer: !!appContainer,
        loginContainerId: loginContainer ? loginContainer.id : 'NOT_FOUND',
        appContainerId: appContainer ? appContainer.id : 'NOT_FOUND'
      });
      
      if (loginContainer) {
        loginContainer.style.display = 'none';
        console.log('✅ [UI-MANAGER] Login container hidden');
      } else {
        console.log('⚠️ [UI-MANAGER] loginContainer not found in DOM');
      }
      
      if (appContainer) {
        appContainer.style.display = 'block';
        console.log('✅ [UI-MANAGER] App container shown');
      } else {
        console.log('⚠️ [UI-MANAGER] appContainer not found in DOM');
      }
      
      // Initialize UI cache when showing main app
      console.log('🔧 [UI-MANAGER] Initializing UI cache...');
      this.initializeUICache();
      
      // Show default page (Time Tracker)
      console.log('🔧 [UI-MANAGER] Showing Time Tracker page...');
      this.showPage('timetracker');

      // Restore today's cumulative clock from DB when reopening the app same day.
      setTimeout(() => {
        if (typeof window.refreshTodayCompletedBaseSeconds === 'function') {
          void window.refreshTodayCompletedBaseSeconds();
        }
        void this.refreshTimerState();
        void this.loadTodaysTotalTime();
      }, 200);
      
      // Load user profile for welcome banner
      console.log('🔧 [UI-MANAGER] Loading user profile...');
      this.syncWelcomeFromAuthManager();
      this.loadUserProfile();
      
      // Load projects for main app dropdowns
      console.log('🔧 [UI-MANAGER] Loading projects...');
      this.loadMainAppProjects();
      
      console.log('📱 [UI-MANAGER] Main application initialization complete');
      
    } catch (error) {
      console.error('❌ [UI-MANAGER] Error in showMainApp():', error);
      console.error('❌ [UI-MANAGER] Error stack:', error.stack);
      
      // Fallback: try to show the app anyway
      console.log('🔧 [UI-MANAGER] Attempting fallback UI initialization...');
      try {
        const allContainers = document.querySelectorAll('[id*="Container"], [id*="container"]');
        console.log('🔧 [UI-MANAGER] Available containers:', Array.from(allContainers).map(c => c.id));
        
        // Try to find and show any app-related container
        const appContainer = document.getElementById('appContainer') || 
                           document.getElementById('mainContainer') || 
                           document.getElementById('timeTrackerContainer');
        
        if (appContainer) {
          appContainer.style.display = 'block';
          console.log('✅ [UI-MANAGER] Fallback: app container shown');
        }
      } catch (fallbackError) {
        console.error('❌ [UI-MANAGER] Fallback also failed:', fallbackError);
      }
    }
  }

  createLoadingIndicator(containerId, message = 'Loading...') {
    const container = document.getElementById(containerId);
    if (!container) return null;
    
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading-indicator';
    loadingDiv.innerHTML = `
      <div class="loading-spinner"></div>
      <p>${message}</p>
    `;
    
    container.innerHTML = '';
    container.appendChild(loadingDiv);
    
    return loadingDiv;
  }

  removeLoadingIndicator(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const loadingIndicator = container.querySelector('.loading-indicator');
    if (loadingIndicator) {
      loadingIndicator.remove();
    }
  }

  updateTrackingButtons() {
    console.log('🔄 Updating tracking buttons...', { trackingStatus: this.trackingStatus });
    
    // Dashboard buttons
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    
    // Time Tracker page buttons
    const trackerStartBtn = document.getElementById('trackerStartBtn');
    const trackerStopBtn = document.getElementById('trackerStopBtn');
    
    if (this.trackingStatus === 'active') {
        // Active state
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.innerHTML = '<i data-lucide="clock" style="width: 20px; height: 20px;"></i><span>Tracking...</span>';
        }
        if (stopBtn) {
            stopBtn.disabled = false;
            // Clear any disabled styles
            stopBtn.style.opacity = '';
            stopBtn.style.cursor = '';
            stopBtn.style.background = '';
            stopBtn.style.color = '';
        }
        
        if (trackerStartBtn) {
            trackerStartBtn.disabled = true;
            trackerStartBtn.innerHTML = '<i data-lucide="clock" style="width: 20px; height: 20px;"></i><span>Tracking...</span>';
        }
        if (trackerStopBtn) {
            trackerStopBtn.disabled = false;
            // Clear any disabled styles
            trackerStopBtn.style.opacity = '';
            trackerStopBtn.style.cursor = '';
            trackerStopBtn.style.background = '';
            trackerStopBtn.style.color = '';
        }
        
    } else {
        // Stopped state OR undefined/invalid status (removed paused state)
        // CRITICAL FIX: Handle undefined status gracefully - treat as stopped state
        if (this.trackingStatus === undefined || this.trackingStatus === null) {
            console.log('⚠️ [UI-MANAGER] Undefined tracking status detected - treating as stopped state');
            this.trackingStatus = 'stopped';
        }
        
        // For dashboard start button, check if project is selected
        const dashboardProjectSelect = document.getElementById('dashboardProjectSelect');
        const hasDashboardProjectSelected = dashboardProjectSelect && dashboardProjectSelect.value;
        
        if (startBtn) {
            startBtn.disabled = !hasDashboardProjectSelected;
            startBtn.innerHTML = '<i data-lucide="play" style="width: 20px; height: 20px;"></i><span>Start Tracking</span>';
            startBtn.title = hasDashboardProjectSelected ? '' : 'Select a project first';
        }
        if (stopBtn) stopBtn.disabled = true;
        
        // For tracker start button, check if project is selected
        const projectSelect = document.getElementById('projectSelect');
        const hasProjectSelected = projectSelect && projectSelect.value;
        
        if (trackerStartBtn) {
            trackerStartBtn.disabled = !hasProjectSelected;
            trackerStartBtn.innerHTML = '<i data-lucide="play" style="width: 20px; height: 20px;"></i><span>Start</span>';
            trackerStartBtn.title = hasProjectSelected ? '' : 'Select a project first';
        }
        if (trackerStopBtn) {
            trackerStopBtn.disabled = true;
            // CRITICAL FIX: Explicitly set inline styles for disabled state
            // This ensures the button appears dimmed regardless of CSS conflicts
            trackerStopBtn.style.opacity = '0.5';
            trackerStopBtn.style.cursor = 'not-allowed';
            trackerStopBtn.style.background = '#e2e8f0';
            trackerStopBtn.style.color = '#94a3b8';
        }
        if (stopBtn) {
            stopBtn.disabled = true;
            // Same styling fix for dashboard Stop button
            stopBtn.style.opacity = '0.5';
            stopBtn.style.cursor = 'not-allowed';
            stopBtn.style.background = '#e2e8f0';
            stopBtn.style.color = '#94a3b8';
        }
    }
    
    // Re-create icons after updating innerHTML
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    console.log('✅ Button states updated', {
      trackingStatus: this.trackingStatus,
      trackerStopDisabled: trackerStopBtn?.disabled
    });
  }

  showError(message) {
    this.notificationManager.showNotification(message, 'error');
  }

  showSuccess(message) {
    this.notificationManager.showNotification(message, 'success');
  }

  // Tracking state management methods
  setTrackingStatus(status) {
    console.log('🔄 UIManager: Setting tracking status to:', status);
    
    // CRITICAL FIX: Don't allow 'stopped' status during optimistic tracking mode
    // This prevents race conditions where stale get-tracking-state responses 
    // override the button state during async tracking start
    if (status === 'stopped') {
      const ipcMgr = this.ipcManager || window.ipcManager || (typeof moduleInstances !== 'undefined' && moduleInstances.ipcManager);
      if (ipcMgr && (ipcMgr.optimisticMode || ipcMgr.startInProgress)) {
        console.log('⚠️ UIManager: Ignoring stopped status - optimistic tracking in progress');
        return; // Don't override button state during optimistic mode
      }
    }
    
    this.trackingStatus = status;
    this.isTracking = (status === 'active');
    this.updateTrackingButtons();
    this.updateDashboardTimeDisplays();

    // Keep tracker page labels in sync with Tracking vs Ready.
    try {
      const trackerStatus = document.getElementById('trackerStatus');
      const projectSelect = document.getElementById('projectSelect');
      const selectedOption = projectSelect?.selectedOptions?.[0];
      const projectName = selectedOption ? (selectedOption.textContent || '').trim() : '';
      const bannerPrefix = document.getElementById('selectedProjectBannerPrefix');
      if (projectName) {
        const label = status === 'active' ? `Tracking: ${projectName}` : `Ready to track: ${projectName}`;
        if (trackerStatus) trackerStatus.textContent = label;
        if (bannerPrefix) {
          bannerPrefix.textContent = status === 'active' ? 'Tracking: ' : 'Ready to track: ';
        }
      }
    } catch (_) { /* ignore */ }

    // Update header pill (#trackingStatus) to reflect current state
    try {
      const pill = document.getElementById('trackingStatus');
      if (pill) {
        // Reset classes
        pill.classList.remove('active', 'paused', 'stopped');
        if (status === 'active') {
          pill.classList.add('active');
          pill.querySelector('span').textContent = 'Tracking';
        } else if (status === 'paused') {
          pill.classList.add('paused');
          pill.querySelector('span').textContent = 'Paused';
        } else {
          pill.classList.add('stopped');
          pill.querySelector('span').textContent = 'Not Tracking';
        }
      }
    } catch (e) {
      console.log('⚠️ [UI-MANAGER] Failed to update tracking pill:', e.message);
    }
  }

  getTrackingStatus() {
    return this.trackingStatus;
  }

  // DASHBOARD TIME DISPLAY FIXES
  updateDashboardTimeDisplays() {
    console.log('📊 Updating dashboard time displays...');
    
    // Update session status text based on tracking state
    const sessionStatus = document.getElementById('sessionStatus');
    if (sessionStatus) {
      if (this.trackingStatus === 'active') {
        sessionStatus.textContent = 'Active session';
      } else if (this.trackingStatus === 'paused') {
        sessionStatus.textContent = 'Session paused';
      } else {
        sessionStatus.textContent = 'Ready to start';
      }
    }
    
    // Load and display today's total time
    this.loadTodaysTotalTime();
  }
  
  async loadTodaysTotalTime() {
    try {
      console.log('📊 [TODAY-TIME] Loading today\'s total time...');
      
      // DIAGNOSTIC: Check if IPC is available
      if (!this.ipcRenderer) {
        console.error('❌ [TODAY-TIME] IPC renderer not available');
        return;
      }
      
      if (!this.ipcRenderer.invoke) {
        console.error('❌ [TODAY-TIME] IPC invoke not available');
        return;
      }
      
      console.log('📊 [TODAY-TIME] Attempting to call get-today-time-stats...');
      
      // Force a fresh fetch when effective split is not ready yet (avoids first-paint
      // flash of "all effective / 0 non-effective" from a stale incomplete cache).
      const forceFresh = !window.__effectiveStatsReady;
      const todayStats = await this._getCachedTodayTimeStats({ force: forceFresh }).catch(err => {
        console.error('❌ [TODAY-TIME] get-today-time-stats failed:', err);
        return null;
      });
      
      console.log('📊 [TODAY-TIME] Response from main process:', todayStats);
      
      if (todayStats && todayStats.totalTime !== undefined) {
        const trackerTimeElement = document.getElementById('trackerTime');
        const totalSec = Math.max(0, Math.floor(Number(todayStats.totalTime) || 0));
        const completedBase = Math.max(
          0,
          Math.floor(Number(todayStats.completedTodayBeforeCurrentSessionSeconds) || 0),
        );
        if (typeof window.applyTodayEffectiveStats === 'function') {
          window.applyTodayEffectiveStats(todayStats);
        }
        const effectiveSec =
          typeof todayStats.effectiveSeconds === 'number'
            ? Math.max(0, Math.floor(todayStats.effectiveSeconds))
            : typeof window.toEffectiveSeconds === 'function'
              ? window.toEffectiveSeconds(totalSec)
              : totalSec;
        this.updateTodayTime(totalSec, { effectiveSeconds: effectiveSec });
        console.log('✅ [TODAY-TIME] Updated effective display:', effectiveSec, 's (tracked', totalSec, 's)');
        const trackingLive =
          !!window.__lastTrackingStartTime ||
          !!(typeof window.isTrayTimerDrivingDisplay === 'function' && window.isTrayTimerDrivingDisplay()) ||
          this.trackingStatus === 'active';
        if (typeof todayStats.completedTodayBeforeCurrentSessionSeconds === 'number') {
          if (typeof window.applyClosedBaseFromStats === 'function') {
            window.applyClosedBaseFromStats(completedBase, { live: trackingLive });
          } else if (!(trackingLive && completedBase <= 0 && (window.__completedTodayBaseSeconds || 0) > 60)) {
            window.__completedTodayBaseSeconds = completedBase;
          }
        }
        if (trackerTimeElement && typeof window.setTrackerDisplaySeconds === 'function') {
          if (trackingLive) {
            // Live session owns the big clock; forward-only high-water paint.
            if (typeof window.updateRendererTrackingClock === 'function' && window.__lastTrackingStartTime) {
              window.updateRendererTrackingClock();
            } else {
              window.setTrackerDisplaySeconds(totalSec);
            }
          } else {
            const trackedDisplay =
              typeof window.resolveStoppedDisplaySeconds === 'function'
                ? window.resolveStoppedDisplaySeconds(totalSec)
                : totalSec;
            const prevShown = Math.max(
              0,
              Math.floor(Number(window.__todayTrackedSeconds) || 0),
              Math.floor(Number(window.__todayTrackedHighWaterSeconds) || 0),
            );
            window.setTrackerDisplaySeconds(trackedDisplay, {
              allowDecrease: trackedDisplay < prevShown - 1,
            });
            console.log('✅ [TODAY-TIME] Restored tracker clock from tracked', trackedDisplay, 's');
          }
        }
      } else {
        console.log('⚠️ [TODAY-TIME] No valid data, trying fallback...');
        // Fallback: calculate from activity logs if available
        this.calculateTodayTimeFromLogs();
      }
    } catch (error) {
      console.error('❌ [TODAY-TIME] Error loading today\'s total time:', error);
      // Show 0h 0m as fallback
      const todayTimeElement = document.getElementById('todayTime');
      if (todayTimeElement) {
        todayTimeElement.textContent = '0h 0m (error)';
      }
    }
  }
  
  async calculateTodayTimeFromLogs() {
    try {
      const logs = await this.ipcRenderer.invoke('get-activity-logs').catch(() => ({ logs: [] }));
      
      if (logs && logs.logs) {
        const today = new Date().toISOString().split('T')[0];
        const todayLogs = logs.logs.filter(log => 
          log.timestamp && log.timestamp.startsWith(today) && 
          log.description && log.description.includes('minutes')
        );
        
        let totalMinutes = 0;
        todayLogs.forEach(log => {
          const match = log.description.match(/(\d+)\s+minutes/);
          if (match) {
            totalMinutes += parseInt(match[1]);
          }
        });
        
        const totalSeconds = totalMinutes * 60;
        const todayTimeElement = document.getElementById('todayTime');
        if (todayTimeElement) {
          todayTimeElement.textContent = this.formatDuration(totalSeconds);
        }
        
        console.log('📊 Calculated today\'s time from logs:', totalMinutes, 'minutes');
      }
    } catch (error) {
      console.error('❌ Error calculating today\'s time from logs:', error);
    }
  }
  
  updateSessionTime(startTime) {
    if (!startTime) return;
    
    const sessionTimeElement = document.getElementById('sessionTime');
    if (sessionTimeElement) {
      const elapsed = typeof window.getTodayElapsedSeconds === 'function'
        ? window.getTodayElapsedSeconds(startTime)
        : Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
      const hours = Math.floor(elapsed / 3600);
      const minutes = Math.floor((elapsed % 3600) / 60);
      const seconds = elapsed % 60;
      const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      sessionTimeElement.textContent = timeString;
    }
  }
  
  // REAL-TIME MONITORING STATUS FIXES
  updateMonitoringStatus(type, status, data = {}) {
    console.log(`📡 [MONITORING] Updating status: ${type} = ${status}`, data);
    
    try {
      if (type === 'screenshot') {
        const statusElement = document.getElementById('screenshotSaveStatus');
        const valueElement = document.getElementById('screenshotStatus');
        const timeElement = document.getElementById('screenshotTime');
        
        console.log(`📡 [MONITORING] Screenshot elements found:`, {
          status: !!statusElement,
          value: !!valueElement,
          time: !!timeElement
        });
        
        if (statusElement) {
          const badge = statusElement.querySelector('.status-badge');
          if (badge) {
            badge.className = `status-badge ${status}`;
            badge.textContent = status === 'active' ? 'Active' : status === 'captured' ? 'Captured' : 'Pending';
            console.log(`✅ [MONITORING] Screenshot badge updated: ${badge.textContent}`);
          }
        }
        
        if (valueElement && data.message) {
          valueElement.textContent = data.message;
          console.log(`✅ [MONITORING] Screenshot value updated: ${data.message}`);
        }
        
        if (timeElement && data.nextTime) {
          timeElement.textContent = data.nextTime;
          console.log(`✅ [MONITORING] Screenshot time updated: ${data.nextTime}`);
        }
      }
      
      if (type === 'url') {
        const statusElement = document.getElementById('urlSaveStatus');
        const valueElement = document.getElementById('urlDetected');
        const browserElement = document.getElementById('urlBrowser');
        
        console.log(`📡 [MONITORING] URL elements found:`, {
          status: !!statusElement,
          value: !!valueElement,
          browser: !!browserElement
        });
        
        if (statusElement) {
          const badge = statusElement.querySelector('.status-badge');
          if (badge) {
            badge.className = `status-badge ${status}`;
            badge.textContent = status === 'active' ? 'Detected' : 'Pending';
            console.log(`✅ [MONITORING] URL badge updated: ${badge.textContent}`);
          }
        }
        
        if (valueElement && data.url) {
          valueElement.textContent = data.url;
          console.log(`✅ [MONITORING] URL value updated: ${data.url}`);
        }
        
        if (browserElement && data.browser) {
          browserElement.textContent = data.browser;
          console.log(`✅ [MONITORING] URL browser updated: ${data.browser}`);
        }
      }
      
      if (type === 'app') {
        const statusElement = document.getElementById('appSaveStatus');
        const valueElement = document.getElementById('appDetected');
        const windowElement = document.getElementById('appWindow');
        
        console.log(`📡 [MONITORING] App elements found:`, {
          status: !!statusElement,
          value: !!valueElement,
          window: !!windowElement
        });
        
        if (statusElement) {
          const badge = statusElement.querySelector('.status-badge');
          if (badge) {
            badge.className = `status-badge ${status}`;
            badge.textContent = status === 'active' ? 'Detected' : 'Pending';
            console.log(`✅ [MONITORING] App badge updated: ${badge.textContent}`);
          }
        }
        
        if (valueElement && data.app) {
          valueElement.textContent = data.app;
          console.log(`✅ [MONITORING] App value updated: ${data.app}`);
        }
        
        if (windowElement && data.window) {
          windowElement.textContent = data.window;
          console.log(`✅ [MONITORING] App window updated: ${data.window}`);
        }
      }
    } catch (error) {
      console.error(`❌ [MONITORING] Error updating ${type} status:`, error);
    }
  }

  isCurrentlyTracking() {
    return this.isTracking;
  }
  
  // UTILITY: Format duration function (fallback if not defined elsewhere)
  formatDuration(totalSeconds) {
    if (!totalSeconds || totalSeconds === 0) {
      return '0h 0m';
    }

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  /**
   * Precise duration for monthly report — always shows seconds so session rows add up to totals.
   */
  formatReportDuration(totalSeconds) {
    const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    if (sec === 0) return '0m';

    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = sec % 60;

    if (hours > 0) {
      if (seconds > 0) return `${hours}h ${minutes}m ${seconds}s`;
      if (minutes > 0) return `${hours}h ${minutes}m`;
      return `${hours}h`;
    }
    if (minutes > 0) {
      return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
    }
    return `${seconds}s`;
  }

  _localDateStr(d = new Date()) {
    return workDateKey(d);
  }

  _formatShortLocalDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  _getWeekDisplayLabel(weekStart, weekEnd) {
    const todayStr = this._localDateStr();
    const range = `${this._formatShortLocalDate(weekStart)} – ${this._formatShortLocalDate(weekEnd)}`;

    if (todayStr >= weekStart && todayStr <= weekEnd) {
      return { title: 'This week', range, isCurrent: true };
    }

    const [ey, em, ed] = weekEnd.split('-').map(Number);
    const weekEndDate = new Date(ey, em - 1, ed);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysSinceWeekEnded = Math.floor((today - weekEndDate) / (24 * 60 * 60 * 1000));
    if (daysSinceWeekEnded >= 0 && daysSinceWeekEnded < 7) {
      return { title: 'Last week', range, isCurrent: false };
    }

    return {
      title: `Week of ${this._formatShortLocalDate(weekStart)}`,
      range,
      isCurrent: false,
    };
  }

  _filterVisibleWeeks(weeks) {
    const todayStr = this._localDateStr();
    return (weeks || []).filter((week) => {
      if ((week.totalTime || 0) > 0) return true;
      return todayStr >= week.weekStart && todayStr <= week.weekEnd;
    });
  }

  // Hardware acceleration for smooth transitions
  enableHardwareAcceleration() {
    const style = document.createElement('style');
    style.textContent = `
      .page-section {
        transform: translateZ(0);
        backface-visibility: hidden;
        perspective: 1000px;
      }
      
      .nav-item {
        transform: translateZ(0);
        backface-visibility: hidden;
      }
    `;
    document.head.appendChild(style);
  }

  // Clean up resources and intervals
  destroy() {
    // Clear reports auto-refresh interval
    if (this.reportsRefreshInterval) {
      clearInterval(this.reportsRefreshInterval);
      this.reportsRefreshInterval = null;
      console.log('🧹 [CLEANUP] Cleared reports auto-refresh interval');
    }
    this.stopMonthlyReportAutoRefresh();
  }

  // Call this when navigating away from reports page
  clearReportsAutoRefresh() {
    if (this.reportsRefreshInterval) {
      clearInterval(this.reportsRefreshInterval);
      this.reportsRefreshInterval = null;
      console.log('🔄 [AUTO-REFRESH] Cleared on page navigation');
    }
  }

  async refreshTimerState() {
    console.log('🔄 [UI-MANAGER] Refreshing timer state...');
    
    try {
      // Get current tracking state from main process
      if (this.ipcRenderer) {
        const trackingState = await this.ipcRenderer.invoke('get-tracking-state');
        console.log('📊 [TIMER-REFRESH] Current tracking state:', trackingState);
        
        // Update timer display based on actual state
        if (trackingState && trackingState.isTracking && trackingState.sessionStartTime) {
          this.setTrackingStatus('active');
          
          // Update the timer display
          const timerElement = document.getElementById('trackerTime');
          if (timerElement) {
            const startTime = new Date(trackingState.sessionStartTime);
            const elapsed = typeof window.getTodayElapsedSeconds === 'function'
              ? window.getTodayElapsedSeconds(startTime)
              : Math.floor((Date.now() - startTime.getTime()) / 1000);
            try {
              this._todayStatsCacheTime = 0;
              const today = await this._getCachedTodayTimeStats();
              if (typeof window.applyTodayEffectiveStats === 'function') {
                window.applyTodayEffectiveStats(today);
              }
              if (typeof window.applyClosedBaseFromStats === 'function') {
                window.applyClosedBaseFromStats(
                  today?.completedTodayBeforeCurrentSessionSeconds,
                  { live: true },
                );
              } else {
                window.__completedTodayBaseSeconds = Math.max(
                  Math.floor(Number(window.__completedTodayBaseSeconds) || 0),
                  Math.floor(Number(today?.completedTodayBeforeCurrentSessionSeconds) || 0),
                );
              }
              const base = Math.max(0, Math.floor(Number(window.__completedTodayBaseSeconds) || 0));
              const totalSec = base + elapsed;
              if (typeof window.setTrackerDisplaySeconds === 'function') {
                window.setTrackerDisplaySeconds(totalSec);
              }
            } catch (err) {
              console.warn('⚠️ [TIMER-REFRESH] Effective clock refresh failed:', err?.message || err);
            }
            console.log('✅ [TIMER-REFRESH] Tracker timer updated (effective today)');
          }
          
          // Also update dashboard timer if available
          const dashboardTimer = document.getElementById('sessionTime');
          if (dashboardTimer) {
            const startTime = new Date(trackingState.sessionStartTime);
            const elapsed = typeof window.getTodayElapsedSeconds === 'function'
              ? window.getTodayElapsedSeconds(startTime)
              : Math.floor((Date.now() - startTime.getTime()) / 1000);
            const hours = Math.floor(elapsed / 3600);
            const minutes = Math.floor((elapsed % 3600) / 60);
            const seconds = elapsed % 60;
            const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            dashboardTimer.textContent = timeString;
            console.log('✅ [TIMER-REFRESH] Dashboard timer updated:', timeString);
          }
        } else {
          // FIX-5: If the tray timer is actively sending ticks, it is the
          // authoritative timer source. Don't reset displays on stale/failed
          // state queries — the tray timer will correct any drift within 1s.
          if (typeof window.isTrayTimerDrivingDisplay === 'function' && window.isTrayTimerDrivingDisplay()) {
            console.log('⚠️ [TIMER-REFRESH] State says not tracking, but tray timer is active — skipping reset');
          } else if (this.ipcManager?.optimisticMode || this.ipcManager?.startInProgress) {
            console.log('⚠️ [TIMER-REFRESH] Start in progress — skipping stopped reset');
          } else {
            this.setTrackingStatus('stopped');
            
            const timerElement = document.getElementById('trackerTime');
            if (timerElement) {
              try {
                const today = await this.ipcRenderer.invoke('get-today-time-stats');
                if (today && typeof today.totalTime === 'number') {
                  if (typeof window.applyTodayEffectiveStats === 'function') {
                    window.applyTodayEffectiveStats(today);
                  }
                  const trackedSec =
                    typeof window.resolveStoppedDisplaySeconds === 'function'
                      ? window.resolveStoppedDisplaySeconds(today.totalTime)
                      : Math.max(0, Math.floor(today.totalTime));
                  if (typeof window.setTrackerDisplaySeconds === 'function') {
                    window.setTrackerDisplaySeconds(trackedSec);
                  }
                }
                // Never wipe the day's clock to 0 on a missing/failed stats fetch.
              } catch {
                /* keep high-water display */
              }
            }
            
            const dashboardTimer = document.getElementById('sessionTime');
            if (dashboardTimer) {
              dashboardTimer.textContent = '--:--:--';
            }
            
            console.log('✅ [TIMER-REFRESH] Timer displays reset - not tracking');
          }
        }
        
        console.log('✅ [TIMER-REFRESH] Timer state refreshed successfully');
      } else {
        console.error('❌ [TIMER-REFRESH] IPC renderer not available');
      }
    } catch (error) {
      console.error('❌ [TIMER-REFRESH] Error refreshing timer state:', error);
    }
  }

  // ===== FORCE UPDATE MODAL METHODS =====

  hideAllAppShellsForUpdate() {
    ['loginContainer', 'appContainer', 'startupOverlay'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }

  /**
   * Block login/app at startup until the user installs the pending update.
   * @returns {Promise<boolean>} true when login must stay blocked
   */
  async enforceMandatoryUpdateGateAtStartup() {
    try {
      const status = await this.ipcRenderer.invoke('check-for-update');
      if (status?.updateAvailable) {
        window.__updateGateActive = true;
        this.showMandatoryUpdateGate({
          newVersion: status.newVersion,
          currentVersion: status.currentVersion,
          updateDownloaded: status.updateDownloaded,
          manualInstallRequired: status.manualInstallRequired,
          dmgInstallReady: status.dmgInstallReady,
          manualDownloadUrl: status.manualDownloadUrl,
        });
        return true;
      }
    } catch (error) {
      console.warn('⚠️ [UI-MANAGER] Startup update check failed:', error?.message || error);
    }
    window.__updateGateActive = false;
    return false;
  }

  /**
   * Show update-only screen (no login, no app) until install completes.
   */
  showMandatoryUpdateGate(updateInfo = {}) {
    console.log('🛑 [UI-MANAGER] Mandatory update gate:', updateInfo);
    this.hideAllAppShellsForUpdate();
    this.showUpdateModal(updateInfo);

    // Mac DMG-only path (rare) — still keep Retry Update visible.
    if (updateInfo.dmgInstallReady && updateInfo.manualInstallRequired) {
      this.showManualInstallFallback(updateInfo);
      return;
    }

    if (updateInfo.updateDownloaded || updateInfo.windowsInstallerReady) {
      this.showInstallReady();
      return;
    }

    // Begin download immediately so existing users update in-app (no re-download).
    setTimeout(() => {
      if (window.__updateGateActive) {
        this.handleUpdateButtonClick().catch((err) => {
          console.warn('⚠️ [UI-MANAGER] Auto-download failed:', err?.message || err);
        });
      }
    }, 400);
  }

  showManualInstallFallback(updateInfo = {}) {
    const updateBtn = document.getElementById('updateNowBtn');
    const btnText = document.getElementById('updateBtnText');
    const btnSpinner = document.getElementById('updateBtnSpinner');
    const manualBtn = document.getElementById('manualUpdateBtn');
    const progressContainer = document.getElementById('updateProgressContainer');

    if (progressContainer) progressContainer.classList.remove('visible');
    // Keep Retry Update as the primary action — never hide it behind manual-only.
    if (updateBtn) {
      updateBtn.style.display = 'flex';
      updateBtn.disabled = false;
    }
    if (btnSpinner) btnSpinner.style.display = 'none';
    if (btnText) {
      btnText.textContent = updateInfo.dmgInstallReady ? 'Retry Update' : 'Retry Update';
    }
    if (manualBtn) {
      manualBtn.style.display = 'flex';
      const manualLabel = manualBtn.querySelector('span');
      if (manualLabel) {
        manualLabel.textContent = updateInfo.dmgInstallReady
          ? 'Download Installer'
          : 'Download Installer Manually';
      }
      if (!manualBtn._manualHandlerAttached) {
        manualBtn._manualHandlerAttached = true;
        manualBtn.addEventListener('click', () => this.handleManualDownloadClick());
      }
    }

    const rawVersion = updateInfo.newVersion || updateInfo.version || '';
    const versionPrefix = rawVersion ? `Version ${rawVersion} is ready. ` : '';
    let message = updateInfo.message;
    if (!message) {
      if (updateInfo.dmgInstallReady) {
        message = `${versionPrefix}Click Retry Update to install automatically. If that fails, use Download Installer and drag Alyson PM to Applications.`;
      } else if (updateInfo.windowsInstaller || updateInfo.showManualDownloadOption || updateInfo.fallbackToWindowsInstaller) {
        message = `${versionPrefix}Click Retry Update — Alyson PM will download and install automatically. Use Download Installer Manually only if Retry keeps failing.`;
      } else {
        message = `${versionPrefix}Click Retry Update to continue the automatic install.`;
      }
    }
    this.showUpdateError(message);
  }

  async handleManualDownloadClick() {
    try {
      const result = await this.ipcRenderer.invoke('open-manual-update-download');
      if (!result?.success) {
        this.showUpdateError('Could not open the download page. Visit GitHub Releases for Alyson PM.');
      }
    } catch (error) {
      console.error('❌ [UI-MANAGER] Manual download failed:', error);
      this.showUpdateError('Could not open the download page. Visit GitHub Releases for Alyson PM.');
    }
  }

  /**
   * Show the mandatory update modal
   * @param {Object} updateInfo - Update information
   */
  showUpdateModal(updateInfo = {}) {
    console.log('🔄 [UI-MANAGER] Showing update modal:', updateInfo);    
    const modal = document.getElementById('updateModal');
    const newVersionEl = document.getElementById('updateNewVersion');
    const currentVersionEl = document.getElementById('updateCurrentVersion');
    const updateBtn = document.getElementById('updateNowBtn');
    const progressContainer = document.getElementById('updateProgressContainer');
    const errorEl = document.getElementById('updateError');    
    if (!modal) {
      console.error('❌ [UI-MANAGER] Update modal not found in DOM');
      return;
    }
    
    // Update version info
    if (newVersionEl) newVersionEl.textContent = updateInfo.newVersion || updateInfo.updateVersion || '--';
    if (currentVersionEl) currentVersionEl.textContent = updateInfo.currentVersion || '--';
    
    // Reset UI state
    if (progressContainer) progressContainer.classList.remove('visible');
    if (errorEl) errorEl.classList.remove('visible');
    if (updateBtn) {
      updateBtn.disabled = false;
      const btnText = document.getElementById('updateBtnText');
      const btnSpinner = document.getElementById('updateBtnSpinner');
      if (btnText) btnText.textContent = 'Update Now';
      if (btnSpinner) btnSpinner.style.display = 'none';
    }
    
    // Show modal (cannot be dismissed)
    this.hideAllAppShellsForUpdate();
    modal.classList.add('visible');
    
    // Setup update button click handler
    if (updateBtn && !updateBtn._updateHandlerAttached) {
      updateBtn._updateHandlerAttached = true;
      updateBtn.addEventListener('click', () => this.handleUpdateButtonClick());
    }
    
    // Block escape key
    this._blockEscapeKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('keydown', this._blockEscapeKey, true);
    
    console.log('✅ [UI-MANAGER] Update modal displayed');
  }

  /**
   * Hide the update modal (only called after successful update install)
   */
  hideUpdateModal() {
    const modal = document.getElementById('updateModal');
    if (modal) {
      modal.classList.remove('visible');
    }
    
    // Remove escape key blocker
    if (this._blockEscapeKey) {
      document.removeEventListener('keydown', this._blockEscapeKey, true);
      this._blockEscapeKey = null;
    }
    
    console.log('✅ [UI-MANAGER] Update modal hidden');
  }

  /**
   * Handle update button click - start download
   */
  async handleUpdateButtonClick() {
    console.log('🔄 [UI-MANAGER] Update button clicked');
    
    const updateBtn = document.getElementById('updateNowBtn');
    const btnText = document.getElementById('updateBtnText');
    const btnSpinner = document.getElementById('updateBtnSpinner');
    const progressContainer = document.getElementById('updateProgressContainer');
    const progressText = document.getElementById('updateProgressText');
    const errorEl = document.getElementById('updateError');
    
    // Show loading state
    if (updateBtn) updateBtn.disabled = true;
    if (btnText) btnText.textContent = 'Downloading...';
    if (btnSpinner) btnSpinner.style.display = 'inline-block';
    if (progressContainer) progressContainer.classList.add('visible');
    if (progressText) progressText.textContent = 'Downloading update...';
    if (errorEl) errorEl.classList.remove('visible');
    
    try {
      // Start download
      const result = await this.ipcRenderer.invoke('download-update');
      console.log('📥 [UI-MANAGER] Download result:', result);
      
      // Handle ZIP not available error (release missing ZIP files)
      if (result.error === 'zip_not_available') {
        console.log('🔧 [UI-MANAGER] ZIP files not available on server');
        if (progressContainer) progressContainer.classList.remove('visible');
        if (btnSpinner) btnSpinner.style.display = 'none';
        if (btnText) btnText.textContent = 'Retry Later';
        if (updateBtn) updateBtn.disabled = false;
        this.showUpdateError('Update files are being prepared. Please try again in a few minutes or restart the app.');
        return;
      }

      // macOS in-place download failed — offer DMG installer fallback.
      if (result.fallbackToDmg || result.error === 'in_place_failed') {
        console.log('🔧 [UI-MANAGER] In-place update failed, showing DMG fallback');
        this.showManualInstallFallback({
          dmgInstallReady: true,
          newVersion: result.version,
          manualDownloadUrl: result.manualDownloadUrl,
        });
        return;
      }

      // Windows: download hiccup — keep Retry Update primary (not manual-only trap).
      if (
        result.fallbackToWindowsInstaller ||
        result.showManualDownloadOption ||
        (result.manualInstallRequired && process.platform !== 'darwin' && !result.dmgInstallReady)
      ) {
        this.showManualInstallFallback({
          dmgInstallReady: false,
          windowsInstaller: true,
          showManualDownloadOption: true,
          newVersion: result.version,
          manualDownloadUrl: result.manualDownloadUrl,
          message: result.message,
        });
        if (updateBtn) updateBtn.disabled = false;
        if (btnText) btnText.textContent = 'Retry Update';
        if (btnSpinner) btnSpinner.style.display = 'none';
        return;
      }

      if (!result.success && result.error) {
        throw new Error(result.message || result.error);
      }

      // Download complete / staged — ready to install
      if (result.inPlaceReady || result.alreadyDownloaded || result.windowsInstallerReady) {
        this.showInstallReady();
      } else if (result.dmgInstall) {
        this.showManualInstallFallback({ dmgInstallReady: true });
      }
      // Otherwise, wait for download progress + update-downloaded events
      
    } catch (error) {
      console.error('❌ [UI-MANAGER] Download failed:', error);
      const msg = error.message || 'Download failed. Please try again.';
      // electron-updater throws this when download runs without a fresh check
      // (common after restoring stale update-state.json on Windows).
      let friendly = msg;
      if (/please check update first/i.test(msg)) {
        friendly = 'Update check expired. Click Retry Update — if it fails again, use Download Installer.';
      } else if (/ERR_ADDRESS_UNREACHABLE|ERR_CONNECTION_|ENETUNREACH|ERR_NAME_NOT_RESOLVED/i.test(msg)) {
        friendly = 'Could not reach the update server. Click Retry Update, or use Download Installer Manually.';
      }
      this.showUpdateError(friendly);
      
      // Reset button
      if (updateBtn) updateBtn.disabled = false;
      if (btnText) btnText.textContent = 'Retry Update';
      if (btnSpinner) btnSpinner.style.display = 'none';
    }
  }

  /**
   * Update download progress UI
   * @param {Object} progress - Progress info (percent, bytesPerSecond, etc.)
   */
  updateDownloadProgress(progress) {
    const progressBar = document.getElementById('updateProgressBar');
    const progressText = document.getElementById('updateProgressText');
    
    if (progressBar) {
      progressBar.style.width = `${progress.percent || 0}%`;
    }
    
    if (progressText) {
      const percent = Math.round(progress.percent || 0);
      let speed = '';
      const bps = Number(progress.bytesPerSecond) || 0;
      if (bps > 0) {
        speed = bps >= 1024 * 1024
          ? `${(bps / 1024 / 1024).toFixed(1)} MB/s`
          : `${Math.max(1, Math.round(bps / 1024))} KB/s`;
      }
      const hint = progress.message || (percent < 100 ? 'Downloading update…' : 'Download complete');
      progressText.textContent = speed
        ? `${hint} ${percent}% (${speed})`
        : `${hint} ${percent}%`;
    }
  }

  /**
   * Show install ready state
   */
  showInstallReady() {
    console.log('✅ [UI-MANAGER] Download complete, ready to install');
    
    const updateBtn = document.getElementById('updateNowBtn');
    const btnText = document.getElementById('updateBtnText');
    const btnSpinner = document.getElementById('updateBtnSpinner');
    const progressText = document.getElementById('updateProgressText');
    const progressBar = document.getElementById('updateProgressBar');
    
    if (progressBar) progressBar.style.width = '100%';
    if (progressText) progressText.textContent = 'Download complete — installing…';
    if (btnSpinner) btnSpinner.style.display = 'none';
    if (btnText) btnText.textContent = 'Install & Restart';
    if (updateBtn) {
      updateBtn.disabled = false;
      
      // Replace click handler for install
      updateBtn.onclick = () => this.handleInstallButtonClick();
    }

    // Auto-install shortly after download so users aren't stuck on a manual step
    // (especially Windows silent NSIS — no wizard, no "Download Installer Manually").
    if (!this._autoInstallScheduled) {
      this._autoInstallScheduled = true;
      setTimeout(() => {
        if (window.__updateGateActive || document.getElementById('updateModal')?.classList.contains('visible')) {
          this.handleInstallButtonClick().catch((err) => {
            console.warn('⚠️ [UI-MANAGER] Auto-install failed:', err?.message || err);
            this._autoInstallScheduled = false;
          });
        } else {
          this._autoInstallScheduled = false;
        }
      }, 800);
    }
  }

  /**
   * Handle install button click
   */
  async handleInstallButtonClick() {
    console.log('🔄 [UI-MANAGER] Install button clicked');
    
    const updateBtn = document.getElementById('updateNowBtn');
    const btnText = document.getElementById('updateBtnText');
    const btnSpinner = document.getElementById('updateBtnSpinner');
    
    // Show installing state
    if (updateBtn) updateBtn.disabled = true;
    if (btnText) btnText.textContent = 'Installing...';
    if (btnSpinner) btnSpinner.style.display = 'inline-block';
    
    // Flag to track that we're installing (app will quit)
    this.isInstallingUpdate = true;
    
    try {
      console.log('🔧 [UI-MANAGER] Invoking install-update IPC...');
      // Trigger install - app will quit shortly after
      const result = await this.ipcRenderer.invoke('install-update');
      console.log('🔧 [UI-MANAGER] Install result:', result);
      
      if (result && result.dmgOpened) {
        this.isInstallingUpdate = false;
        if (btnText) btnText.textContent = 'Installer Opened';
        if (btnSpinner) btnSpinner.style.display = 'none';
        this.showUpdateError(result.message || 'Installer opened. Drag Alyson PM to Applications, then reopen the app.');
      } else if (result && result.installing) {
        // Update is installing, app will quit - show success state
        if (btnText) btnText.textContent = 'Restarting...';
        console.log('✅ [UI-MANAGER] Update installing, app will restart...');
      } else if (result && result.manualInstallRequired) {
        this.isInstallingUpdate = false;
        this.showManualInstallFallback({
          manualDownloadUrl: result.manualDownloadUrl,
        });
      } else if (result && result.error) {
        // Install failed with specific error
        console.error('❌ [UI-MANAGER] Install returned error:', result.error);
        this.isInstallingUpdate = false;
        if (updateBtn) updateBtn.disabled = false;
        if (btnSpinner) btnSpinner.style.display = 'none';
        if (btnText) btnText.textContent = 'Retry Install';
        this.showUpdateError(result.error);
      } else {
        // Unknown response - still try waiting for restart
        console.log('⚠️ [UI-MANAGER] Unknown install response:', result);
        if (btnText) btnText.textContent = 'Restarting...';
      }
    } catch (error) {
      // During app quit, IPC channels may be destroyed causing errors
      // This is expected behavior during update installation
      if (this.isInstallingUpdate) {
        console.log('ℹ️ [UI-MANAGER] IPC error during install (expected during quit):', error.message);
        // Don't show error - app is quitting for update
        if (btnText) btnText.textContent = 'Restarting...';
      } else {
        console.error('❌ [UI-MANAGER] Install failed:', error);
        if (updateBtn) updateBtn.disabled = false;
        if (btnSpinner) btnSpinner.style.display = 'none';
        if (btnText) btnText.textContent = 'Retry Install';
        this.showUpdateError(error.message || 'Install failed. Please restart the app manually.');
      }
    }
  }

  /**
   * Show update error
   * @param {string} message - Error message
   */
  showUpdateError(message) {
    const errorEl = document.getElementById('updateError');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add('visible');
    }
  }

  /**
   * Setup update event listeners from main process
   */
  setupUpdateEventListeners() {
    if (!this.ipcRenderer) return;
    
    this.ipcRenderer.on('mandatory-update-required', (event, data) => {
      window.__updateGateActive = true;
      this.showMandatoryUpdateGate({
        newVersion: data.version,
        currentVersion: data.currentVersion,
        updateDownloaded: data.updateDownloaded,
        manualInstallRequired: data.manualInstallRequired,
        dmgInstallReady: data.dmgInstallReady,
        manualDownloadUrl: data.manualDownloadUrl,
      });
    });

    this.ipcRenderer.on('manual-update-required', (event, data) => {
      window.__updateGateActive = true;
      this.showMandatoryUpdateGate({
        newVersion: data.version,
        currentVersion: data.currentVersion,
        manualInstallRequired: true,
        manualDownloadUrl: data.manualDownloadUrl,
      });
    });

    // Listen for update available
    this.ipcRenderer.on('update-available', (event, data) => {
      console.log('🆕 [UI-MANAGER] Update available:', data);
      window.__updateGateActive = true;
      this.showMandatoryUpdateGate({
        newVersion: data.version,
        currentVersion: data.currentVersion,
      });
    });

    this.ipcRenderer.on('update-not-available', () => {
      if (!window.__updateGateActive) return;
      window.__updateGateActive = false;
      this.hideUpdateModal();
      const loginContainer = document.getElementById('loginContainer');
      const appContainer = document.getElementById('appContainer');
      if (appContainer && appContainer.style.display !== 'none') {
        return;
      }
      if (loginContainer) loginContainer.style.display = 'flex';
    });
    
    // Listen for download progress
    this.ipcRenderer.on('update-download-progress', (event, progress) => {
      this.updateDownloadProgress(progress);
    });
    
    // Listen for download complete
    this.ipcRenderer.on('update-downloaded', (event, data) => {
      console.log('✅ [UI-MANAGER] Update downloaded:', data);
      this.showInstallReady();
    });
    
    // Listen for update errors
    this.ipcRenderer.on('update-error', (event, data) => {
      console.error('❌ [UI-MANAGER] Update error:', data);
      const raw = data?.error || 'An error occurred';
      // Don't flash Chromium net codes — download path may still recover via Node fallback.
      if (/ERR_ADDRESS_UNREACHABLE|ERR_CONNECTION_|ENETUNREACH|ERR_NAME_NOT_RESOLVED/i.test(raw)) {
        const progressText = document.getElementById('updateProgressText');
        if (progressText) {
          progressText.textContent = 'Primary download failed — trying alternate method…';
        }
        return;
      }
      this.showUpdateError(raw);
    });
    
    // Listen for dev mode update (download works, install doesn't in dev)
    this.ipcRenderer.on('update-dev-mode', (event, data) => {
      console.log('⚠️ [UI-MANAGER] Dev mode update:', data);
      // Show success message in dev mode
      const btnText = document.getElementById('updateBtnText');
      const btnSpinner = document.getElementById('updateBtnSpinner');
      const progressText = document.getElementById('updateProgressText');
      
      if (progressText) progressText.textContent = '✅ ' + data.message;
      if (btnText) btnText.textContent = 'Dev Mode - OK';
      if (btnSpinner) btnSpinner.style.display = 'none';
    });
    
    console.log('✅ [UI-MANAGER] Update event listeners registered');
  }

  // ====================================================
  // TRACKER SCREENSHOTS (shown on Time Tracker page)
  // ====================================================

  /**
   * Load and display recent screenshots directly on the Time Tracker page.
   * Uses the same IPC handler as the full screenshots page but with a compact grid.
   */
  async loadTrackerScreenshots(forceRefresh = false) {
    const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes cache
    const now = Date.now();

    // Cache check
    if (!forceRefresh && this._trackerScreenshotsCache && (now - this._trackerScreenshotsCacheTime) < CACHE_TTL_MS) {
      console.log('[TRACKER-SCREENSHOTS] Using cached data');
      this._renderTrackerScreenshots(this._trackerScreenshotsCache);
      return;
    }

    const loadingEl = document.getElementById('trackerScreenshotsLoading');
    const emptyEl = document.getElementById('trackerScreenshotsEmpty');
    const gridEl = document.getElementById('trackerScreenshotsGrid');
    const dateInput = document.getElementById('trackerScreenshotDate');

    if (!gridEl) return;

    // Default to Pacific work-day "today" (not machine-local Pakistan/etc.)
    if (dateInput && !dateInput.value) {
      dateInput.value = workDateKey();
    }

    const selectedDate = dateInput ? dateInput.value : workDateKey();

    // Show loading
    if (loadingEl) loadingEl.style.display = 'block';
    if (emptyEl) emptyEl.style.display = 'none';
    if (gridEl) gridEl.style.display = 'none';

    try {
      // Get current user ID
      const currentUser = window.moduleInstances?.authManager?.currentUser
        || window.moduleInstances?.authManager?.getCurrentUser?.();

      if (!currentUser) {
        console.log('[TRACKER-SCREENSHOTS] No user logged in');
        if (loadingEl) loadingEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'block';
        return;
      }

      const response = await this.ipcRenderer.invoke('fetch-screenshots-enhanced', {
        user_id: currentUser.id,
        date: selectedDate,
        activity_filter: 'all',
        limit: 9
      });

      if (loadingEl) loadingEl.style.display = 'none';

      const screenshots = response && response.success ? response.screenshots : [];

      if (!screenshots || screenshots.length === 0) {
        if (emptyEl) emptyEl.style.display = 'block';
        if (gridEl) gridEl.style.display = 'none';
        return;
      }

      // Cache the data
      this._trackerScreenshotsCache = screenshots;
      this._trackerScreenshotsCacheTime = now;

      this._renderTrackerScreenshots(screenshots);

      // Setup event listeners for date navigation & refresh
      this._setupTrackerScreenshotListeners();

    } catch (err) {
      console.error('[TRACKER-SCREENSHOTS] Error loading screenshots:', err);
      if (loadingEl) loadingEl.style.display = 'none';
      if (emptyEl) {
        emptyEl.style.display = 'block';
        emptyEl.innerHTML = `
          <i data-lucide="alert-triangle" style="width: 48px; height: 48px; color: #f59e0b;"></i>
          <p style="font-size: 14px; color: #64748b; margin-top: 8px;">Could not load screenshots.<br>Please try again later.</p>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    }
  }

  _renderTrackerScreenshots(screenshots) {
    const gridEl = document.getElementById('trackerScreenshotsGrid');
    const emptyEl = document.getElementById('trackerScreenshotsEmpty');
    if (!gridEl) return;

    if (!screenshots || screenshots.length === 0) {
      gridEl.style.display = 'none';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    gridEl.style.display = 'grid';

    let html = '';
    screenshots.forEach((screenshot, index) => {
      const capturedAt = new Date(screenshot.captured_at);
      const timeStr = capturedAt.toLocaleTimeString('en-US', {
        timeZone: getWorkTimezone(),
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      const activityPercent = screenshot.activity_percent || 0;
      let activityColor = '#10b981'; // green (high)
      let activityLabel = 'High';
      if (activityPercent < 10) { activityColor = '#ef4444'; activityLabel = 'Low'; }
      else if (activityPercent < 70) { activityColor = '#f59e0b'; activityLabel = 'Medium'; }

      const clicks = screenshot.mouse_clicks || 0;
      const keys = screenshot.keystrokes || 0;

      html += `
        <div class="tracker-screenshot-card" onclick="window.open('${screenshot.image_url}', '_blank')">
          <img class="tracker-screenshot-img"
               src="${screenshot.image_url}"
               alt="Screenshot ${index + 1}"
               onerror="this.onerror=null; this.style.display='none'; this.parentElement.querySelector('.tracker-screenshot-info').insertAdjacentHTML('afterbegin', '<div style=\\'text-align:center;padding:20px;color:#94a3b8;font-size:24px;\\'>📸</div>');">
          <div class="tracker-screenshot-info">
            <div class="tracker-screenshot-time">${timeStr}</div>
            <div class="tracker-screenshot-meta">
              Clicks: ${clicks} · Keys: ${keys} · Activity: ${activityPercent}%
            </div>
            <span class="tracker-screenshot-badge" style="background: ${activityColor};">${activityLabel}</span>
          </div>
        </div>
      `;
    });

    gridEl.innerHTML = html;

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  _setupTrackerScreenshotListeners() {
    // Prevent double-binding
    if (this._trackerScreenshotListenersBound) return;
    this._trackerScreenshotListenersBound = true;

    const prevBtn = document.getElementById('trackerScreenshotPrevDate');
    const nextBtn = document.getElementById('trackerScreenshotNextDate');
    const dateInput = document.getElementById('trackerScreenshotDate');
    const refreshBtn = document.getElementById('trackerScreenshotRefreshBtn');

    const navigateDate = (direction) => {
      if (!dateInput) return;
      const parts = dateInput.value.split('-').map(Number);
      const next = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + direction));
      const y = next.getUTCFullYear();
      const m = String(next.getUTCMonth() + 1).padStart(2, '0');
      const d = String(next.getUTCDate()).padStart(2, '0');
      const nextKey = `${y}-${m}-${d}`;
      if (nextKey > workDateKey()) return; // Don't go past Pacific "today"

      dateInput.value = nextKey;
      this._trackerScreenshotsCache = null; // invalidate cache
      this.loadTrackerScreenshots(true);
    };

    if (prevBtn) prevBtn.addEventListener('click', () => navigateDate(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => navigateDate(1));
    if (dateInput) dateInput.addEventListener('change', () => {
      this._trackerScreenshotsCache = null;
      this.loadTrackerScreenshots(true);
    });
    if (refreshBtn) refreshBtn.addEventListener('click', () => {
      this._trackerScreenshotsCache = null;
      this.loadTrackerScreenshots(true);
    });
  }

  // ====================================================
  // MONTHLY WORK REPORT
  // ====================================================

  /**
   * Load and render the monthly work report on the Time Tracker page.
   * Caches data for 5 minutes to avoid excessive re-fetches on page revisits.
   * @param {boolean} forceRefresh
   * @param {{ silent?: boolean }} [options] — silent skips loading skeleton (auto-refresh)
   */
  async loadMonthlyReport(forceRefresh = false, options = {}) {
    const silent = !!options.silent;
    // Short TTL: effective/non-effective must stay aligned with Today's cards.
    const CACHE_TTL_MS = 60 * 1000;
    const now = Date.now();

    // Check cache — if valid, re-render from cached data instead of fetching.
    // We must still touch the DOM because page navigation re-creates the HTML
    // with default visibility (loading skeleton shown, content hidden).
    if (!forceRefresh && this._monthlyReportCache && (now - this._monthlyReportCacheTime) < CACHE_TTL_MS) {
      console.log('[MONTHLY-REPORT] Using cached data — re-rendering');
      const { reportData } = this._monthlyReportCache;
      const loadingEl = document.getElementById('monthlyReportLoading');
      const emptyEl = document.getElementById('monthlyReportEmpty');
      const contentEl = document.getElementById('monthlyReportContent');
      const labelEl = document.getElementById('monthlyReportLabel');
      if (contentEl) {
        if (loadingEl) loadingEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'none';
        contentEl.style.display = 'block';
        this._renderMonthlyReportSummary(reportData);
        this._renderMonthlyDailyChart(reportData);
        this._renderMonthlyWeeklyBreakdown(reportData);
        this._renderMonthlyProjectBreakdown(reportData);
        this._renderMonthlySessionList(reportData);
        if (labelEl) labelEl.textContent = reportData.monthLabel || '';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
      return;
    }

    const loadingEl = document.getElementById('monthlyReportLoading');
    const emptyEl = document.getElementById('monthlyReportEmpty');
    const contentEl = document.getElementById('monthlyReportContent');
    const labelEl = document.getElementById('monthlyReportLabel');

    if (!contentEl) return; // section not in DOM

    // Show loading (skip on silent auto-refresh so the section doesn't flicker)
    const hadContent =
      contentEl.style.display !== 'none' && contentEl.childElementCount > 0;
    if (!silent || !hadContent) {
      if (loadingEl) loadingEl.style.display = 'block';
      if (emptyEl) emptyEl.style.display = 'none';
      if (contentEl) contentEl.style.display = 'none';
    }

    try {
      const reportData = await this._invokeIpcWhenReady('get-monthly-report-data');

      console.log('[MONTHLY-REPORT] Data fetched:', {
        totalSeconds: reportData?.totalSeconds,
        sessions: reportData?.totalSessions,
        projects: reportData?.projectBreakdown?.length,
        weeks: reportData?.weeklyBreakdown?.length,
        silent
      });

      // Hide loading
      if (loadingEl) loadingEl.style.display = 'none';

      if (reportData?.error) {
        if (emptyEl) {
          emptyEl.style.display = 'block';
          emptyEl.innerHTML = `
            <i data-lucide="alert-triangle" style="width: 48px; height: 48px; color: #f59e0b; margin-bottom: 12px;"></i>
            <p style="color: #64748b; font-size: 14px;">Could not load report data.<br>${reportData.error}</p>
          `;
        }
        if (contentEl) contentEl.style.display = 'none';
        if (labelEl) labelEl.textContent = 'Unavailable';
        return;
      }

      // Check for empty state
      if (!reportData || (reportData.totalSessions === 0 && reportData.totalSeconds === 0)) {
        if (emptyEl) emptyEl.style.display = 'block';
        if (contentEl) contentEl.style.display = 'none';
        if (labelEl) labelEl.textContent = reportData?.monthLabel || 'No data';
        return;
      }

      // Cache the data
      this._monthlyReportCache = { reportData };
      this._monthlyReportCacheTime = now;

      // Show content
      if (emptyEl) emptyEl.style.display = 'none';
      if (contentEl) contentEl.style.display = 'block';

      // Populate
      this._renderMonthlyReportSummary(reportData);
      this._renderMonthlyDailyChart(reportData);
      this._renderMonthlyWeeklyBreakdown(reportData);
      this._renderMonthlyProjectBreakdown(reportData);
      this._renderMonthlySessionList(reportData);

      // Month label
      if (labelEl) labelEl.textContent = reportData.monthLabel || '';

      // Re-init lucide icons for newly added elements
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }

    } catch (err) {
      console.error('[MONTHLY-REPORT] Error loading report:', err);
      if (loadingEl) loadingEl.style.display = 'none';
      if (!silent) {
        if (emptyEl) {
          emptyEl.style.display = 'block';
          emptyEl.innerHTML = `
            <i data-lucide="alert-triangle" style="width: 48px; height: 48px; color: #f59e0b; margin-bottom: 12px;"></i>
            <p style="color: #64748b; font-size: 14px;">Could not load report data.<br>Please try again later.</p>
          `;
        }
      }
    }
  }

  /** Auto-refresh "This Month at a Glance" while Time Tracker is visible (~1 min, like screenshots). */
  startMonthlyReportAutoRefresh() {
    this.stopMonthlyReportAutoRefresh();
    this.monthlyReportRefreshInterval = setInterval(() => {
      const timetrackerPage = document.getElementById('timetrackerPage');
      const isActive =
        timetrackerPage?.classList?.contains('active') ||
        this.cachedElements?.currentActivePage?.id === 'timetrackerPage';
      if (!isActive) return;
      if (this._monthlyReportRefreshing) return;
      this._monthlyReportRefreshing = true;
      console.log('🔄 [AUTO-REFRESH] Updating This Month at a Glance...');
      this.loadMonthlyReport(true, { silent: true })
        .catch((err) => console.warn('⚠️ [AUTO-REFRESH] Monthly report failed:', err?.message || err))
        .finally(() => {
          this._monthlyReportRefreshing = false;
        });
    }, 60 * 1000);
    console.log('🔄 [AUTO-REFRESH] Monthly report auto-refresh started (60s)');
  }

  stopMonthlyReportAutoRefresh() {
    if (this.monthlyReportRefreshInterval) {
      clearInterval(this.monthlyReportRefreshInterval);
      this.monthlyReportRefreshInterval = null;
      console.log('⏹️ [AUTO-REFRESH] Monthly report auto-refresh stopped');
    }
  }

  /** Render the summary stat cards (Total / Non-effective / Effective) */
  _renderMonthlyReportSummary(reportData) {
    const aligned = this._alignMonthlySummaryWithLiveToday(reportData);
    const totalSeconds = aligned.totalSeconds;
    const nonEffectiveSeconds = aligned.nonEffectiveSeconds;
    const effectiveSeconds = aligned.effectiveSeconds;
    const activeDays = reportData?.activeDays || 1;

    const totalHoursEl = document.getElementById('mrTotalHours');
    if (totalHoursEl) totalHoursEl.textContent = this.formatReportDuration(totalSeconds);

    const nonEffEl = document.getElementById('mrNonEffectiveHours');
    if (nonEffEl) nonEffEl.textContent = this.formatReportDuration(nonEffectiveSeconds);

    const effectiveEl = document.getElementById('mrEffectiveHours');
    if (effectiveEl) effectiveEl.textContent = this.formatReportDuration(effectiveSeconds);

    const avgPerDayEl = document.getElementById('mrAvgPerDay');
    if (avgPerDayEl) {
      const avgSecondsPerDay = activeDays > 0 ? Math.floor(effectiveSeconds / activeDays) : 0;
      avgPerDayEl.textContent = this.formatReportDuration(avgSecondsPerDay);
    }

    // Tracked floor only — never overwrite Today's effective split from Month
    // (Month historically used a 3× interval and would corrupt the cards).
    this._raiseTodayTrackedFloorFromMonthly(reportData);
  }

  /**
   * Rebuild Month summary so today's slice matches the live Today cards.
   * Guarantees: effective + non-effective === total (for the displayed numbers).
   */
  _alignMonthlySummaryWithLiveToday(reportData) {
    let totalSeconds = Math.max(0, Math.floor(Number(reportData?.totalSeconds) || 0));
    let nonEffectiveSeconds = Math.max(0, Math.floor(Number(reportData?.nonEffectiveSeconds) || 0));

    try {
      const todayStr = typeof this._localDateStr === 'function' ? this._localDateStr() : null;
      const todayRow =
        todayStr && Array.isArray(reportData?.dailyBreakdown)
          ? reportData.dailyBreakdown.find((d) => d && d.date === todayStr)
          : null;

      if (todayRow) {
        const rowTotal = Math.max(0, Math.floor(Number(todayRow.totalSeconds) || 0));
        const rowNonEff = Math.max(0, Math.floor(Number(todayRow.nonEffectiveSeconds) || 0));
        const liveTracked = Math.max(
          0,
          Math.floor(Number(window.__todayTrackedSeconds) || 0),
          Math.floor(Number(window.__todayTrackedHighWaterSeconds) || 0),
        );
        const liveNonEff = Math.max(0, Math.floor(Number(window.__todayNonEffectiveSeconds) || 0));
        const liveReady = !!window.__effectiveStatsReady;

        const todayTracked = Math.max(liveTracked, rowTotal);
        const todayNonEff = liveReady
          ? Math.min(todayTracked, liveNonEff)
          : Math.min(todayTracked, rowNonEff);

        const monthWithoutTodayTotal = Math.max(0, totalSeconds - rowTotal);
        const monthWithoutTodayNonEff = Math.max(0, nonEffectiveSeconds - rowNonEff);
        totalSeconds = monthWithoutTodayTotal + todayTracked;
        nonEffectiveSeconds = Math.min(
          totalSeconds,
          monthWithoutTodayNonEff + todayNonEff,
        );

        // Keep cached today row in sync so chart/hover stays consistent.
        todayRow.totalSeconds = todayTracked;
        todayRow.nonEffectiveSeconds = todayNonEff;
        todayRow.effectiveSeconds = Math.max(0, todayTracked - todayNonEff);
      }
    } catch (_) {
      /* keep report totals */
    }

    nonEffectiveSeconds = Math.min(totalSeconds, nonEffectiveSeconds);
    const effectiveSeconds = Math.max(0, totalSeconds - nonEffectiveSeconds);
    return { totalSeconds, nonEffectiveSeconds, effectiveSeconds };
  }

  /**
   * Month/DB may raise Today's tracked floor; never lower the clock or overwrite
   * Today's effective / non-effective split.
   */
  _raiseTodayTrackedFloorFromMonthly(reportData) {
    try {
      const todayStr = typeof this._localDateStr === 'function' ? this._localDateStr() : null;
      if (!todayStr || !Array.isArray(reportData?.dailyBreakdown)) return;
      const todayRow = reportData.dailyBreakdown.find((d) => d && d.date === todayStr);
      if (!todayRow || typeof todayRow.totalSeconds !== 'number') return;

      const rowTotal = Math.max(0, Math.floor(Number(todayRow.totalSeconds) || 0));
      if (rowTotal > 0 && typeof window.setTrackerDisplaySeconds === 'function') {
        window.setTrackerDisplaySeconds(rowTotal);
      }
    } catch (err) {
      console.warn('⚠️ [MONTHLY-REPORT] Could not raise today tracked floor:', err?.message || err);
    }
  }

  /** Render the daily activity bar chart */
  _renderMonthlyDailyChart(reportData) {
    const container = document.getElementById('mrDailyChart');
    if (!container) return;

    const daily = reportData?.dailyBreakdown || [];
    if (daily.length === 0) {
      container.innerHTML = '<div style="color: #94a3b8; font-size: 13px; text-align: center; width: 100%; padding: 20px;">No daily data</div>';
      return;
    }

    // Find max seconds for scaling
    const maxSeconds = Math.max(...daily.map(d => d.totalSeconds), 1);
    // Pacific work calendar — matches daily totals and session dates
    const todayStr = this._localDateStr();

    let html = '';
    daily.forEach(day => {
      const heightPct = Math.max(2, (day.totalSeconds / maxSeconds) * 100);
      const isToday = day.date === todayStr;
      const isZero = day.totalSeconds === 0;
      const dayNum = parseInt(day.date.split('-')[2], 10);
      const tooltip = `${day.dayName} ${dayNum}: ${this.formatReportDuration(day.totalSeconds)}`;
      html += `
        <div class="mr-day-bar-wrapper">
          <div class="mr-day-bar ${isToday ? 'today' : ''} ${isZero ? 'zero' : ''}"
               style="height: ${isZero ? '2px' : heightPct + '%'};"
               data-tooltip="${tooltip}"></div>
          <div class="mr-day-label ${isToday ? 'today' : ''}">${dayNum}</div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  /** Render the weekly breakdown rows */
  _renderMonthlyWeeklyBreakdown(reportData) {
    const container = document.getElementById('mrWeeklyBreakdown');
    if (!container) return;

    const weeks = this._filterVisibleWeeks(reportData?.weeklyBreakdown || []);
    if (weeks.length === 0) {
      container.innerHTML = '<div style="color: #94a3b8; font-size: 13px;">No tracked time yet this month. Start a timer and your weekly totals will appear here.</div>';
      return;
    }

    const maxTime = Math.max(...weeks.map((w) => w.totalTime), 1);

    let html = '';
    weeks.forEach((week) => {
      const { title, range, isCurrent } = this._getWeekDisplayLabel(week.weekStart, week.weekEnd);
      const pct = week.totalTime > 0 ? Math.max(8, Math.round((week.totalTime / maxTime) * 100)) : 0;
      const durationLabel = this.formatReportDuration(week.totalTime);
      const emptyHint = week.totalTime === 0
        ? '<div class="mr-week-label-range">No time tracked yet</div>'
        : '';

      html += `
        <div class="mr-week-row${isCurrent ? ' is-current' : ''}">
          <div class="mr-week-label">
            <div class="mr-week-label-title">${this._escapeHtml(title)}</div>
            <div class="mr-week-label-range">${this._escapeHtml(range)}</div>
            ${emptyHint}
          </div>
          <div class="mr-week-bar-track" title="${durationLabel} tracked this week">
            <div class="mr-week-bar-fill" style="width: ${pct}%;"></div>
          </div>
          <div class="mr-week-value">${durationLabel}</div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  /** Render top projects breakdown */
  _renderMonthlyProjectBreakdown(reportData) {
    const container = document.getElementById('mrProjectBreakdown');
    if (!container) return;

    const projects = reportData?.projectBreakdown || [];
    if (projects.length === 0) {
      container.innerHTML = '<div style="color: #94a3b8; font-size: 13px;">No project data</div>';
      return;
    }

    const totalSeconds = projects.reduce((sum, p) => sum + p.totalSeconds, 0) || 1;
    const maxSeconds = projects[0]?.totalSeconds || 1;

    let html = '';
    projects.slice(0, 5).forEach((proj, idx) => {
      const pct = Math.round((proj.totalSeconds / maxSeconds) * 100);
      const share = Math.round((proj.totalSeconds / totalSeconds) * 100);

      html += `
        <div class="mr-project-row">
          <div class="mr-project-rank">${idx + 1}</div>
          <div class="mr-project-info">
            <div class="mr-project-name">${this._escapeHtml(proj.projectName)}</div>
            <div class="mr-project-bar-track">
              <div class="mr-project-bar-fill color-${idx % 5}" style="width: ${pct}%;"></div>
            </div>
          </div>
          <div class="mr-project-stats">
            <strong>${this.formatReportDuration(proj.totalSeconds)}</strong> (${share}%)
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  /** Render recent sessions list */
  _renderMonthlySessionList(reportData) {
    const container = document.getElementById('mrSessionList');
    if (!container) return;

    const sessions = reportData?.sessions || [];
    if (sessions.length === 0) {
      container.innerHTML = '<div style="color: #94a3b8; font-size: 13px; text-align: center; padding: 16px;">No sessions this month</div>';
      return;
    }

    let listedSeconds = 0;
    let html = '';
    sessions.forEach((session) => {
      const durationSec = session.durationSeconds || 0;
      listedSeconds += durationSec;
      const dateStr = formatWorkDateShort(session.startTime);
      const startTimeStr = formatWorkTime(session.startTime, { hour12: false });
      let endTimeStr = '--:--';
      if (session.endTime) {
        endTimeStr = formatWorkTime(session.endTime, { hour12: false });
      }
      const durationStr = this.formatReportDuration(durationSec);
      const isActive = session.status === 'active';

      html += `
        <div class="mr-session-row">
          <div class="mr-session-date">${dateStr}</div>
          <div class="mr-session-project">${this._escapeHtml(session.projectName)}</div>
          <div class="mr-session-time">${startTimeStr} – ${endTimeStr}</div>
          <div class="mr-session-duration">${durationStr}</div>
          <div class="mr-session-status ${isActive ? 'active' : 'completed'}">
            <span class="mr-session-status-dot"></span>
            ${isActive ? 'Active' : 'Done'}
          </div>
        </div>
      `;
    });

    const monthTotal = reportData?.totalSeconds || 0;
    const totalsMatch = listedSeconds === monthTotal;
    const footerNote = totalsMatch
      ? `${sessions.length} session${sessions.length === 1 ? '' : 's'} · listed durations total <strong>${this.formatReportDuration(listedSeconds)}</strong>`
      : `${sessions.length} session${sessions.length === 1 ? '' : 's'} shown · listed <strong>${this.formatReportDuration(listedSeconds)}</strong> of <strong>${this.formatReportDuration(monthTotal)}</strong> month total`;

    html += `<div class="mr-session-footer">${footerNote}</div>`;
    container.innerHTML = html;
  }

  /** Simple HTML escape helper */
  _escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
// Export for use in main renderer
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UIManager;
} 