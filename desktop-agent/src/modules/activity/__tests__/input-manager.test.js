/**
 * Test suite for UnifiedInputManager
 * Ensures all detection methods work correctly after consolidation
 */

const UnifiedInputManager = require('../input-manager');

describe('UnifiedInputManager', () => {
  let inputManager;
  let mockElectronModules;

  beforeEach(() => {
    // Mock Electron modules
    mockElectronModules = {
      powerMonitor: {
        on: jest.fn(),
        getSystemIdleTime: jest.fn(() => 0)
      },
      screen: {
        getCursorScreenPoint: jest.fn(() => ({ x: 100, y: 100 }))
      }
    };

    inputManager = new UnifiedInputManager();
  });

  afterEach(() => {
    inputManager.stop();
  });

  test('should initialize with all detection methods', async () => {
    await inputManager.initialize(mockElectronModules);
    
    expect(inputManager.isActive).toBe(true);
    expect(inputManager.detectionMethods.size).toBeGreaterThan(0);
  });

  test('should emit mouseClick events', (done) => {
    inputManager.on('mouseClick', (data) => {
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('method');
      expect(data.total).toBe(1);
      done();
    });

    inputManager.recordActivity('click', 'test-method');
  });

  test('should emit keyPress events', (done) => {
    inputManager.on('keyPress', (data) => {
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('method');
      expect(data.total).toBe(1);
      done();
    });

    inputManager.recordActivity('key', 'test-method');
  });

  test('should emit mouseMovement events', (done) => {
    inputManager.on('mouseMovement', (data) => {
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('method');
      expect(data.total).toBe(1);
      done();
    });

    inputManager.recordActivity('move', 'test-method');
  });

  test('should track stats correctly', () => {
    inputManager.recordActivity('click', 'test');
    inputManager.recordActivity('click', 'test');
    inputManager.recordActivity('key', 'test');
    inputManager.recordActivity('move', 'test');

    const stats = inputManager.getStats();
    expect(stats.mouseClicks).toBe(2);
    expect(stats.keystrokes).toBe(1);
    expect(stats.mouseMovements).toBe(1);
  });

  test('should stop all detection when stopped', () => {
    inputManager.initialize(mockElectronModules);
    expect(inputManager.isActive).toBe(true);

    inputManager.stop();
    expect(inputManager.isActive).toBe(false);
    expect(inputManager.intervals).toHaveLength(0);
  });
});