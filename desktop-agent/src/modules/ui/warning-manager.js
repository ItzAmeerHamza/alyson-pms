const { BrowserWindow } = require('electron');
const path = require('path');

class WarningManager {
  constructor(config) {
    this.config = config;
    this.warningWindow = null;
    this.currentWarnings = [];
    this.currentWarningIndex = 0;
    this.isDisplaying = false;
    this.onProceedCallback = null;
    this.onCancelCallback = null;
    
    // Permanent warning tracking - warnings shown once are never shown again
    this.permanentWarningsShown = new Set();
    this.notificationQueue = [];
    
    // Initialize permanent tracking from database
    this.initializePermanentTracking();
  }

  /**
   * No-op: `warning_logs` was a Supabase-only table with no RDS read action, so the
   * "already shown" set cannot survive a restart. It stays in-memory for this session.
   */
  async initializePermanentTracking() {
    console.warn('⚠️ [WARNING] warning_logs has no RDS equivalent — permanent tracking is session-only');
  }

  /**
   * Always empty: active warnings came from the Supabase `get_active_warnings_for_user`
   * RPC and no backend action replaces it.
   */
  async getActiveWarnings() {
    console.warn('⚠️ [WARNING] Active warnings have no RDS equivalent — returning none');
    return [];
  }

  /**
   * Add notification to queue for display in notification area
   */
  addNotificationToQueue(notification) {
    this.notificationQueue.push({
      id: Date.now() + Math.random(),
      ...notification,
      timestamp: new Date(),
      read: false
    });
    
    console.log('📬 [NOTIFICATION] Added to queue:', notification.title);
    this.broadcastNotificationUpdate();
  }

  /**
   * Get all notifications in queue
   */
  getNotificationQueue() {
    return this.notificationQueue.slice().reverse(); // Most recent first
  }

  /**
   * Mark notification as read
   */
  markNotificationAsRead(notificationId) {
    const notification = this.notificationQueue.find(n => n.id === notificationId);
    if (notification) {
      notification.read = true;
      this.broadcastNotificationUpdate();
    }
  }

  /**
   * Clear all notifications
   */
  clearNotifications() {
    this.notificationQueue = [];
    this.broadcastNotificationUpdate();
  }

  /**
   * Broadcast notification updates to renderer
   */
  broadcastNotificationUpdate() {
    // This would be implemented to send notifications to the renderer process
    // For now, just log the update
    const unreadCount = this.notificationQueue.filter(n => !n.read).length;
    console.log(`📬 [NOTIFICATION] Queue updated: ${this.notificationQueue.length} total, ${unreadCount} unread`);
  }

  /**
   * Display warnings to user with navigation
   */
  async showWarnings(warnings, trigger = 'timer_start') {
    if (!warnings || warnings.length === 0) {
      console.log('ℹ️ [WARNING] No warnings to display');
      return { proceed: true };
    }

    return new Promise((resolve) => {
      this.currentWarnings = warnings;
      this.currentWarningIndex = 0;
      this.isDisplaying = true;

      console.log(`🚨 [WARNING] Displaying ${warnings.length} warning(s) for trigger: ${trigger}`);

      this.onProceedCallback = () => {
        this.isDisplaying = false;
        resolve({ proceed: true });
      };

      this.onCancelCallback = () => {
        this.isDisplaying = false;
        resolve({ proceed: false, cancelled: true });
      };

      this.createWarningWindow(trigger);
    });
  }

  /**
   * Create and show warning window
   */
  createWarningWindow(trigger) {
    if (this.warningWindow) {
      this.warningWindow.close();
    }

    this.warningWindow = new BrowserWindow({
      width: 500,
      height: 600,
      modal: true,
      parent: require('./main').getMainWindow(),
      resizable: false,
      alwaysOnTop: true,
      center: true,
      title: 'HR Notification',
      icon: path.join(__dirname, '..', 'assets', 'icon.png'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'warning-preload.js')
      }
    });

    // Load the warning HTML
    this.warningWindow.loadFile(path.join(__dirname, '..', 'renderer', 'warning.html'));

    // Send warning data to renderer
    this.warningWindow.webContents.once('dom-ready', () => {
      this.sendCurrentWarningToRenderer(trigger);
    });

    // Handle window close
    this.warningWindow.on('closed', () => {
      this.warningWindow = null;
      if (this.isDisplaying && this.onCancelCallback) {
        this.onCancelCallback();
      }
    });

    // Set up IPC handlers for warning interactions
    this.setupWarningIPC();
  }

  /**
   * Send current warning data to renderer
   */
  sendCurrentWarningToRenderer(trigger) {
    if (!this.warningWindow || !this.currentWarnings.length) return;

    const currentWarning = this.currentWarnings[this.currentWarningIndex];
    const warningData = {
      warning: currentWarning,
      currentIndex: this.currentWarningIndex,
      totalWarnings: this.currentWarnings.length,
      trigger: trigger,
      isLast: this.currentWarningIndex === this.currentWarnings.length - 1
    };

    this.warningWindow.webContents.send('display-warning', warningData);
  }

  /**
   * Set up IPC handlers for warning interactions
   */
  setupWarningIPC() {
    const { ipcMain } = require('electron');

    // Remove existing handlers to prevent duplicates
    ['warning-acknowledge', 'warning-dismiss', 'warning-next', 'warning-cancel'].forEach(channel => {
      try {
        ipcMain.removeAllListeners(channel);
      } catch (e) {
        // Handler might not exist
      }
    });

    // Handle acknowledge
    ipcMain.on('warning-acknowledge', async (event, data) => {
      await this.handleWarningResponse('acknowledged', data.response);
    });

    // Handle dismiss
    ipcMain.on('warning-dismiss', async (event, data) => {
      await this.handleWarningResponse('dismissed', data.response);
    });

    // Handle next warning
    ipcMain.on('warning-next', () => {
      this.showNextWarning();
    });

    // Handle cancel/close
    ipcMain.on('warning-cancel', () => {
      this.closeWarningWindow();
      if (this.onCancelCallback) {
        this.onCancelCallback();
      }
    });
  }

  /**
   * Handle user response to warning
   */
  async handleWarningResponse(action, userResponse = null) {
    const currentWarning = this.currentWarnings[this.currentWarningIndex];
    if (!currentWarning) return;

    try {
      console.log(`🚨 [WARNING] User ${action} warning: ${currentWarning.title}`);

      // Mark warning as permanently shown (never show again)
      this.permanentWarningsShown.add(currentWarning.warning_id);

      // Add to notification queue if acknowledged for later reference
      if (action === 'acknowledged') {
        this.addNotificationToQueue({
          title: 'Warning Acknowledged',
          message: `You acknowledged: ${currentWarning.title}`,
          type: 'success',
          warning_id: currentWarning.warning_id
        });
      }

      // Log the warning interaction
      await this.logWarningShown(currentWarning.warning_id, action, userResponse);

      // Move to next warning or complete
      if (this.currentWarningIndex < this.currentWarnings.length - 1) {
        this.currentWarningIndex++;
        this.sendCurrentWarningToRenderer('timer_start');
      } else {
        // All warnings handled
        this.closeWarningWindow();
        if (this.onProceedCallback) {
          this.onProceedCallback();
        }
      }
    } catch (error) {
      console.error('❌ [WARNING] Error handling warning response:', error);
      // Don't block user if logging fails
      this.showNextWarning();
    }
  }

  /**
   * Show next warning or complete
   */
  showNextWarning() {
    if (this.currentWarningIndex < this.currentWarnings.length - 1) {
      this.currentWarningIndex++;
      this.sendCurrentWarningToRenderer('timer_start');
    } else {
      this.closeWarningWindow();
      if (this.onProceedCallback) {
        this.onProceedCallback();
      }
    }
  }

  /**
   * Close warning window
   */
  closeWarningWindow() {
    if (this.warningWindow) {
      this.warningWindow.close();
      this.warningWindow = null;
    }
    this.isDisplaying = false;
  }

  /**
   * No-op: the `log_warning_shown` RPC was Supabase-only and no backend action accepts
   * these rows. The interaction is traced locally instead of being silently dropped.
   */
  async logWarningShown(warningId, action, userResponse = null) {
    console.warn(
      `⚠️ [WARNING] Cannot persist warning interaction (no RDS equivalent): ${warningId} → ${action}`,
    );
  }

  /**
   * Reset permanent tracking (only for testing/debugging purposes)
   * NOTE: This should not be called in normal operation to maintain one-time behavior
   */
  resetPermanentTracking() {
    console.log('🔄 [WARNING] RESETTING PERMANENT WARNING TRACKING - WARNINGS CAN BE SHOWN AGAIN');
    console.log('⚠️ [WARNING] This should only be used for testing/debugging purposes');
    this.permanentWarningsShown.clear();
  }

  /**
   * Check and show warnings before starting timer
   */
  async checkAndShowWarnings(trigger = 'timer_start') {
    console.log('🚨 [WARNING] Checking for warnings before timer start...');
    
    const warnings = await this.getActiveWarnings();
    
    if (warnings.length === 0) {
      console.log('✅ [WARNING] No warnings found, proceeding with timer start');
      return { proceed: true };
    }

    console.log(`🚨 [WARNING] Found ${warnings.length} warning(s), showing to user`);
    return await this.showWarnings(warnings, trigger);
  }

  /**
   * Get current display status
   */
  isDisplayingWarnings() {
    return this.isDisplaying;
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.closeWarningWindow();
    this.currentWarnings = [];
    this.currentWarningIndex = 0;
    this.isDisplaying = false;
    this.onProceedCallback = null;
    this.onCancelCallback = null;
  }
}

module.exports = WarningManager; 