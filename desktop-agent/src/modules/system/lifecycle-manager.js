/**
 * SYSTEM LIFECYCLE MANAGER MODULE
 * 
 * Manages system suspend/resume/shutdown events and emergency cleanup
 * for the TimeFlow desktop agent.
 * 
 * Part of TimeFlow Desktop Agent Phase 7 refactoring
 */

class SystemLifecycleManager {
  constructor(dependencies = {}) {
    this.isTracking = dependencies.isTracking;
    this.isPaused = dependencies.isPaused;
    this.currentSession = dependencies.currentSession;
    this.stopTracking = dependencies.stopTracking;
    this.resumeTracking = dependencies.resumeTracking;
    this.clearAllIntervals = dependencies.clearAllIntervals;
    this.saveSystemState = dependencies.saveSystemState;
    this.savePendingData = dependencies.savePendingData;
    this.showTrayNotification = dependencies.showTrayNotification;
    this.showResumeConfirmation = dependencies.showResumeConfirmation;
    
    this.systemSuspended = false;
    this.suspendTime = null;
    
    console.log('✅ SystemLifecycleManager initialized');
  }

  /**
   * Handle system suspend (laptop closed, sleep mode)
   */
  handleSystemSuspend() {
    this.systemSuspended = true;
    this.suspendTime = Date.now();
    
    if (this.isTracking && !this.isPaused) {
      console.log('🛑 System suspended (laptop closed) - stopping tracking completely');
      this.stopTracking();
    }
    
    // Clear all intervals and timeouts to prevent background activity
    this.clearAllIntervals();
    
    // Save current state
    this.saveSystemState();
    
    this.showTrayNotification('Tracking stopped - laptop closed/system suspended', 'info');
  }

  /**
   * Handle system resume (laptop opened, wake from sleep)
   */
  handleSystemResume() {
    const suspendDuration = this.suspendTime ? Date.now() - this.suspendTime : 0;
    const suspendMinutes = Math.round(suspendDuration / 60000);
    
    console.log(`⏱️ System was suspended for ${suspendMinutes} minutes`);
    
    this.systemSuspended = false;
    this.suspendTime = null;
    
    // Check if we should resume tracking
    if (this.isPaused && this.currentSession) {
      // Auto-resume if suspended for less than 30 minutes
      if (suspendMinutes < 30) {
        console.log('🔄 Auto-resuming tracking after short suspend');
        setTimeout(() => {
          this.resumeTracking();
        }, 2000); // Give system time to fully wake up
      } else {
        console.log('❓ Long suspend detected, showing resume confirmation');
        this.showResumeConfirmation(suspendMinutes);
      }
    }
    
    this.showTrayNotification(`System resumed after ${suspendMinutes} minutes`, 'info');
  }

  /**
   * Handle system shutdown
   */
  handleSystemShutdown() {
    console.log('🔴 System shutdown detected');
    
    // CRITICAL FIX: Force memory cleanup before shutdown
    this.emergencyMemoryCleanup();
    
    if (this.isTracking) {
      console.log('🛑 Stopping tracking due to system shutdown');
      this.stopTracking();
    }
    
    // Save all pending data
    this.savePendingData();
    
    // Clear all intervals
    this.clearAllIntervals();
  }

  /**
   * Emergency memory cleanup function
   */
  emergencyMemoryCleanup() {
    console.log('🚨 Emergency memory cleanup started');
    
    try {
      // Force immediate garbage collection
      if (global.gc) {
        global.gc();
        console.log('✅ Emergency garbage collection completed');
      }
      
      // Clear large objects and arrays
      if (global.activityQueue) {
        global.activityQueue.length = 0;
      }
      if (global.screenshotBuffer) {
        global.screenshotBuffer = null;
      }
      if (global.retryAttempts) {
        global.retryAttempts.clear();
      }
      
      // Clear any remaining intervals
      this.clearAllIntervals();
      
      console.log('✅ Emergency memory cleanup completed');
      
    } catch (error) {
      console.error('❌ Emergency memory cleanup failed:', error);
    }
  }

  /**
   * Get current system state
   */
  getSystemState() {
    return {
      systemSuspended: this.systemSuspended,
      suspendTime: this.suspendTime,
      suspendDuration: this.suspendTime ? Date.now() - this.suspendTime : 0
    };
  }

  /**
   * Check if system is currently suspended
   */
  isSystemSuspended() {
    return this.systemSuspended;
  }

  /**
   * Get suspend duration in minutes
   */
  getSuspendDurationMinutes() {
    if (!this.suspendTime) return 0;
    return Math.round((Date.now() - this.suspendTime) / 60000);
  }

  /**
   * Initialize the system lifecycle manager
   */
  async initialize() {
    try {
      console.log('🔄 SystemLifecycleManager initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ SystemLifecycleManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Shutdown the system lifecycle manager
   */
  async shutdown() {
    try {
      this.handleSystemShutdown();
      console.log('🔄 SystemLifecycleManager shutdown complete');
    } catch (error) {
      console.error('❌ SystemLifecycleManager shutdown failed:', error);
    }
  }
}

module.exports = SystemLifecycleManager;