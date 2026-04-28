/**
 * Screenshot Manager Test Suite
 * Tests screenshot capture, redaction, and multi-display support
 */

const ScreenshotManager = require('../src/modules/screenshot-manager');

describe('ScreenshotManager', () => {
  let screenshotManager;
  let mockConfig;
  let mockDesktopCapturer;
  let mockSyncManager;

  beforeEach(() => {
    // Mock config
    mockConfig = {
      user_id: 'test-user',
      currentTimeLogId: 'test-timelog-123',
      currentProjectId: 'test-project',
      screenshotRedaction: {
        enabled: false
      }
    };

    // Mock desktop capturer
    mockDesktopCapturer = {
      getSources: jest.fn().mockResolvedValue([
        {
          id: 'screen:0:0',
          name: 'Primary Display',
          thumbnail: {
            toPNG: jest.fn().mockReturnValue(Buffer.from('fake-png-data'))
          }
        },
        {
          id: 'screen:1:0',
          name: 'Secondary Display',
          thumbnail: {
            toPNG: jest.fn().mockReturnValue(Buffer.from('fake-png-data-2'))
          }
        }
      ])
    };

    // Mock sync manager
    mockSyncManager = {
      addScreenshots: jest.fn().mockResolvedValue(true)
    };

    // Mock globals
    global.desktopCapturer = mockDesktopCapturer;
    global.systemPreferences = {
      getMediaAccessStatus: jest.fn().mockReturnValue('granted')
    };

    screenshotManager = new ScreenshotManager({
      configManager: {
        getConfig: jest.fn().mockReturnValue(mockConfig)
      },
      syncManager: mockSyncManager
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processScreenshot', () => {
    it('should apply redaction when enabled', async () => {
      // Enable redaction
      mockConfig.screenshotRedaction.enabled = true;
      
      // Mock redaction function
      screenshotManager.applyRedaction = jest.fn().mockResolvedValue(Buffer.from('redacted-png'));

      const buffer = Buffer.from('original-png');
      await screenshotManager.processScreenshot(buffer);

      expect(screenshotManager.applyRedaction).toHaveBeenCalledWith(
        buffer,
        mockConfig.screenshotRedaction
      );
    });

    it('should continue without redaction when disabled', async () => {
      screenshotManager.applyRedaction = jest.fn();

      const buffer = Buffer.from('original-png');
      await screenshotManager.processScreenshot(buffer);

      expect(screenshotManager.applyRedaction).not.toHaveBeenCalled();
    });

    it('should handle redaction failure gracefully', async () => {
      mockConfig.screenshotRedaction.enabled = true;
      screenshotManager.applyRedaction = jest.fn().mockRejectedValue(new Error('Redaction failed'));

      const buffer = Buffer.from('original-png');
      
      // Should not throw
      await expect(screenshotManager.processScreenshot(buffer)).resolves.not.toThrow();
    });
  });

  describe('getTargetScreens', () => {
    it('should return primary display only by default', () => {
      const sources = [
        { id: 'screen:0:0', name: 'Primary' },
        { id: 'screen:1:0', name: 'Secondary' }
      ];

      const targets = screenshotManager.getTargetScreens(sources);

      expect(targets).toHaveLength(1);
      expect(targets[0]).toBe(sources[0]);
    });

    it('should handle empty sources array', () => {
      const targets = screenshotManager.getTargetScreens([]);
      expect(targets).toEqual([]);
    });

    it('should handle null/undefined sources', () => {
      expect(screenshotManager.getTargetScreens(null)).toEqual([]);
      expect(screenshotManager.getTargetScreens(undefined)).toEqual([]);
    });
  });

  describe('captureScreenshot', () => {
    it('should use primary display when multiple available', async () => {
      const result = await screenshotManager.captureScreenshot();

      expect(mockDesktopCapturer.getSources).toHaveBeenCalledWith({
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 }
      });
      
      // Verify it captured from first source
      expect(result).toBeTruthy();
      expect(result.buffer).toBeDefined();
    });

    it('should log selected display indices', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      
      await screenshotManager.captureScreenshot();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SCREENSHOT] Selected display indices: [0] of 2')
      );
    });

    it('should fall back to screenshot-desktop on permission denied', async () => {
      // Mock permission denied
      global.systemPreferences.getMediaAccessStatus.mockReturnValue('denied');
      
      // Mock screenshot-desktop
      screenshotManager.screenshot = jest.fn().mockResolvedValue(Buffer.from('fallback-png'));

      const result = await screenshotManager.captureScreenshot();

      expect(screenshotManager.screenshot).toHaveBeenCalled();
      expect(result).toBeTruthy();
    });

    it('should handle capture failure', async () => {
      mockDesktopCapturer.getSources.mockRejectedValue(new Error('Capture failed'));
      screenshotManager.screenshot = jest.fn().mockRejectedValue(new Error('Fallback also failed'));

      const result = await screenshotManager.captureScreenshot();

      expect(result).toBe(false);
      expect(screenshotManager.consecutiveScreenshotFailures).toBe(1);
    });
  });

  describe('tracking state', () => {
    it('should update tracking state correctly', () => {
      const session = {
        id: 'session-123',
        user_id: 'user-123',
        project_id: 'project-123'
      };

      screenshotManager.updateTrackingState(true, session);

      expect(screenshotManager.isTracking).toBe(true);
      expect(screenshotManager.currentSession).toBe(session);
    });

    it('should clear state on stop', () => {
      screenshotManager.updateTrackingState(true, { id: 'test' });
      screenshotManager.updateTrackingState(false, null);

      expect(screenshotManager.isTracking).toBe(false);
      expect(screenshotManager.currentSession).toBeNull();
    });
  });
});
