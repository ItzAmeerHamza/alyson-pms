/**
 * App Detection UI Module
 * 
 * Handles renderer-side UI updates for app detection
 * Implements the standardized IPC contract and UI requirements
 */

class AppDetectionUI {
  constructor(ipcRenderer) {
    this.ipcRenderer = ipcRenderer;
    
    this.status = 'idle';
    this.currentApp = null;
    this.lastUpdateTime = null;
    this.isPermissionModalOpen = false;
    
    this._setupIpcListeners();
    this._setupUI();
  }

  /**
   * Setup IPC listeners for app detection events
   */
  _setupIpcListeners() {
    // Main → Renderer: App detection events (new unified format)
    this.ipcRenderer.on('appDetection:event', (event, payload) => {
      console.log('📱 [APP-UI] Detection event:', payload);
      this._handleAppEvent(payload);
    });

    // Main → Renderer: Legacy app-detected events (backward compatibility)
    this.ipcRenderer.on('app-detected', (event, appData) => {
      console.log('📱 [APP-UI] Legacy app detected:', appData);
      this._handleLegacyAppEvent(appData);
    });

    // Main → Renderer: Status updates
    this.ipcRenderer.on('appDetection:status', (event, statusData) => {
      console.log('📱 [APP-UI] Status update:', statusData);
      this._handleStatusUpdate(statusData);
    });

    // Main → Renderer: Permission guidance
    this.ipcRenderer.on('appDetection:permissionGuidance', (event, guidance) => {
      console.log('🔒 [APP-UI] Permission guidance:', guidance);
      this._showPermissionGuidance(guidance);
    });

    // Main → Renderer: Permission instructions
    this.ipcRenderer.on('appDetection:permissionInstructions', (event, instructions) => {
      console.log('📋 [APP-UI] Permission instructions:', instructions);
      this._showPermissionInstructions(instructions);
    });

    // Main → Renderer: Permissions granted
    this.ipcRenderer.on('appDetection:permissionsGranted', (event, data) => {
      console.log('✅ [APP-UI] Permissions granted');
      this._handlePermissionsGranted();
    });

    console.log('✅ [APP-UI] IPC listeners setup');
  }

  /**
   * Setup UI elements and event handlers
   */
  _setupUI() {
    // Find or create UI elements
    this._ensureUIElements();
    
    // Setup manual refresh button
    const refreshButton = document.getElementById('appDetectionRefresh');
    if (refreshButton) {
      refreshButton.addEventListener('click', () => this._refreshAppDetection());
    }

    // Setup clear button  
    const clearButton = document.getElementById('appDetectionClear');
    if (clearButton) {
      clearButton.addEventListener('click', () => this._clearAppHistory());
    }

    console.log('✅ [APP-UI] UI elements setup');
  }

  /**
   * Ensure required UI elements exist
   */
  _ensureUIElements() {
    // Status badge
    if (!document.getElementById('appDetectionStatus')) {
      const statusElement = document.createElement('div');
      statusElement.id = 'appDetectionStatus';
      statusElement.className = 'app-detection-status badge idle';
      statusElement.textContent = 'Idle';
      
      const container = document.querySelector('.app-detection-header') || 
                       document.querySelector('#app-detection-container');
      if (container) {
        container.prepend(statusElement);
      }
    }

    // Current app display
    if (!document.getElementById('currentApp')) {
      const currentAppElement = document.createElement('div');
      currentAppElement.id = 'currentApp';
      currentAppElement.textContent = 'No application detected';
    }

    // Current window display
    if (!document.getElementById('currentWindow')) {
      const currentWindowElement = document.createElement('div');
      currentWindowElement.id = 'currentWindow';
      currentWindowElement.textContent = '---';
    }

    // Last updated display
    if (!document.getElementById('appLastUpdated')) {
      const lastUpdatedElement = document.createElement('div');
      lastUpdatedElement.id = 'appLastUpdated';
      lastUpdatedElement.className = 'last-updated';
      lastUpdatedElement.textContent = '---';
    }

    // Real-time detection list
    if (!document.getElementById('realtimeAppList')) {
      const listElement = document.createElement('div');
      listElement.id = 'realtimeAppList';
      listElement.className = 'realtime-app-list';
    }
  }

  /**
   * Handle new unified app detection events
   */
  _handleAppEvent(payload) {
    this.currentApp = {
      name: payload.appName,
      title: payload.windowTitle,
      bundleId: payload.bundleId,
      source: payload.source,
      timestamp: payload.ts,
      sequence: payload.seq
    };
    
    this.lastUpdateTime = new Date(payload.ts);
    
    // Update UI elements
    this._updateCurrentAppDisplay();
    this._updateLastUpdatedDisplay();
    this._addToRealtimeList(payload);
    
    // Update status if needed
    if (this.status === 'idle' || this.status === 'permission_needed') {
      this._updateStatus('running');
    }
  }

  /**
   * Handle legacy app-detected events (backward compatibility)
   */
  _handleLegacyAppEvent(appData) {
    // Convert to new format
    const payload = {
      appName: appData.name,
      windowTitle: appData.title,
      bundleId: appData.bundleId,
      source: appData.source || 'legacy',
      ts: appData.timestamp ? new Date(appData.timestamp).getTime() : Date.now(),
      seq: appData.seq || 0,
      type: appData.type || 'change'
    };
    
    this._handleAppEvent(payload);
  }

  /**
   * Handle status updates from main process
   */
  _handleStatusUpdate(statusData) {
    this._updateStatus(statusData.status);
    
    // Handle specific status types
    switch (statusData.status) {
      case 'permission_needed':
        this._showPermissionNeeded(statusData);
        break;
        
      case 'error':
        this._showError(statusData.error || 'Unknown error');
        break;
        
      case 'backoff':
        this._showBackoff(statusData.backoffMs);
        break;
        
      case 'idle':
        this._showIdleMessage();
        break;
    }
  }

  /**
   * Update status badge and display
   */
  _updateStatus(newStatus) {
    this.status = newStatus;
    
    const statusElement = document.getElementById('appDetectionStatus');
    if (statusElement) {
      statusElement.className = `app-detection-status badge ${newStatus}`;
      
      const statusText = {
        'idle': 'Idle',
        'running': 'Active',
        'permission_needed': 'Permissions Required',
        'error': 'Error',
        'backoff': 'Retrying...'
      };
      
      statusElement.textContent = statusText[newStatus] || newStatus;
    }
  }

  /**
   * Update current app display elements
   */
  _updateCurrentAppDisplay() {
    const currentAppElement = document.getElementById('currentApp');
    const currentWindowElement = document.getElementById('currentWindow');
    
    if (currentAppElement && this.currentApp) {
      currentAppElement.textContent = this.currentApp.name || 'Unknown Application';
    }
    
    if (currentWindowElement && this.currentApp) {
      currentWindowElement.textContent = this.currentApp.title || 'No Window Title';
    }
  }

  /**
   * Update last updated timestamp
   */
  _updateLastUpdatedDisplay() {
    const lastUpdatedElement = document.getElementById('appLastUpdated');
    if (lastUpdatedElement && this.lastUpdateTime) {
      lastUpdatedElement.textContent = `Last updated: ${this.lastUpdateTime.toLocaleTimeString()}`;
    }
  }

  /**
   * Add app to real-time detection list
   */
  _addToRealtimeList(payload) {
    const listElement = document.getElementById('realtimeAppList');
    if (!listElement) return;
    
    // Create list item
    const item = document.createElement('div');
    item.className = 'realtime-app-item';
    item.innerHTML = `
      <div class="app-info">
        <span class="app-name">${payload.appName}</span>
        <span class="window-title">${payload.windowTitle || ''}</span>
      </div>
      <div class="app-meta">
        <span class="timestamp">${new Date(payload.ts).toLocaleTimeString()}</span>
        <span class="source">${payload.source}</span>
        <span class="type ${payload.type}">${payload.type}</span>
      </div>
    `;
    
    // Add to top of list
    listElement.prepend(item);
    
    // Limit list size
    const maxItems = 50;
    while (listElement.children.length > maxItems) {
      listElement.removeChild(listElement.lastChild);
    }
  }

  /**
   * Show permission guidance modal
   */
  _showPermissionGuidance(guidance) {
    if (this.isPermissionModalOpen) return;
    
    this.isPermissionModalOpen = true;
    
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'permission-modal-overlay';
    modal.innerHTML = `
      <div class="permission-modal">
        <div class="permission-header">
          <h3>🔒 Permission Required</h3>
        </div>
        <div class="permission-content">
          <p>${guidance.message}</p>
          ${guidance.missingPermissions.map(p => 
            `<div class="missing-permission">• ${p.charAt(0).toUpperCase() + p.slice(1)} access</div>`
          ).join('')}
        </div>
        <div class="permission-actions">
          ${guidance.actions.map(action => 
            `<button class="permission-action ${action.primary ? 'primary' : 'secondary'}" 
                     data-action="${action.action}">
               ${action.label}
             </button>`
          ).join('')}
        </div>
      </div>
    `;
    
    // Add event listeners
    modal.querySelectorAll('.permission-action').forEach(button => {
      button.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        this._handlePermissionAction(action);
        this._closePermissionModal(modal);
      });
    });
    
    document.body.appendChild(modal);
  }

  /**
   * Handle permission action
   */
  async _handlePermissionAction(action) {
    try {
      const result = await this.ipcRenderer.invoke('appDetection:permissionAction', action);
      if (!result.success) {
        console.error('❌ [APP-UI] Permission action failed:', result.error);
      }
    } catch (error) {
      console.error('❌ [APP-UI] Permission action error:', error);
    }
  }

  /**
   * Close permission modal
   */
  _closePermissionModal(modal) {
    if (modal && modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }
    this.isPermissionModalOpen = false;
  }

  /**
   * Show permission instructions
   */
  _showPermissionInstructions(instructions) {
    console.log('📋 [APP-UI] Instructions:', instructions);
    
    // Could display in a notification or temporary banner
    // For now, just log to console
  }

  /**
   * Handle permissions granted
   */
  _handlePermissionsGranted() {
    // Close any open permission modals
    const modals = document.querySelectorAll('.permission-modal-overlay');
    modals.forEach(modal => this._closePermissionModal(modal));
    
    // Show success message
    this._showSuccessMessage('Permissions granted! App detection is now active.');
    
    // Refresh app detection
    this._refreshAppDetection();
  }

  /**
   * Show permission needed message
   */
  _showPermissionNeeded(statusData) {
    const currentAppElement = document.getElementById('currentApp');
    if (currentAppElement) {
      currentAppElement.textContent = 'Permission required for app detection';
    }
  }

  /**
   * Show error message
   */
  _showError(errorMessage) {
    const currentAppElement = document.getElementById('currentApp');
    if (currentAppElement) {
      currentAppElement.textContent = `Error: ${errorMessage}`;
    }
  }

  /**
   * Show backoff state
   */
  _showBackoff(backoffMs) {
    const currentAppElement = document.getElementById('currentApp');
    if (currentAppElement) {
      currentAppElement.textContent = `Retrying in ${Math.round(backoffMs / 1000)}s...`;
    }
  }

  /**
   * Show idle message
   */
  _showIdleMessage() {
    const currentAppElement = document.getElementById('currentApp');
    if (currentAppElement) {
      currentAppElement.textContent = 'Start tracking to see app activity';
    }
  }

  /**
   * Show success message
   */
  _showSuccessMessage(message) {
    // Create temporary success banner
    const banner = document.createElement('div');
    banner.className = 'success-banner';
    banner.textContent = message;
    
    document.body.appendChild(banner);
    
    setTimeout(() => {
      if (banner.parentNode) {
        banner.parentNode.removeChild(banner);
      }
    }, 3000);
  }

  /**
   * Refresh app detection manually
   */
  async _refreshAppDetection() {
    try {
      const result = await this.ipcRenderer.invoke('appDetection:getCurrentApp');
      if (result.success && result.app) {
        const now = Date.now();
        this._handleAppEvent({
          appName: result.app.name,
          windowTitle: result.app.title,
          bundleId: result.app.bundleId,
          source: 'manual',
          ts: now,
          seq: 0,
          type: 'manual'
        });
      }
    } catch (error) {
      console.error('❌ [APP-UI] Manual refresh failed:', error);
    }
  }

  /**
   * Clear app history display
   */
  _clearAppHistory() {
    const listElement = document.getElementById('realtimeAppList');
    if (listElement) {
      listElement.innerHTML = '';
    }
    
    console.log('🧹 [APP-UI] App history cleared');
  }

  /**
   * Get current UI status
   */
  getStatus() {
    return {
      status: this.status,
      currentApp: this.currentApp,
      lastUpdateTime: this.lastUpdateTime,
      isPermissionModalOpen: this.isPermissionModalOpen
    };
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AppDetectionUI;
}

// Global initialization if in renderer context
if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.ipcRenderer) {
  window.AppDetectionUI = new AppDetectionUI(window.electronAPI.ipcRenderer);
}
