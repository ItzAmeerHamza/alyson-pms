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
    this.supabase = dependencies.supabase;
    this.config = dependencies.config;
    this.getInterval = dependencies.getInterval;
    this.windowUIManager = dependencies.windowUIManager;
    
    this.notificationInterval = null;
    this.appSettings = dependencies.appSettings || { notification_frequency_seconds: 30 };
    
    console.log('✅ NotificationManager initialized');
  }

  /**
   * Start checking for notifications at regular intervals
   */
  startNotificationChecking() {
    if (this.notificationInterval) {
      clearInterval(this.notificationInterval);
    }
    
    console.log(`🔔 Starting notification checking every ${this.appSettings.notification_frequency_seconds}s`);
    
    this.notificationInterval = setInterval(async () => {
      await this.checkNotifications();
    }, this.getInterval('NOTIFICATIONS'));
    
    // PERFORMANCE OPTIMIZATION: Register interval with cleanup registry
    cleanupRegistry.registerInterval(this.notificationInterval, 'Notification Checking');
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
   * Check for new notifications and display them
   */
  async checkNotifications() {
    try {
      const { data: notifications } = await this.supabase
        .from('notifications')
        .select('*')
        .eq('user_id', this.config.user_id)
        .eq('read', false)
        .order('created_at', { ascending: false });

      if (notifications && notifications.length > 0) {
        // Update tray badge
        this.tray.setTitle(`${notifications.length}`);
        
        for (const notification of notifications) {
          this.showTrayNotification(notification.message, notification.type);
          
          // Mark as read
          await this.supabase
            .from('notifications')
            .update({ read: true })
            .eq('id', notification.id);
        }
        
        // Clear badge after showing notifications
        setTimeout(() => this.tray.setTitle(''), 5000);
      }
    } catch (error) {
      console.error('❌ Notification check failed:', error);
    }
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