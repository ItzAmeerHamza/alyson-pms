/**
 * Tracking Controller Module
 * Manages the timer lifecycle: start, stop, pause, resume
 * Extracted from main.js for modular architecture
 */

const cleanupRegistry = require('./cleanup-registry');

class TrackingController {
  constructor(config) {
    this.config = config;
    this.isTracking = false;
    this.isPaused = false;
    this.currentTimeLogId = null;
    this.currentSession = null;
    this.intervalManager = null;
    this.antiCheatDetector = null;
    this.syncManager = null;
    this.systemMonitor = null;
    this.mainWindow = null;
    
    // Callbacks
    this.onTrackingStateChange = null;
    this.onMonitoringStatusUpdate = null;
  }

  /**
   * Initialize the tracking controller with dependencies
   */
  initialize(dependencies) {
    this.intervalManager = dependencies.intervalManager;
    this.antiCheatDetector = dependencies.antiCheatDetector;
    this.syncManager = dependencies.syncManager;
    this.systemMonitor = dependencies.systemMonitor;
    this.mainWindow = dependencies.mainWindow;
    this.onTrackingStateChange = dependencies.onTrackingStateChange;
    this.onMonitoringStatusUpdate = dependencies.onMonitoringStatusUpdate;
  }

  /**
   * Disabled fallback: this opened and closed time_logs rows directly through
   * syncManager.supabaseService. It is deliberately NOT rewired to the RDS write
   * actions — TrackingManager owns session create/close, and a second writer would
   * produce duplicate payroll rows. Refuse loudly instead of inventing sessions.
   */
  async startTracking(projectId = null) {
    console.error('❌ [TRACKING-CONTROLLER] startTracking is disabled — TrackingManager owns RDS sessions');
    throw new Error(
      'TrackingController.startTracking is disabled — start sessions through TrackingManager',
    );
  }

  /**
   * Stop tracking. The remote close is TrackingManager's job (see startTracking);
   * this only tears down the local state this controller owns.
   */
  async stopTracking(reason = 'manual', details = null) {
    console.log(`🛑 Stopping tracking (reason: ${reason})`);
    
    if (!this.isTracking || !this.currentTimeLogId) {
      console.log('⚠️ Not tracking');
      return;
    }

    try {
      console.warn(
        '⚠️ [TRACKING-CONTROLLER] Local stop only — remote session close is owned by TrackingManager',
      );

      // Clear tracking state
      this.isTracking = false;
      this.isPaused = false;
      this.currentTimeLogId = null;
      this.currentSession = null;

      // Save state
      if (this.onTrackingStateChange) {
        this.onTrackingStateChange({
          isTracking: false,
          isPaused: false,
          currentTimeLogId: null,
          currentSession: null
        });
      }

      // Notify UI
      if (this.mainWindow) {
        this.mainWindow.webContents.send('tracking-stopped');
      }

      console.log('✅ Tracking stopped successfully');

    } catch (error) {
      console.error('❌ Failed to stop tracking:', error);
    }
  }

  /**
   * Pause tracking
   */
  async pauseTracking() {
    if (!this.isTracking || this.isPaused) {
      console.log('⚠️ Cannot pause - not tracking or already paused');
      return { success: false, message: 'Not tracking or already paused' };
    }

    console.log('⏸️ Pausing tracking');
    this.isPaused = true;

    // Save state
    if (this.onTrackingStateChange) {
      this.onTrackingStateChange({
        isTracking: this.isTracking,
        isPaused: true,
        currentTimeLogId: this.currentTimeLogId,
        currentSession: this.currentSession
      });
    }

    // Notify UI
    if (this.mainWindow) {
      this.mainWindow.webContents.send('tracking-paused', { reason: 'manual' });
    }

    return { success: true, status: 'paused' };
  }

  /**
   * Resume tracking
   */
  async resumeTracking() {
    if (!this.isTracking || !this.isPaused) {
      console.log('⚠️ Cannot resume - not paused');
      return { success: false, message: 'Not paused' };
    }

    console.log('▶️ Resuming tracking');
    this.isPaused = false;

    // Save state
    if (this.onTrackingStateChange) {
      this.onTrackingStateChange({
        isTracking: this.isTracking,
        isPaused: false,
        currentTimeLogId: this.currentTimeLogId,
        currentSession: this.currentSession
      });
    }

    // Notify UI
    if (this.mainWindow) {
      this.mainWindow.webContents.send('tracking-resumed', { reason: 'manual' });
    }

    return { success: true, status: 'active' };
  }

  /**
   * Get current tracking state
   */
  getState() {
    return {
      isTracking: this.isTracking,
      isPaused: this.isPaused,
      currentTimeLogId: this.currentTimeLogId,
      currentSession: this.currentSession
    };
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.isTracking) {
      this.stopTracking('app_quit');
    }
  }
}

module.exports = TrackingController;