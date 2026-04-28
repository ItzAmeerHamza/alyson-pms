const { EventEmitter } = require('events');

/**
 * Centralized event bus for the desktop agent.
 * Replaces direct coupling between managers with typed pub/sub.
 *
 * Events:
 *   tracking:started   { userId, timeLogId }
 *   tracking:stopped   { userId, timeLogId, duration }
 *   app:changed        { appName, windowTitle, pid }
 *   url:changed        { url, domain, browser, title }
 *   idle:started       { idleSeconds }
 *   idle:ended         { idleDuration }
 *   screenshot:taken   { filePath, userId }
 *   input:activity     { type: 'mouse'|'keyboard', timestamp }
 *   sync:completed     { table, count }
 *   error:fatal        { module, error }
 */
class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
    this._owners = new Map();
    this._started = false;
  }

  start() {
    if (this._started) return;
    this._started = true;
    console.log('[EventBus] Started');
  }

  shutdown() {
    if (!this._started) return;
    this._started = false;
    this.removeAllListeners();
    this._owners.clear();
    console.log('[EventBus] Shutdown');
  }

  /**
   * Subscribe with owner tracking for cleanup.
   * @param {string} owner - The name of the subscribing manager
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  subscribe(owner, event, handler) {
    if (!this._owners.has(owner)) {
      this._owners.set(owner, []);
    }
    this._owners.get(owner).push({ event, handler });
    this.on(event, handler);
  }

  /**
   * Remove all listeners registered by a specific owner.
   * Called during manager shutdown to prevent leaks.
   */
  unsubscribeAll(owner) {
    const subs = this._owners.get(owner) || [];
    for (const { event, handler } of subs) {
      this.removeListener(event, handler);
    }
    this._owners.delete(owner);
  }
}

const eventBus = new EventBus();
module.exports = { eventBus, EventBus };
