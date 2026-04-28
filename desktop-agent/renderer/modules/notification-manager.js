class NotificationManager {
  constructor() {
    this.notificationQueue = [];
    this.currentNotification = null;
    this.notificationTimeout = null;
    
    this.setupNotificationSystem();
  }

  setupNotificationSystem() {
    // Create notification container if it doesn't exist
    if (!document.getElementById('notificationContainer')) {
      this.createNotificationContainer();
    }
  }

  createNotificationContainer() {
    const container = document.createElement('div');
    container.id = 'notificationContainer';
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      max-width: 400px;
      pointer-events: none;
    `;
    document.body.appendChild(container);
  }

  showNotification(message, type = 'info', duration = 3000) {
    if (this.currentNotification) {
      this.notificationQueue.push({ message, type, duration });
      return;
    }

    this.displayNotification(message, type, duration);
  }

  displayNotification(message, type, duration) {
    const container = document.getElementById('notificationContainer');
    if (!container) {
      console.log('📢 Notification (no container):', message);
      return;
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
      background: ${this.getNotificationColor(type)};
      color: white;
      padding: 16px 20px;
      border-radius: 8px;
      margin-bottom: 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transform: translateX(100%);
      transition: transform 0.3s ease, opacity 0.3s ease;
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 14px;
      font-weight: 500;
      position: relative;
      overflow: hidden;
    `;

    // Add icon based on type
    const icon = this.getNotificationIcon(type);
    notification.innerHTML = `
      <span style="font-size: 16px; flex-shrink: 0;">${icon}</span>
      <span style="flex: 1;">${message}</span>
      <button class="notification-close" style="
        background: none;
        border: none;
        color: white;
        font-size: 18px;
        cursor: pointer;
        padding: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0.7;
        transition: opacity 0.2s;
      ">×</button>
    `;

    // Add progress bar for timed notifications
    if (duration > 0) {
      const progressBar = document.createElement('div');
      progressBar.style.cssText = `
        position: absolute;
        bottom: 0;
        left: 0;
        height: 3px;
        background: rgba(255, 255, 255, 0.3);
        width: 100%;
        transform-origin: left;
        animation: notificationProgress ${duration}ms linear forwards;
      `;
      notification.appendChild(progressBar);

      // Add CSS animation
      if (!document.getElementById('notificationStyles')) {
        const style = document.createElement('style');
        style.id = 'notificationStyles';
        style.textContent = `
          @keyframes notificationProgress {
            from { transform: scaleX(1); }
            to { transform: scaleX(0); }
          }
        `;
        document.head.appendChild(style);
      }
    }

    // Add to container
    container.appendChild(notification);
    this.currentNotification = notification;

    // Animate in
    requestAnimationFrame(() => {
      notification.style.transform = 'translateX(0)';
    });

    // Add close button listener
    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.addEventListener('click', () => {
      this.hideNotification(notification);
    });

    // Auto-hide after duration
    if (duration > 0) {
      this.notificationTimeout = setTimeout(() => {
        this.hideNotification(notification);
      }, duration);
    }

    console.log(`📢 ${type.toUpperCase()}: ${message}`);
  }

  hideNotification(notification) {
    if (!notification || !notification.parentNode) return;

    // Clear timeout
    if (this.notificationTimeout) {
      clearTimeout(this.notificationTimeout);
      this.notificationTimeout = null;
    }

    // Animate out
    notification.style.transform = 'translateX(100%)';
    notification.style.opacity = '0';

    // Remove after animation
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
      
      // Clear current notification
      if (this.currentNotification === notification) {
        this.currentNotification = null;
      }

      // Show next notification in queue
      if (this.notificationQueue.length > 0) {
        const next = this.notificationQueue.shift();
        setTimeout(() => {
          this.displayNotification(next.message, next.type, next.duration);
        }, 100);
      }
    }, 300);
  }

  getNotificationColor(type) {
    const colors = {
      'success': '#10b981',
      'error': '#ef4444',
      'warning': '#f59e0b',
      'info': '#3b82f6'
    };
    return colors[type] || colors.info;
  }

  getNotificationIcon(type) {
    const icons = {
      'success': '✅',
      'error': '❌',
      'warning': '⚠️',
      'info': 'ℹ️'
    };
    return icons[type] || icons.info;
  }

  // Legacy method for compatibility
  showError(message) {
    this.showNotification(message, 'error');
  }

  showSuccess(message) {
    this.showNotification(message, 'success');
  }

  showWarning(message) {
    this.showNotification(message, 'warning');
  }

  showInfo(message) {
    this.showNotification(message, 'info');
  }

  // Clear all notifications
  clearAll() {
    const container = document.getElementById('notificationContainer');
    if (container) {
      container.innerHTML = '';
    }
    
    this.notificationQueue = [];
    this.currentNotification = null;
    
    if (this.notificationTimeout) {
      clearTimeout(this.notificationTimeout);
      this.notificationTimeout = null;
    }
  }

  // System notification (using Electron's Notification API if available)
  showSystemNotification(title, body, icon = null) {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const notification = new Notification(title, {
        body: body,
        icon: icon,
        silent: false
      });

      setTimeout(() => {
        notification.close();
      }, 3000);

      return notification;
    } else {
      // Fallback to in-app notification
      this.showNotification(`${title}: ${body}`, 'info');
    }
  }

  // Request notification permission
  async requestNotificationPermission() {
    if (typeof Notification !== 'undefined') {
      if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
      }
      return Notification.permission === 'granted';
    }
    return false;
  }
}

// Export for use in main renderer
if (typeof module !== 'undefined' && module.exports) {
  module.exports = NotificationManager;
} 