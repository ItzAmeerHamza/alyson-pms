/**
 * Lightweight dependency injection container for the desktop agent.
 * Replaces global.* assignments with a structured registry.
 *
 * Usage:
 *   container.register('syncManager', syncManagerInstance);
 *   const sync = container.get('syncManager');
 *
 * During migration, managers can check container first, then fall back to global:
 *   const sync = container.get('syncManager') || global.syncManager;
 */
class ServiceContainer {
  constructor() {
    this._services = new Map();
    this._started = false;
  }

  start() {
    if (this._started) return;
    this._started = true;
    console.log('[ServiceContainer] Started');
  }

  /**
   * Register a service. Overwrites if already registered.
   */
  register(name, instance) {
    this._services.set(name, instance);
  }

  /**
   * Get a registered service. Returns undefined if not found.
   */
  get(name) {
    return this._services.get(name);
  }

  /**
   * Check if a service is registered.
   */
  has(name) {
    return this._services.has(name);
  }

  /**
   * Shut down all services that have a shutdown/destroy method.
   * Called during app quit.
   */
  async shutdown() {
    if (!this._started) return;
    this._started = false;

    const entries = Array.from(this._services.entries());
    for (const [name, service] of entries) {
      try {
        if (typeof service?.shutdown === 'function') {
          await service.shutdown();
        } else if (typeof service?.destroy === 'function') {
          await service.destroy();
        }
      } catch (err) {
        console.error(`[ServiceContainer] Error shutting down ${name}:`, err.message);
      }
    }

    this._services.clear();
    console.log('[ServiceContainer] All services shut down');
  }

  /**
   * List all registered service names (for debugging).
   */
  list() {
    return Array.from(this._services.keys());
  }
}

const container = new ServiceContainer();
module.exports = { container, ServiceContainer };
