/**
 * Test suite for URLTracker
 * Ensures all URL detection methods work correctly after consolidation
 */

const URLTracker = require('../url-tracker');

describe('URLTracker', () => {
  let urlTracker;
  let mockDependencies;

  beforeEach(() => {
    // Mock all dependencies
    mockDependencies = {
      detectActiveApplication: jest.fn(),
      extractUrlFromBrowser: jest.fn(),
      detectBrowserUrl: jest.fn(),
      isBrowserApp: jest.fn((app) => {
        return ['Chrome', 'Safari', 'Firefox'].some(b => app?.includes(b));
      }),
      extractDomain: jest.fn((url) => {
        try {
          return new URL(url).hostname;
        } catch {
          return 'unknown';
        }
      }),
      processFoundUrl: jest.fn()
    };

    urlTracker = new URLTracker();
  });

  afterEach(() => {
    urlTracker.stop();
    jest.clearAllMocks();
  });

  test('should initialize with all detection methods', async () => {
    await urlTracker.initialize(mockDependencies);
    
    expect(urlTracker.isActive).toBe(true);
    expect(urlTracker.intervals).toHaveLength(3); // 3 detection methods
  });

  test('should detect browser focus changes', async () => {
    mockDependencies.detectActiveApplication
      .mockResolvedValueOnce({ name: 'TextEdit' })
      .mockResolvedValueOnce({ name: 'Google Chrome', title: 'Test Page' });
    
    mockDependencies.extractUrlFromBrowser.mockResolvedValue('https://example.com');

    await urlTracker.initialize(mockDependencies);

    // Simulate smart capture detecting browser focus
    urlTracker.lastActiveApp = 'TextEdit';
    await urlTracker.captureFromBrowser('Google Chrome', 'Test Page', 'smart-focus');

    expect(mockDependencies.extractUrlFromBrowser).toHaveBeenCalledWith('Google Chrome', 'Test Page');
    expect(mockDependencies.processFoundUrl).toHaveBeenCalled();
  });

  test('should track URL changes with throttling', async () => {
    await urlTracker.initialize(mockDependencies);

    const urlData1 = {
      url: 'https://example.com',
      browser: 'Chrome',
      domain: 'example.com'
    };

    const urlData2 = {
      url: 'https://github.com',
      browser: 'Chrome',
      domain: 'github.com'
    };

    // First URL should be processed
    await urlTracker.processUrl(urlData1);
    expect(mockDependencies.processFoundUrl).toHaveBeenCalledTimes(1);

    // Same URL within throttle window should be skipped
    await urlTracker.processUrl(urlData1);
    expect(mockDependencies.processFoundUrl).toHaveBeenCalledTimes(1);

    // Different URL should be processed
    await urlTracker.processUrl(urlData2);
    expect(mockDependencies.processFoundUrl).toHaveBeenCalledTimes(2);
  });

  test('should emit urlCaptured events', (done) => {
    urlTracker.initialize(mockDependencies);

    urlTracker.on('urlCaptured', (data) => {
      expect(data).toHaveProperty('url');
      expect(data).toHaveProperty('browser');
      expect(data).toHaveProperty('domain');
      done();
    });

    urlTracker.processUrl({
      url: 'https://test.com',
      browser: 'Safari',
      domain: 'test.com'
    });
  });

  test('should track multiple browsers separately', async () => {
    await urlTracker.initialize(mockDependencies);

    await urlTracker.processUrl({
      url: 'https://site1.com',
      browser: 'Chrome',
      domain: 'site1.com'
    });

    await urlTracker.processUrl({
      url: 'https://site2.com',
      browser: 'Safari',
      domain: 'site2.com'
    });

    const stats = urlTracker.getStats();
    expect(stats.browsersTracked).toBe(2);
  });

  test('should stop all intervals when stopped', () => {
    urlTracker.initialize(mockDependencies);
    expect(urlTracker.isActive).toBe(true);
    expect(urlTracker.intervals.length).toBeGreaterThan(0);

    urlTracker.stop();
    expect(urlTracker.isActive).toBe(false);
    expect(urlTracker.intervals).toHaveLength(0);
  });
});