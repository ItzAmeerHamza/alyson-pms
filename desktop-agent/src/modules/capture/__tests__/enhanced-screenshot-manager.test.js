/**
 * Unit Tests for EnhancedScreenshotManager
 * Tests screenshot management functionality
 */

const EnhancedScreenshotManager = require('../enhanced-screenshot-manager');

describe('EnhancedScreenshotManager', () => {
  let screenshotManager;
  let mockConfig;
  let mockElectronModules;

  beforeEach(() => {
    mockConfig = {
      user_id: 'test-user-123',
      project_id: 'test-project-456'
    };

    mockElectronModules = {
      BrowserWindow: jest.fn(),
      desktopCapturer: {
        getSources: jest.fn()
      }
    };

    screenshotManager = new EnhancedScreenshotManager(mockConfig, mockElectronModules);
    jest.clearAllMocks();
  });

  afterEach(() => {
    screenshotManager.cleanup();
  });

  describe('initialization', () => {
    it('should initialize with default settings', () => {
      expect(screenshotManager.config).toBe(mockConfig);
      expect(screenshotManager.SCREENSHOT_INTERVAL).toBe(60);
      expect(screenshotManager.isTracking).toBe(false);
    });

    it('should register with cleanup registry', () => {
      const cleanupRegistry = require('../../core/cleanup-registry');
      const manager = new EnhancedScreenshotManager(mockConfig, mockElectronModules);
      const registered = [...cleanupRegistry.resources].some(
        (resource) => resource?.name === 'enhancedScreenshotManager' && typeof resource.cleanup === 'function',
      );
      expect(registered).toBe(true);
      manager.cleanup();
    });

    it('applies a workspace 3-every-20 schedule', () => {
      const changed = screenshotManager.applyWorkspaceSchedule({
        screenshot_count_per_window: 3,
        screenshot_window_minutes: 20,
      });
      expect(changed).toBe(true);
      expect(screenshotManager.windowShots).toBe(3);
      expect(screenshotManager.windowDurationMs).toBe(20 * 60 * 1000);
    });
  });

  describe('screenshot capture control', () => {
    it('should start screenshot capture', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      screenshotManager.isTracking = true;
      screenshotManager.currentSession = { id: 'sess-1' };

      screenshotManager.startScreenshotCapture();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('random window scheduling')
      );

      consoleSpy.mockRestore();
    });

    it('should stop screenshot capture', () => {
      screenshotManager.screenshotInterval = setInterval(() => {}, 1000);
      screenshotManager.screenshotTimeout = setTimeout(() => {}, 1000);

      screenshotManager.stopScreenshotCapture();

      expect(screenshotManager.screenshotInterval).toBeNull();
      expect(screenshotManager.screenshotTimeout).toBeNull();
    });
  });

  describe('platform screenshot options', () => {
    it('should return macOS options', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      const options = screenshotManager.getPlatformScreenshotOptions();

      expect(options).toEqual({
        format: 'png',
        stitchAllDisplays: true
      });
    });

    it('should return Windows options', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const options = screenshotManager.getPlatformScreenshotOptions();

      expect(options).toEqual({
        format: 'png',
        stitchAllDisplays: true
      });
    });

    it('should return Linux options', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });

      const options = screenshotManager.getPlatformScreenshotOptions();

      expect(options).toEqual({
        format: 'png',
        stitchAllDisplays: true,
        screen: ':0.0'
      });
    });
  });

  describe('screenshot conditions', () => {
    it('should allow health check screenshots', () => {
      const canTake = screenshotManager.canTakeScreenshot(true);
      expect(canTake).toBe(true);
    });

    it('should check tracking state for regular screenshots', () => {
      screenshotManager.isTracking = false;
      const canTake = screenshotManager.canTakeScreenshot(false);
      expect(canTake).toBe(false);
    });

    it('should allow screenshots when tracking', () => {
      screenshotManager.isTracking = true;
      screenshotManager.currentSession = { id: 'test-session' };
      const canTake = screenshotManager.canTakeScreenshot(false);
      expect(canTake).toBe(true);
    });
  });

  describe('timer calculations', () => {
    it('should calculate seconds to next screenshot', () => {
      const futureTime = Date.now() + 30000; // 30 seconds
      screenshotManager.nextScreenshotTime = futureTime;

      const seconds = screenshotManager.calculateSecondsToNextScreenshot();
      expect(seconds).toBeGreaterThan(25);
      expect(seconds).toBeLessThanOrEqual(30);
    });

    it('should return 0 if no next screenshot time', () => {
      screenshotManager.nextScreenshotTime = null;
      const seconds = screenshotManager.calculateSecondsToNextScreenshot();
      expect(seconds).toBe(0);
    });
  });

  describe('screenshot status', () => {
    it('should return complete status', () => {
      screenshotManager.isTracking = true;
      screenshotManager.currentSession = { id: 'test' };
      screenshotManager.screenshotsPaused = false;

      const status = screenshotManager.getScreenshotStatus();

      expect(status).toMatchObject({
        isActive: false, // No interval set
        isPaused: false,
        canTakeScreenshot: true,
        isTracking: true,
        hasSession: true
      });
    });
  });

  describe('timer management', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should start timer updates', () => {
      screenshotManager.startScreenshotTimerUpdates();
      expect(screenshotManager.screenshotTimerInterval).toBeDefined();
    });

    it('should stop timer updates', () => {
      screenshotManager.startScreenshotTimerUpdates();
      screenshotManager.stopScreenshotTimerUpdates();
      expect(screenshotManager.screenshotTimerInterval).toBeNull();
    });
  });

  describe('pause and resume', () => {
    it('should pause screenshots', () => {
      screenshotManager.pauseScreenshotsOnly();
      expect(screenshotManager.screenshotsPaused).toBe(true);
    });

    it('should resume screenshots', () => {
      screenshotManager.screenshotsPaused = true;
      screenshotManager.resumeScreenshotsOnly();
      expect(screenshotManager.screenshotsPaused).toBe(false);
    });
  });
});