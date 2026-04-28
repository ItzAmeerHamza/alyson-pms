/**
 * URL Normalization Tests
 */

import { normalizeUrlEvent, inferBrowserSource, isInternalUrl, extractDomain } from '../src/modules/url/normalize';
import { UrlEvent } from '../src/modules/url/types';

describe('URL Normalization', () => {
  describe('inferBrowserSource', () => {
    it('should detect Chrome variants', () => {
      expect(inferBrowserSource('Chrome')).toBe('chrome');
      expect(inferBrowserSource('Google Chrome')).toBe('chrome');
      expect(inferBrowserSource('com.google.Chrome')).toBe('chrome');
      expect(inferBrowserSource('CHROME')).toBe('chrome');
    });

    it('should detect Edge', () => {
      expect(inferBrowserSource('Microsoft Edge')).toBe('edge');
      expect(inferBrowserSource('Edge')).toBe('edge');
      expect(inferBrowserSource('com.microsoft.edge')).toBe('edge');
    });

    it('should detect Brave', () => {
      expect(inferBrowserSource('Brave Browser')).toBe('brave');
      expect(inferBrowserSource('Brave')).toBe('brave');
      expect(inferBrowserSource('com.brave.Browser')).toBe('brave');
    });

    it('should detect Firefox', () => {
      expect(inferBrowserSource('Firefox')).toBe('firefox');
      expect(inferBrowserSource('Mozilla Firefox')).toBe('firefox');
      expect(inferBrowserSource('org.mozilla.firefox')).toBe('firefox');
    });

    it('should detect Safari', () => {
      expect(inferBrowserSource('Safari')).toBe('safari');
      expect(inferBrowserSource('com.apple.Safari')).toBe('safari');
    });

    it('should return unknown for non-browsers', () => {
      expect(inferBrowserSource('Visual Studio Code')).toBe('unknown');
      expect(inferBrowserSource('Terminal')).toBe('unknown');
      expect(inferBrowserSource('')).toBe('unknown');
      expect(inferBrowserSource(null as any)).toBe('unknown');
    });
  });

  describe('normalizeUrlEvent', () => {
    it('should normalize valid URLs', () => {
      const event: UrlEvent = {
        ts: Date.now(),
        app: 'Chrome',
        source: 'unknown',
        url: 'https://example.com/path',
        title: 'Example Page',
        windowId: '123',
        pid: 456
      };

      const normalized = normalizeUrlEvent(event);
      expect(normalized.url).toBe('https://example.com/path');
      expect(normalized.source).toBe('chrome'); // Should infer from app
    });

    it('should handle URLs without protocol', () => {
      const event: UrlEvent = {
        ts: Date.now(),
        app: 'Chrome',
        source: 'chrome',
        url: 'example.com',
        title: 'Example',
        windowId: null,
        pid: null
      };

      const normalized = normalizeUrlEvent(event);
      expect(normalized.url).toBe('https://example.com/');
    });

    it('should handle internal URLs', () => {
      const chromeUrl = normalizeUrlEvent({
        ts: Date.now(),
        app: 'Chrome',
        source: 'chrome',
        url: 'chrome://settings',
        title: 'Settings',
        windowId: null,
        pid: null
      });
      expect(chromeUrl.url).toBe('chrome://settings');

      const aboutUrl = normalizeUrlEvent({
        ts: Date.now(),
        app: 'Firefox',
        source: 'firefox',
        url: 'about:blank',
        title: 'New Tab',
        windowId: null,
        pid: null
      });
      expect(aboutUrl.url).toBe('about:blank');
    });

    it('should handle invalid URLs', () => {
      const event: UrlEvent = {
        ts: Date.now(),
        app: 'Chrome',
        source: 'chrome',
        url: 'not a url',
        title: 'Title',
        windowId: null,
        pid: null
      };

      const normalized = normalizeUrlEvent(event);
      expect(normalized.url).toBeNull();
    });

    it('should trim whitespace', () => {
      const event: UrlEvent = {
        ts: Date.now(),
        app: '  Chrome  ',
        source: 'unknown',
        url: '  https://example.com  ',
        title: '  Example Page  ',
        windowId: null,
        pid: null
      };

      const normalized = normalizeUrlEvent(event);
      expect(normalized.app).toBe('Chrome');
      expect(normalized.url).toBe('https://example.com/');
      expect(normalized.title).toBe('Example Page');
    });

    it('should handle missing fields', () => {
      const event = {} as UrlEvent;
      const normalized = normalizeUrlEvent(event);

      expect(normalized.ts).toBeGreaterThan(0);
      expect(normalized.app).toBe('unknown');
      expect(normalized.source).toBe('unknown');
      expect(normalized.url).toBeNull();
      expect(normalized.title).toBeNull();
      expect(normalized.windowId).toBeNull();
      expect(normalized.pid).toBeNull();
    });
  });

  describe('isInternalUrl', () => {
    it('should identify internal URLs', () => {
      expect(isInternalUrl('chrome://settings')).toBe(true);
      expect(isInternalUrl('edge://flags')).toBe(true);
      expect(isInternalUrl('about:blank')).toBe(true);
      expect(isInternalUrl('file:///home/user/doc.pdf')).toBe(true);
    });

    it('should identify regular URLs as non-internal', () => {
      expect(isInternalUrl('https://example.com')).toBe(false);
      expect(isInternalUrl('http://localhost:3000')).toBe(false);
    });

    it('should handle null/empty URLs', () => {
      expect(isInternalUrl(null)).toBe(true);
      expect(isInternalUrl('')).toBe(true);
    });
  });

  describe('extractDomain', () => {
    it('should extract domain from URLs', () => {
      expect(extractDomain('https://example.com/path')).toBe('example.com');
      expect(extractDomain('http://sub.example.com:8080/path')).toBe('sub.example.com');
      expect(extractDomain('https://localhost:3000')).toBe('localhost');
    });

    it('should handle invalid URLs', () => {
      expect(extractDomain('not a url')).toBeNull();
      expect(extractDomain(null)).toBeNull();
      expect(extractDomain('')).toBeNull();
    });
  });
});

