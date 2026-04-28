/**
 * BrowserUrlManager (Compatibility Wrapper)
 * Thin wrapper that delegates to unified UrlCaptureManager.
 * Keeps legacy API surface without duplicate capture logic.
 */

const { EventEmitter } = require('events');

class BrowserUrlManager extends EventEmitter {
  constructor(config, _dependencies = {}) {
    super();
    this.config = config || {};

    const { UrlCaptureManager } = require('../url/UrlCaptureManager.js');
    this.urlCaptureManager = global.urlCaptureManager || new UrlCaptureManager({
      debugLogging: false
    });
    if (!global.urlCaptureManager) {
      global.urlCaptureManager = this.urlCaptureManager;
    }

    // Bridge events to legacy channel
    try {
      this.urlCaptureManager.on('url', (event) => {
        try {
          this.emit('url-detected', {
            url: event?.url || null,
            title: event?.title || '',
            browser: event?.browser || event?.source || 'unknown',
            domain: (() => { try { return event?.url ? new URL(event.url).hostname : null; } catch { return null; } })(),
            timestamp: new Date((event && event.ts) ?? Date.now()).toISOString()
          });
        } catch {}
      });
    } catch {}
  }

  initialize() {
    // Compatibility only
  }

  async startUrlCapture() {
    try { this.urlCaptureManager.start(); } catch {}
  }

  stopUrlCapture() {
    try { this.urlCaptureManager.stop(); } catch {}
  }

  // Legacy API placeholders (no-ops)
  async smartUrlCapture() { return null; }
  startActiveBrowserMonitoring() {}
  stopActiveBrowserMonitoring() {}

  getStatus() {
    return {
      enabled: !!this.urlCaptureManager?.isRunning,
      listeners: this.listenerCount('url-detected')
    };
  }

  shutdown() {
    try { this.removeAllListeners(); } catch {}
  }
}

module.exports = BrowserUrlManager;



