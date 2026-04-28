/**
 * URL Capture Manager
 * Central coordinator for platform-specific URL capture
 */

import { EventEmitter } from 'events';
import { platform } from 'os';
import { IUrlCapture, UrlEvent, StopFn } from './types';
import { normalizeUrlEvent, isInternalUrl, extractDomain } from './normalize';
import { UrlDedupe } from './dedupe';

// Import platform adapters
import { MacOSUrlCapture } from '../../platform/darwin/urlCapture';
import { WindowsUrlCapture } from '../../platform/win32/urlCapture';
import { LinuxUrlCapture } from '../../platform/linux/urlCapture';

export interface UrlCaptureConfig {
  dedupeWindowMs?: number;
  titleChangeWindowMs?: number;
  pollIntervalMs?: number;
  filterInternalUrls?: boolean;
  debugLogging?: boolean;
  debounceMs?: number;         // 250–400ms recommended
  minSliceSec?: number;        // minimum duration to emit same (domain,path)
  maxEventsPerSec?: number;    // rate cap
  privacy?: { domainOnly?: boolean; redactQueryHash?: boolean };
  skipInternalUrls?: boolean;  // drop localhost, chrome://, etc.
  enabled?: boolean;           // kill-switch
  /**
   * When true, domainOnly=true implies site_url (full URL) will be NULL by design.
   * This is intentional to avoid storing PII in query/hash. Analytics must treat NULL as expected.
   */
  domainOnlyImpliesNull?: boolean;
  maxUrlLength?: number;       // guard for oversized URLs (default 2048)
}

export class UrlCaptureManager extends EventEmitter {
  private adapter: IUrlCapture | null = null;
  private dedupe: UrlDedupe;
  private stopFn: StopFn | null = null;
  private config: UrlCaptureConfig;
  private isRunning = false;
  private eventCount = 0;
  private suppressedCount = 0;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private lastEmitByWindow: Map<string, { lastUrl: string | null; lastPath: string | null; lastTs: number }>; 
  private recentEmits: number[]; // timestamps (ms) for rate limiting
  private telemetryInterval: NodeJS.Timeout | null = null;
  private oversizeDrops: number = 0;
  private internalDrops: number = 0;
  private sourceCounts: Record<string, number> = {};
  
  constructor(config: UrlCaptureConfig = {}) {
    super();
    
    this.config = {
      dedupeWindowMs: 500,
      titleChangeWindowMs: 1000,
      pollIntervalMs: 1000,
      filterInternalUrls: false,
      debugLogging: false,
      debounceMs: 300,
      minSliceSec: 5,
      maxEventsPerSec: 1,
      privacy: { domainOnly: false, redactQueryHash: true },
      skipInternalUrls: true,
      enabled: true,
      domainOnlyImpliesNull: true,
      maxUrlLength: 2048,
      ...config
    };
    
    // Initialize dedupe
    this.dedupe = new UrlDedupe({
      windowMs: this.config.dedupeWindowMs,
      titleChangeWindowMs: this.config.titleChangeWindowMs
    });
    this.lastEmitByWindow = new Map();
    this.recentEmits = [];
    
    // Select platform adapter
    this.selectAdapter();
    
    // Setup periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.dedupe.cleanup();
    }, 60000); // Every minute
  }
  
  private selectAdapter(): void {
    const platformName = platform();
    
    switch (platformName) {
      case 'darwin':
        this.adapter = new MacOSUrlCapture();
        break;
      case 'win32':
        this.adapter = new WindowsUrlCapture();
        break;
      case 'linux':
        this.adapter = new LinuxUrlCapture();
        break;
      default:
        throw new Error(`Unsupported platform: ${platformName}`);
    }
    
    if (this.config.debugLogging) {
      console.log(`[UrlCaptureManager] Selected adapter for platform: ${platformName}`);
    }
  }
  
  /**
   * Start URL capture
   */
  start(): void {
    if (this.isRunning) {
      console.warn('[UrlCaptureManager] Already running');
      return;
    }
    if (!this.config.enabled) {
      if (this.config.debugLogging) console.log('[UrlCaptureManager] Disabled by config, not starting');
      return;
    }

    if (!this.adapter) {
      throw new Error('No adapter available');
    }
    
    this.isRunning = true;
    this.eventCount = 0;
    this.suppressedCount = 0;
    this.oversizeDrops = 0;
    this.internalDrops = 0;
    this.sourceCounts = {};
    
    if (this.config.debugLogging) {
      console.log('[UrlCaptureManager] Starting URL capture...');
    }
    
    // Start platform adapter
    this.stopFn = this.adapter.start((rawEvent) => {
      this.handleRawEvent(rawEvent);
    });

    // Periodically surface telemetry to System Monitor (once per minute)
    try {
      // Lazy require to avoid circular deps
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const systemMonitor = require('../../system/system-monitor');
      this.telemetryInterval = setInterval(() => {
        try {
          if (systemMonitor && typeof systemMonitor.sendDebugUpdate === 'function') {
            systemMonitor.sendDebugUpdate('URL', 'Pipeline telemetry', {
              enabled: this.config.enabled,
              events: this.eventCount,
              suppressed: this.suppressedCount,
              oversizeDrops: this.oversizeDrops,
              internalDrops: this.internalDrops,
              sourceCounts: this.sourceCounts,
            });
          }
        } catch {}
      }, 60000);
    } catch {}
  }
  
  /**
   * Stop URL capture
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }
    
    if (this.stopFn) {
      this.stopFn();
      this.stopFn = null;
    }
    
    this.isRunning = false;
    
    if (this.config.debugLogging) {
      console.log(`[UrlCaptureManager] Stopped. Events: ${this.eventCount}, Suppressed: ${this.suppressedCount}`);
    }

    if (this.telemetryInterval) {
      clearInterval(this.telemetryInterval);
      this.telemetryInterval = null;
    }
  }
  
  /**
   * Handle raw event from platform adapter
   */
  private handleRawEvent(rawEvent: UrlEvent): void {
    try {
      // Debug log raw event
      if (this.config.debugLogging) {
        console.log('[UrlCaptureManager] Raw event:', {
          app: rawEvent.app,
          source: rawEvent.source,
          url: rawEvent.url?.substring(0, 50) + '...',
          title: rawEvent.title?.substring(0, 50) + '...',
          confidence: rawEvent.confidence,
          placeholder: rawEvent.diagnostics?.placeholder,
        });
      }
      
      // Normalize event
      const normalized = normalizeUrlEvent(rawEvent);
      
      // Filter internal URLs if configured
      if ((this.config.filterInternalUrls || this.config.skipInternalUrls) && isInternalUrl(normalized.url)) {
        if (this.config.debugLogging) {
          console.log('[UrlCaptureManager] Filtered internal URL:', normalized.url);
        }
        this.internalDrops++;
        try { console.log(JSON.stringify({ category: 'URL', stage: 'INTERNAL_FILTER', url: normalized.url, ts: Date.now() })); } catch {}
        return;
      }
      
      // Oversize URL guard
      if (normalized.url && this.config.maxUrlLength && normalized.url.length > this.config.maxUrlLength) {
        this.oversizeDrops++;
        if (this.config.debugLogging) console.log('[UrlCaptureManager] Dropped oversize URL (> maxUrlLength)');
        try { console.log(JSON.stringify({ category: 'URL', stage: 'OVERSIZE_DROP', len: normalized.url.length, ts: Date.now() })); } catch {}
        return;
      }

      // Check for duplicates
      const deduped = this.dedupe.check(normalized);
      
      if (!deduped) {
        this.suppressedCount++;
        if (this.config.debugLogging) {
          console.log('[UrlCaptureManager] Suppressed duplicate event');
        }
        try { console.log(JSON.stringify({ category: 'URL', stage: 'DEDUPED_SUPPRESS', url: normalized.url, ts: Date.now() })); } catch {}
        return;
      }
      
      // Debounce per-window: coalesce identical (domain, path) for minSliceSec
      const windowKey = String(deduped.windowId ?? 'no-window');
      const domain = extractDomain(deduped.url);
      const path = this.extractPath(deduped.url);
      const last = this.lastEmitByWindow.get(windowKey);
      const now = Date.now();
      if (last && last.lastUrl === (deduped.url ?? null) && last.lastPath === path) {
        if ((now - last.lastTs) < (this.config.minSliceSec! * 1000)) {
          this.suppressedCount++;
          if (this.config.debugLogging) console.log('[UrlCaptureManager] Suppressed within minSlice window');
          try { console.log(JSON.stringify({ category: 'URL', stage: 'MIN_SLICE_SUPPRESS', url: deduped.url, lastTs: last.lastTs, now, minSliceSec: this.config.minSliceSec })); } catch {}
          return;
        }
      }

      // Rate limit: max N events per second (sliding window)
      this.pruneRecentEmits(now);
      if (this.recentEmits.length >= (this.config.maxEventsPerSec || 1)) {
        this.suppressedCount++;
        if (this.config.debugLogging) console.log('[UrlCaptureManager] Suppressed by rate limiter');
        try { console.log(JSON.stringify({ category: 'URL', stage: 'RATE_LIMIT_SUPPRESS', count: this.recentEmits.length, ts: now })); } catch {}
        return;
      }

      // Update last emit per window and rate window
      this.lastEmitByWindow.set(windowKey, { lastUrl: deduped.url ?? null, lastPath: path, lastTs: now });
      this.recentEmits.push(now);

      // Emit normalized and deduplicated event
      this.eventCount++;
      const src = (deduped.source || 'unknown').toLowerCase();
      this.sourceCounts[src] = (this.sourceCounts[src] || 0) + 1;
      try { console.log(JSON.stringify({ category: 'URL', stage: 'EMIT', url: deduped.url, title: deduped.title, source: deduped.source, ts: now })); } catch {}
      this.emit('url', deduped);
      
      // Also emit to specific browser events
      this.emit(`url:${deduped.source}`, deduped);
      
    } catch (error) {
      console.error('[UrlCaptureManager] Error handling event:', error);
    }
  }

  private extractPath(url: string | null): string | null {
    if (!url) return null;
    try {
      const u = new URL(url);
      if (this.config.privacy?.domainOnly) return null;
      let path = u.pathname || '/';
      if (this.config.privacy?.redactQueryHash) return path;
      const qs = u.search || '';
      const hash = u.hash || '';
      return `${path}${qs}${hash}`;
    } catch {
      return null;
    }
  }

  private pruneRecentEmits(nowMs: number): void {
    const oneSecondAgo = nowMs - 1000;
    this.recentEmits = this.recentEmits.filter(ts => ts >= oneSecondAgo);
  }
  
  /**
   * Get current statistics
   */
  getStats(): { eventCount: number; suppressedCount: number; dedupeSize: number } {
    return {
      eventCount: this.eventCount,
      suppressedCount: this.suppressedCount,
      dedupeSize: this.dedupe.size()
    };
  }
  
  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<UrlCaptureConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Update dedupe config if needed
    if (newConfig.dedupeWindowMs !== undefined || newConfig.titleChangeWindowMs !== undefined) {
      this.dedupe = new UrlDedupe({
        windowMs: this.config.dedupeWindowMs,
        titleChangeWindowMs: this.config.titleChangeWindowMs
      });
    }
    
    // Restart if running and critical config changed
    if (this.isRunning && newConfig.pollIntervalMs !== undefined) {
      this.stop();
      this.start();
    }
  }
  
  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stop();
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    this.removeAllListeners();
  }

  /**
   * Get health status
   */
  getHealthStatus(): {
    captureRate: string;
    activeWindows: number;
    pollDelay: string;
    incognitoDropped: number;
    resolvers: any;
  } {
    const stats = this.getStats();
    const now = Date.now();

    const resolverStats = (this.adapter as any)?.getResolverTelemetry?.() || null;

    const total = stats.eventCount + stats.suppressedCount;
    const captureRate = total > 0 ? (stats.eventCount / total * 100).toFixed(1) + '%' : '0%';
    const activeWindows = 1; // Assuming one window for now
    const pollDelay = 'N/A'; // No direct poll delay exposed here
    const incognitoDropped = stats.internalDrops;

    const health = {
      captureRate,
      activeWindows,
      pollDelay,
      incognitoDropped,
      resolvers: resolverStats,
    };

    return health;
  }
}

/**
 * Create a singleton instance for easy use
 */
let instance: UrlCaptureManager | null = null;

export function getUrlCaptureManager(config?: UrlCaptureConfig): UrlCaptureManager {
  if (!instance) {
    instance = new UrlCaptureManager(config);
  }
  return instance;
}

