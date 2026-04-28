/**
 * Browser URL Manager Test Suite
 * Tests URL capture, deduplication, and redaction
 */

const BrowserUrlManager = require('../src/modules/capture/browser-url-manager');

describe('BrowserUrlManager', () => {
  let urlManager;
  let mockConfig;
  let mockSyncManager;
  let mockMainWindow;

  beforeEach(() => {
    // Mock config
    mockConfig = {
      user_id: 'test-user',
      project_id: 'test-project'
    };

    // Mock sync manager
    mockSyncManager = {
      addUrlLogs: jest.fn().mockResolvedValue(true)
    };

    // Mock main window
    mockMainWindow = {
      isDestroyed: jest.fn().mockReturnValue(false),
      webContents: {
        send: jest.fn()
      }
    };

    // Clear throttle maps
    if (global.urlThrottleMap) {
      global.urlThrottleMap.clear();
    }

    urlManager = new BrowserUrlManager(mockConfig, { syncManager: mockSyncManager });
    urlManager.initialize({
      mainWindow: mockMainWindow,
      isTracking: true,
      currentTimeLogId: 'test-timelog-123'
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('redactUrl', () => {
    it('should remove query parameters', () => {
      const url = 'https://example.com/page?user=123&token=secret';
      const redacted = urlManager.redactUrl(url);
      
      expect(redacted).toBe('https://example.com/page');
      expect(redacted).not.toContain('user=123');
      expect(redacted).not.toContain('token=secret');
    });

    it('should remove hash fragments', () => {
      const url = 'https://example.com/page#section-1';
      const redacted = urlManager.redactUrl(url);
      
      expect(redacted).toBe('https://example.com/page');
      expect(redacted).not.toContain('#section-1');
    });

    it('should remove both query and hash', () => {
      const url = 'https://example.com/page?id=123#content';
      const redacted = urlManager.redactUrl(url);
      
      expect(redacted).toBe('https://example.com/page');
    });

    it('should handle invalid URLs gracefully', () => {
      const invalidUrl = 'not-a-valid-url';
      const result = urlManager.redactUrl(invalidUrl);
      
      expect(result).toBe(invalidUrl); // Returns original on error
    });
  });

  describe('processFoundUrl', () => {
    it('should apply redaction before saving', async () => {
      const urlData = {
        url: 'https://example.com/private?token=abc123#section',
        browser: 'Chrome',
        domain: 'example.com',
        title: 'Example Page'
      };

      await urlManager.processFoundUrl(urlData);

      expect(mockSyncManager.addUrlLogs).toHaveBeenCalledWith([
        expect.objectContaining({
          url: 'https://example.com/private',
          site_url: 'https://example.com/private',
          domain: 'example.com'
        })
      ]);
    });

    it('should dedupe URLs within throttle window', async () => {
      const urlData = {
        url: 'https://example.com/page',
        browser: 'Chrome',
        domain: 'example.com'
      };

      // First call should succeed
      await urlManager.processFoundUrl(urlData);
      expect(mockSyncManager.addUrlLogs).toHaveBeenCalledTimes(1);

      // Second call within throttle window should be blocked
      await urlManager.processFoundUrl(urlData);
      expect(mockSyncManager.addUrlLogs).toHaveBeenCalledTimes(1); // Still 1
    });

    it('should respect different throttle windows for different sources', async () => {
      const urlData = {
        url: 'https://example.com/page',
        browser: 'Chrome',
        domain: 'example.com'
      };

      // Normal capture
      await urlManager.processFoundUrl(urlData);
      
      // Tab monitor capture (shorter throttle)
      await urlManager.processFoundUrl({ ...urlData, fromTabMonitor: true });
      
      // Background capture (longer throttle)
      await urlManager.processFoundUrl({ ...urlData, fromBackground: true });

      // All three should have different throttle windows
      expect(mockSyncManager.addUrlLogs).toHaveBeenCalledTimes(3);
    });

    it('should not save URL when no active time log', async () => {
      urlManager.currentTimeLogId = null;

      const urlData = {
        url: 'https://example.com/page',
        browser: 'Chrome'
      };

      await urlManager.processFoundUrl(urlData);

      expect(mockSyncManager.addUrlLogs).not.toHaveBeenCalled();
      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('url-detected', expect.any(Object));
    });
  });

  describe('state synchronization', () => {
    it('should sync tracking state periodically', () => {
      jest.useFakeTimers();
      
      // Start with no time log
      urlManager.currentTimeLogId = null;
      global.currentTimeLogId = 'global-timelog-123';
      global.isTracking = true;

      // Trigger state sync
      jest.advanceTimersByTime(2100); // Past 2s interval

      expect(urlManager.currentTimeLogId).toBe('global-timelog-123');
      
      jest.useRealTimers();
    });
  });
});
