/**
 * NOTIFICATION MANAGER MODULE
 * 
 * Manages all notification-related functionality including:
 * - Checking for new notifications from the server
 * - Displaying tray notifications to users
 * - Managing notification intervals and cleanup
 * - Updating tray badge counts
 * 
 * Part of TimeFlow Desktop Agent modular refactoring
 */

const cleanupRegistry = require('../core/cleanup-registry');

class NotificationManager {
  constructor(dependencies = {}) {
    this.tray = dependencies.tray;
    this.config = dependencies.config;
    this.getInterval = dependencies.getInterval;
    this.windowUIManager = dependencies.windowUIManager;
    
    this.notificationInterval = null;
    this.appSettings = dependencies.appSettings || { notification_frequency_seconds: 30 };
    
    console.log('✅ NotificationManager initialized');
  }

  /**
   * No-op: the inbox this polled was the Supabase `notifications` table, which has no
   * RDS read action. Nothing is scheduled so we do not burn a timer on an empty poll.
   */
  startNotificationChecking() {
    if (this.notificationInterval) {
      clearInterval(this.notificationInterval);
      this.notificationInterval = null;
    }

    console.log('🔔 [NOTIFICATIONS] Server-side inbox unavailable (no RDS equivalent) — polling disabled');
  }

  /**
   * Stop notification checking
   */
  stopNotificationChecking() {
    if (this.notificationInterval) {
      clearInterval(this.notificationInterval);
      this.notificationInterval = null;
    }
  }

  /**
   * Always empty: server-pushed notifications lived in the Supabase `notifications`
   * table and there is no RDS action to read or acknowledge them. Locally raised
   * notifications still go out through showTrayNotification().
   */
  async checkNotifications() {
    if (!this._inboxUnavailableWarned) {
      this._inboxUnavailableWarned = true;
      console.warn('⚠️ [NOTIFICATIONS] notifications table has no RDS equivalent — no server notifications will be shown');
    }
    return [];
  }

  /**
   * Show a tray notification to the user
   * @param {string} message - The notification message
   * @param {string} type - The notification type ('info', 'warning', 'error')
   */
  showTrayNotification(message, type = 'info') {
    return this.windowUIManager?.showNotification('TimeFlow', message, type);
  }

  /**
   * Initialize the notification manager
   */
  async initialize() {
    try {
      console.log('🔔 NotificationManager initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ NotificationManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Shutdown the notification manager and cleanup resources
   */
  async shutdown() {
    try {
      this.stopNotificationChecking();
      console.log('🔔 NotificationManager shutdown complete');
    } catch (error) {
      console.error('❌ NotificationManager shutdown failed:', error);
    }
  }
}

module.exports = NotificationManager;