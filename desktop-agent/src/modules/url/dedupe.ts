/**
 * URL Event Deduplication
 * Suppresses duplicate URL events within a time window
 */

import { UrlEvent } from './types';

export interface DedupeOptions {
  windowMs?: number;          // Time window for duplicate suppression (default 500ms)
  titleChangeWindowMs?: number; // Window for title-only changes (default 1000ms)
}

export class UrlDedupe {
  private lastByKey = new Map<string, { event: UrlEvent; key: string }>();
  private windowMs: number;
  private titleChangeWindowMs: number;
  
  constructor(options: DedupeOptions = {}) {
    this.windowMs = options.windowMs ?? 500;
    this.titleChangeWindowMs = options.titleChangeWindowMs ?? 1000;
  }
  
  /**
   * Check if an event should be emitted or suppressed
   * Returns the event if it should be emitted, null if it should be suppressed
   */
  check(e: UrlEvent): UrlEvent | null {
    const key = this.makeKey(e);
    const cached = this.lastByKey.get(key);
    
    // First event with this key
    if (!cached) {
      this.lastByKey.set(key, { event: e, key });
      return e;
    }
    
    const last = cached.event;
    const timeDiff = e.ts - last.ts;
    
    // Same URL and windowId within window - suppress
    if (timeDiff <= this.windowMs) {
      return null;
    }
    
    // Check for title-only changes
    if (e.url === last.url && 
        e.app === last.app && 
        e.windowId === last.windowId &&
        e.source === last.source &&
        timeDiff <= this.titleChangeWindowMs) {
      // Only title changed within the title change window
      return null;
    }
    
    // Update cache and emit
    this.lastByKey.set(key, { event: e, key });
    return e;
  }
  
  /**
   * Clear the cache (useful for testing or resetting state)
   */
  clear(): void {
    this.lastByKey.clear();
  }
  
  /**
   * Get cache size (useful for monitoring/debugging)
   */
  size(): number {
    return this.lastByKey.size;
  }
  
  /**
   * Clean up old entries to prevent memory leaks
   * Should be called periodically (e.g., every minute)
   */
  cleanup(maxAgeMs: number = 60000): void {
    const now = Date.now();
    const toDelete: string[] = [];
    
    for (const [key, value] of this.lastByKey.entries()) {
      if (now - value.event.ts > maxAgeMs) {
        toDelete.push(key);
      }
    }
    
    for (const key of toDelete) {
      this.lastByKey.delete(key);
    }
  }
  
  private makeKey(e: UrlEvent): string {
    // Key is combination of windowId and URL
    // This allows different windows to have the same URL without being deduplicated
    const windowId = e.windowId ?? 'no-window';
    const url = e.url ?? 'no-url';
    return `${windowId}|${url}`;
  }
}

/**
 * Create a stateless dedupe function (for simpler use cases)
 */
export function createUrlDedupe(windowMs = 500): (e: UrlEvent) => UrlEvent | null {
  const dedupe = new UrlDedupe({ windowMs });
  
  // Cleanup old entries periodically
  setInterval(() => dedupe.cleanup(), 60000);
  
  return (e: UrlEvent) => dedupe.check(e);
}

