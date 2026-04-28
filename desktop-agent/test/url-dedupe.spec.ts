/**
 * URL Deduplication Tests
 */

import { UrlDedupe } from '../src/modules/url/dedupe';
import { UrlEvent } from '../src/modules/url/types';

describe('URL Deduplication', () => {
  let dedupe: UrlDedupe;
  
  beforeEach(() => {
    dedupe = new UrlDedupe({ windowMs: 500, titleChangeWindowMs: 1000 });
  });

  afterEach(() => {
    dedupe.clear();
  });

  describe('basic deduplication', () => {
    it('should emit first event', () => {
      const event: UrlEvent = {
        ts: Date.now(),
        app: 'Chrome',
        source: 'chrome',
        url: 'https://example.com',
        title: 'Example',
        windowId: '123',
        pid: 456
      };

      const result = dedupe.check(event);
      expect(result).toBe(event);
    });

    it('should suppress duplicate within window', () => {
      const now = Date.now();
      const event1: UrlEvent = {
        ts: now,
        app: 'Chrome',
        source: 'chrome',
        url: 'https://example.com',
        title: 'Example',
        windowId: '123',
        pid: 456
      };

      const event2: UrlEvent = {
        ...event1,
        ts: now + 100 // 100ms later, within 500ms window
      };

      expect(dedupe.check(event1)).toBe(event1);
      expect(dedupe.check(event2)).toBeNull();
    });

    it('should emit duplicate after window expires', () => {
      const now = Date.now();
      const event1: UrlEvent = {
        ts: now,
        app: 'Chrome',
        source: 'chrome',
        url: 'https://example.com',
        title: 'Example',
        windowId: '123',
        pid: 456
      };

      const event2: UrlEvent = {
        ...event1,
        ts: now + 600 // 600ms later, outside 500ms window
      };

      expect(dedupe.check(event1)).toBe(event1);
      expect(dedupe.check(event2)).toBe(event2);
    });

    it('should allow different URLs in same window', () => {
      const now = Date.now();
      const event1: UrlEvent = {
        ts: now,
        app: 'Chrome',
        source: 'chrome',
        url: 'https://example.com',
        title: 'Example',
        windowId: '123',
        pid: 456
      };

      const event2: UrlEvent = {
        ...event1,
        url: 'https://different.com',
        title: 'Different'
      };

      expect(dedupe.check(event1)).toBe(event1);
      expect(dedupe.check(event2)).toBe(event2);
    });

    it('should allow same URL in different windows', () => {
      const now = Date.now();
      const event1: UrlEvent = {
        ts: now,
        app: 'Chrome',
        source: 'chrome',
        url: 'https://example.com',
        title: 'Example',
        windowId: '123',
        pid: 456
      };

      const event2: UrlEvent = {
        ...event1,
        windowId: '456' // Different window
      };

      expect(dedupe.check(event1)).toBe(event1);
      expect(dedupe.check(event2)).toBe(event2);
    });
  });

  describe('title-only changes', () => {
    it('should suppress title-only changes within title window', () => {
      const now = Date.now();
      const event1: UrlEvent = {
        ts: now,
        app: 'Chrome',
        source: 'chrome',
        url: 'https://example.com',
        title: 'Example',
        windowId: '123',
        pid: 456
      };

      const event2: UrlEvent = {
        ...event1,
        ts: now + 800, // Within 1000ms title change window
        title: 'Example - Updated' // Only title changed
      };

      expect(dedupe.check(event1)).toBe(event1);
      expect(dedupe.check(event2)).toBeNull();
    });

    it('should emit title change after title window expires', () => {
      const now = Date.now();
      const event1: UrlEvent = {
        ts: now,
        app: 'Chrome',
        source: 'chrome',
        url: 'https://example.com',
        title: 'Example',
        windowId: '123',
        pid: 456
      };

      const event2: UrlEvent = {
        ...event1,
        ts: now + 1100, // Outside 1000ms title change window
        title: 'Example - Updated'
      };

      expect(dedupe.check(event1)).toBe(event1);
      expect(dedupe.check(event2)).toBe(event2);
    });

    it('should emit if more than title changed', () => {
      const now = Date.now();
      const event1: UrlEvent = {
        ts: now,
        app: 'Chrome',
        source: 'chrome',
        url: 'https://example.com',
        title: 'Example',
        windowId: '123',
        pid: 456
      };

      const event2: UrlEvent = {
        ...event1,
        ts: now + 800,
        title: 'Example - Updated',
        app: 'Firefox' // App changed too
      };

      expect(dedupe.check(event1)).toBe(event1);
      expect(dedupe.check(event2)).toBe(event2);
    });
  });

  describe('edge cases', () => {
    it('should handle null windowId', () => {
      const event1: UrlEvent = {
        ts: Date.now(),
        app: 'Chrome',
        source: 'chrome',
        url: 'https://example.com',
        title: 'Example',
        windowId: null,
        pid: 456
      };

      const event2: UrlEvent = {
        ...event1,
        ts: event1.ts + 100
      };

      expect(dedupe.check(event1)).toBe(event1);
      expect(dedupe.check(event2)).toBeNull();
    });

    it('should handle null URL', () => {
      const event1: UrlEvent = {
        ts: Date.now(),
        app: 'Chrome',
        source: 'chrome',
        url: null,
        title: 'New Tab',
        windowId: '123',
        pid: 456
      };

      const event2: UrlEvent = {
        ...event1,
        ts: event1.ts + 100
      };

      expect(dedupe.check(event1)).toBe(event1);
      expect(dedupe.check(event2)).toBeNull();
    });
  });

  describe('cleanup', () => {
    it('should remove old entries', () => {
      const oldTime = Date.now() - 70000; // 70 seconds ago
      const event1: UrlEvent = {
        ts: oldTime,
        app: 'Chrome',
        source: 'chrome',
        url: 'https://old.com',
        title: 'Old',
        windowId: '123',
        pid: 456
      };

      const recentTime = Date.now();
      const event2: UrlEvent = {
        ts: recentTime,
        app: 'Chrome',
        source: 'chrome',
        url: 'https://recent.com',
        title: 'Recent',
        windowId: '456',
        pid: 789
      };

      dedupe.check(event1);
      dedupe.check(event2);

      expect(dedupe.size()).toBe(2);

      dedupe.cleanup(60000); // Clean entries older than 60 seconds

      expect(dedupe.size()).toBe(1);

      // Recent event should still work
      const event3: UrlEvent = {
        ...event2,
        ts: recentTime + 100
      };
      expect(dedupe.check(event3)).toBeNull(); // Should be deduped
    });
  });

  describe('clear', () => {
    it('should clear all entries', () => {
      const event: UrlEvent = {
        ts: Date.now(),
        app: 'Chrome',
        source: 'chrome',
        url: 'https://example.com',
        title: 'Example',
        windowId: '123',
        pid: 456
      };

      dedupe.check(event);
      expect(dedupe.size()).toBe(1);

      dedupe.clear();
      expect(dedupe.size()).toBe(0);

      // Same event should now be emitted again
      expect(dedupe.check(event)).toBe(event);
    });
  });
});

