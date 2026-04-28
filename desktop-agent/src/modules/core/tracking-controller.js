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
   * Start tracking with the given project ID
   */
  async startTracking(projectId = null) {
    console.log(`🚀 Starting tracking for project ${projectId || 'default'}`);
    
    if (this.isTracking && !this.isPaused) {
      console.log('⚠️ Already tracking');
      return;
    }

    // Resume if paused
    if (this.isPaused) {
      return this.resumeTracking();
    }

    try {
      // Validate user and project
      if (!this.config.user_id) {
        throw new Error('No user logged in');
      }

      const finalProjectId = projectId || this.config.project_id || '00000000-0000-0000-0000-000000000001';
      
      const now = new Date().toISOString();

      // Close any stale active sessions before creating a new one
      await this.syncManager.supabaseService
        .from('time_logs')
        .update({ end_time: now, status: 'completed' })
        .eq('user_id', this.config.user_id)
        .or('end_time.is.null,status.eq.active');

      const timeLogData = {
        user_id: this.config.user_id,
        project_id: finalProjectId,
        start_time: now,
        description: null,
        is_manual: false
      };

      const { data: timeLog, error } = await this.syncManager.supabaseService
        .from('time_logs')
        .insert([timeLogData])
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Update tracking state
      this.currentTimeLogId = timeLog.id;
      this.currentSession = {
        timeLogId: timeLog.id,
        projectId: finalProjectId,
        startTime: Date.now()
      };
      this.isTracking = true;
      this.isPaused = false;

      // Save state
      if (this.onTrackingStateChange) {
        this.onTrackingStateChange({
          isTracking: true,
          isPaused: false,
          currentTimeLogId: timeLog.id,
          currentSession: this.currentSession
        });
      }

      console.log(`✅ Tracking started with time log ID: ${timeLog.id}`);
      
      // Notify UI
      if (this.mainWindow) {
        this.mainWindow.webContents.send('tracking-started', this.currentSession);
      }

      // Send monitoring status update after 2 seconds
      setTimeout(() => {
        if (this.onMonitoringStatusUpdate && this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.onMonitoringStatusUpdate({
            screenshot: { status: 'ACTIVE', message: 'Screenshots scheduled' },
            urlDetection: { status: 'ACTIVE', message: 'URL monitoring active' },
            appDetection: { status: 'ACTIVE', message: 'App monitoring active' }
          });
        }
      }, 2000);

      return this.currentSession;

    } catch (error) {
      console.error('❌ Failed to start tracking:', error);
      
      this.isTracking = false;
      throw error;
    }
  }

  /**
   * Stop tracking
   */
  async stopTracking(reason = 'manual', details = null) {
    console.log(`🛑 Stopping tracking (reason: ${reason})`);
    
    if (!this.isTracking || !this.currentTimeLogId) {
      console.log('⚠️ Not tracking');
      return;
    }

    try {
      // Update time log with end time
      const { error } = await this.syncManager.supabaseService
        .from('time_logs')
        .update({
          end_time: new Date().toISOString(),
          status: 'completed'
        })
        .eq('id', this.currentTimeLogId);

      if (error) {
        console.error('Error updating time log:', error);
      }

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